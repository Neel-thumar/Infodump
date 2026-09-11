## TRY THIS ON YOUR MACHINE

**Cost flags read carefully.** A `db.t4g.micro` single-AZ instance with 20 GB of storage is **free tier eligible for the first 12 months** of a new account; outside that it's roughly 0.016 USD/hour plus storage, so about 12–15 USD/month if left running. **Multi-AZ and Aurora are not free tier.** Exercise 5 is optional and flagged separately. Teardown at the end — do not skip it.

Creation takes 5–10 minutes. Start it, read something, come back.

### 1. Create an instance and find the walls

```bash
export AWS_DEFAULT_REGION=us-east-1

# Generate a password and keep it out of your shell history
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
echo "$DB_PASS" > ~/.volume6-dbpass
chmod 600 ~/.volume6-dbpass

aws rds create-db-instance \
  --db-instance-identifier volume6-lab \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --allocated-storage 20 \
  --storage-type gp3 \
  --master-username labadmin \
  --master-user-password "$DB_PASS" \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-publicly-accessible \
  --query "DBInstance.{Id:DBInstanceIdentifier,Status:DBInstanceStatus}"

aws rds wait db-instance-available --db-instance-identifier volume6-lab
echo "ready"
```

Now try the things you can't do:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=volume6-lab" \
  --query "Reservations[].Instances[].InstanceId" --output text
```

**What to expect:** nothing. The database runs on an EC2 instance somewhere, and it is not in your account. You cannot see it, SSH to it, or attach anything to it.

**Why it's interesting:** this is the boundary of "managed" made concrete. Everything you learned in Volume 4 about instances applies to this database, and none of it is available to you. That's the trade. Note also that `--storage-encrypted` was set at creation — the one flag that cannot be added later without a migration.

### 2. Watch a static parameter refuse to apply

```bash
aws rds create-db-parameter-group \
  --db-parameter-group-name volume6-params \
  --db-parameter-group-family postgres16 \
  --description "volume 6 lab"

# max_connections is static - requires reboot
aws rds modify-db-parameter-group \
  --db-parameter-group-name volume6-params \
  --parameters "ParameterName=max_connections,ParameterValue=150,ApplyMethod=pending-reboot"

aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --db-parameter-group-name volume6-params --apply-immediately

sleep 30
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].DBParameterGroups" --output json
```

**What to expect:** the parameter group is attached with status `pending-reboot`, not `in-sync`.

*(If your engine version isn't `postgres16`, run `aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[].DBParameterGroupFamily" --output text | tr '\t' '\n' | sort -u` and substitute.)*

**Why it's interesting:** the setting is recorded and not applied. Nothing errors. Nothing warns you. This is the shape of the bug where someone changes a parameter, tests, sees no effect, and concludes the parameter doesn't work — when in fact it's queued behind a reboot they never performed.

### 3. Look at the endpoint that makes failover work

```bash
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].Endpoint.Address" --output text)
echo "Endpoint: $ENDPOINT"

dig +noall +answer $ENDPOINT
dig $ENDPOINT | grep -A2 "ANSWER SECTION"
```

**What to expect:** a CNAME chain ending at an A record, with a **very low TTL** — typically around 5 seconds.

**Why it's interesting:** that five-second TTL is the entire failover mechanism. AWS doesn't move an IP address; it repoints a name. Which means your failover time is *bounded below* by how fast your client re-resolves DNS — and a client that caches forever will never recover, no matter how well AWS does its job. Now go and check your application's DNS cache settings. That's the actual homework here.

### 4. Find your real recovery window

```bash
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{Earliest:EarliestRestorableTime,Latest:LatestRestorableTime,Retention:BackupRetentionPeriod,Window:PreferredBackupWindow}" \
  --output table
```

**What to expect:** an earliest and latest restorable time, typically a few minutes apart on a new instance, widening to your full retention period over the coming days.

Now take a manual snapshot and note the difference in lifecycle:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier volume6-lab \
  --db-snapshot-identifier volume6-manual-snap

aws rds wait db-snapshot-completed --db-snapshot-identifier volume6-manual-snap

aws rds describe-db-snapshots --db-instance-identifier volume6-lab \
  --query "DBSnapshots[].{Id:DBSnapshotIdentifier,Type:SnapshotType,Created:SnapshotCreateTime}" \
  --output table
```

**What to expect:** your manual snapshot with type `manual`, alongside automated ones with type `automated`.

**Why it's interesting:** delete this instance and the `automated` snapshots go with it. The `manual` one survives. That distinction is the difference between "we can recover from an accidental instance deletion" and "we cannot," and almost nobody knows which they have until they need it.

**The homework this exercise is really setting:** restore that snapshot to a new instance and **time it**. It costs a little (a second instance for however long it takes) and it will teach you your real RTO. Most people never do this until the day it matters.

### 5. Trigger a real failover — optional, costs money

**Cost flag: this converts the instance to Multi-AZ, roughly doubling its hourly cost, and it is not free tier. Expect a few cents for a short test. Convert back or delete immediately after.**

```bash
aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --multi-az --apply-immediately
aws rds wait db-instance-available --db-instance-identifier volume6-lab

# Note the current AZ
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{AZ:AvailabilityZone,Secondary:SecondaryAvailabilityZone}" --output table

date
aws rds reboot-db-instance --db-instance-identifier volume6-lab --force-failover
aws rds wait db-instance-available --db-instance-identifier volume6-lab
date

aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{AZ:AvailabilityZone,Secondary:SecondaryAvailabilityZone}" --output table

# Watch the DNS answer change
dig +noall +answer $ENDPOINT
```

**What to expect:** the primary and secondary AZs swap places. The endpoint name is unchanged; the address it resolves to is different. Time the whole thing.

**Why it's interesting:** this is the one command that turns "we have Multi-AZ" from a configuration claim into a tested fact. Run this in staging on a real application, with traffic flowing, and watch what your connection pool does. Whatever you learn will be more valuable than anything in this volume.

**Revert to single-AZ immediately if you're not deleting yet:**
```bash
aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --no-multi-az --apply-immediately
```

### Teardown — run this

```bash
aws rds delete-db-instance --db-instance-identifier volume6-lab \
  --skip-final-snapshot --delete-automated-backups

aws rds wait db-instance-deleted --db-instance-identifier volume6-lab

aws rds delete-db-snapshot --db-snapshot-identifier volume6-manual-snap
aws rds delete-db-parameter-group --db-parameter-group-name volume6-params

rm -f ~/.volume6-dbpass

echo "Remaining RDS instances:"
aws rds describe-db-instances --query "DBInstances[].DBInstanceIdentifier" --output text
echo "Remaining snapshots:"
aws rds describe-db-snapshots --snapshot-type manual --query "DBSnapshots[].DBSnapshotIdentifier" --output text
```

Both should be empty. **Check the snapshot list especially** — manual snapshots survive instance deletion by design, which is exactly the useful behaviour from exercise 4 and exactly the thing that quietly bills you if you forget.

---


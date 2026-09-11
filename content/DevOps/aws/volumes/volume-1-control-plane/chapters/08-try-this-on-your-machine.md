## TRY THIS ON YOUR MACHINE

All five are free-tier safe and read-only except where noted. You need the CLI configured from the Setup section.

### 1. Watch the CLI sign a request in front of you

```bash
aws sts get-caller-identity --debug 2>&1 | grep -i -A2 "Signature\|CanonicalRequest\|StringToSign" | head -40
```

**What to expect:** debug output showing the canonical request, the string to sign, and the resulting signature — the exact structures described earlier in this volume.

**Why it's interesting:** you're watching SigV4 happen. Look for the credential scope line containing the date, region, and service. That string is the reason your signature can't be replayed against a different Region.

**Cleanup:** none.

### 2. Prove the AZ name shuffle is real

```bash
aws ec2 describe-availability-zones --region us-east-1 \
  --query "AvailabilityZones[].{Name:ZoneName,Id:ZoneId,State:State}" \
  --output table
```

**What to expect:** a table mapping names like `us-east-1a` to IDs like `use1-az4`.

**Why it's interesting:** the mapping in *your* account is almost certainly different from anyone else's. This is the randomization described earlier, made visible. If you ever share an AZ reference with another account — a shared VPC, a partner integration — the name is meaningless and the ID is what counts.

**Cleanup:** none.

### 3. Measure the size of AWS, then measure how far away it is

```bash
aws ec2 describe-regions --all-regions \
  --query "Regions[].{Region:RegionName,Status:OptInStatus}" --output table
```

Then pick three and time them:

```bash
for r in us-east-1 eu-west-1 ap-southeast-2; do
  echo -n "$r: "
  /usr/bin/time -f "%e s" aws ec2 describe-regions --region $r > /dev/null
done
```

*(On macOS, `/usr/bin/time -f` isn't supported — use `time aws ec2 describe-regions --region $r > /dev/null` instead, run one at a time.)*

**What to expect:** a full list of Regions including ones your account hasn't opted into, then noticeably different round-trip times.

**Why it's interesting:** you're measuring the speed of light plus routing, per Region. That number is the floor on latency for anything you deploy there, and no amount of optimization gets under it. It's also why "just use us-east-1 because it's cheapest" is a real trade-off, not a free lunch.

**Cleanup:** none.

### 4. Break a signature on purpose

```bash
aws ec2 describe-regions --region us-east-1
AWS_SECRET_ACCESS_KEY="deliberatelywrongsecretvalue" aws ec2 describe-regions --region us-east-1
```

**What to expect:** the first succeeds. The second fails with `AuthFailure` or a signature-related error — and note it fails at the *signature* stage, not at a permissions stage.

**Why it's interesting:** it separates the two layers in your head. Authentication (is this signature valid?) happens before authorization (is this identity allowed?). Volume 2 lives entirely in the second layer, and mixing them up is the source of endless confused debugging.

**Cleanup:** none — the environment variable only applied to that one command.

### 5. Find something global and something regional

```bash
aws iam list-account-aliases --region ap-southeast-2
aws s3api list-buckets --query "Buckets[].Name" --output table
```

**What to expect:** the IAM call works regardless of what Region you name. The bucket list returns all your buckets across all Regions (you may have none yet — that's fine).

**Why it's interesting:** IAM is global, so the Region argument is essentially ignored — and behind the scenes, the write path for IAM is concentrated in us-east-1 regardless of where you are. S3's bucket namespace is global while the buckets themselves are regional. These inconsistencies are historical accidents, not design elegance, and knowing which services are which saves you real time.

**Cleanup:** none.

### Optional, costs nothing, takes two minutes: verify your budget alarm exists

```bash
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)
```

You should see the budget from Step 4 of setup. If you get an empty list, go back and create it. Seriously.

---


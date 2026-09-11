## TRY THIS ON YOUR MACHINE

Five final exercises. The first three are the ones you'd actually run on day one at a new job. All are free and read-only except the last.

### 1. The inherited account audit

Everything from this guide, in one script. This is what you run when someone hands you an AWS account and says "look after this."

```bash
export AWS_DEFAULT_REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "=== AUDIT OF ACCOUNT $ACCOUNT ==="

echo; echo "--- root user MFA and old keys (Volume 1, 2) ---"
aws iam get-account-summary --query "SummaryMap.AccountMFAEnabled"
aws iam generate-credential-report > /dev/null; sleep 5
aws iam get-credential-report --query Content --output text | base64 -d | \
  awk -F, 'NR==1 || $4=="false" {print $1", mfa:"$8", key1_last_used:"$11}' | head -20

echo; echo "--- security groups open to the world (Volume 3) ---"
aws ec2 describe-security-groups \
  --filters Name=ip-permission.cidr,Values=0.0.0.0/0 \
  --query "SecurityGroups[].{Group:GroupId,Name:GroupName}" --output text

echo; echo "--- public S3 buckets and account-level block (Volume 5) ---"
aws s3control get-public-access-block --account-id $ACCOUNT 2>/dev/null \
  || echo "NO ACCOUNT-LEVEL BLOCK PUBLIC ACCESS"

echo; echo "--- CloudTrail and whether data events are on (Volume 8) ---"
aws cloudtrail describe-trails \
  --query "trailList[].{Name:Name,MultiRegion:IsMultiRegionTrail,Validation:LogFileValidationEnabled}" \
  --output table

echo; echo "--- log groups with no retention (Volume 8) ---"
aws logs describe-log-groups \
  --query "length(logGroups[?!not_null(retentionInDays)])"

echo; echo "--- gp2 volumes that should be gp3 (Volume 4) ---"
aws ec2 describe-volumes --filters Name=volume-type,Values=gp2 \
  --query "length(Volumes)"

echo; echo "--- IMDSv1 still permitted (Volume 2) ---"
aws ec2 describe-instances \
  --query "Reservations[].Instances[?MetadataOptions.HttpTokens=='optional'].InstanceId" \
  --output text

echo; echo "--- budgets configured (Volume 1) ---"
aws budgets describe-budgets --account-id $ACCOUNT \
  --query "length(Budgets)" 2>/dev/null || echo "NONE"
```

**What to expect:** on your practice account, mostly clean. On a real inherited account, a to-do list.

**Why it's interesting:** every check maps to a specific volume and a specific incident. This is the whole guide compressed into something operational. Keep it.

### 2. Find what you left running

Orphaned resources are how learning accounts become expensive accounts.

```bash
for region in $(aws ec2 describe-regions --query "Regions[].RegionName" --output text); do
  found=""
  inst=$(aws ec2 describe-instances --region $region \
    --filters Name=instance-state-name,Values=running \
    --query "Reservations[].Instances[].InstanceId" --output text 2>/dev/null)
  vol=$(aws ec2 describe-volumes --region $region \
    --filters Name=status,Values=available \
    --query "Volumes[].VolumeId" --output text 2>/dev/null)
  nat=$(aws ec2 describe-nat-gateways --region $region \
    --filter Name=state,Values=available \
    --query "NatGateways[].NatGatewayId" --output text 2>/dev/null)
  eip=$(aws ec2 describe-addresses --region $region \
    --query "Addresses[?AssociationId==null].PublicIp" --output text 2>/dev/null)
  lb=$(aws elbv2 describe-load-balancers --region $region \
    --query "LoadBalancers[].LoadBalancerName" --output text 2>/dev/null)
  rds=$(aws rds describe-db-instances --region $region \
    --query "DBInstances[].DBInstanceIdentifier" --output text 2>/dev/null)

  [ -n "$inst$vol$nat$eip$lb$rds" ] && {
    echo "=== $region ==="
    [ -n "$inst" ] && echo "  running instances: $inst"
    [ -n "$vol" ]  && echo "  UNATTACHED volumes (billing): $vol"
    [ -n "$nat" ]  && echo "  NAT gateways (~\$32/mo each): $nat"
    [ -n "$eip" ]  && echo "  UNASSOCIATED elastic IPs (billing): $eip"
    [ -n "$lb" ]   && echo "  load balancers (~\$17/mo each): $lb"
    [ -n "$rds" ]  && echo "  RDS instances: $rds"
  }
done
echo "scan complete"
```

**What to expect:** ideally nothing. If the teardowns all worked, this prints region headers and stops.

**Why it's interesting:** unattached EBS volumes and unassociated Elastic IPs both bill you while doing nothing — they're the two most common invisible charges in any account. NAT Gateways and load balancers are the two most expensive things easy to forget. Run this monthly.

### 3. Read a postmortem properly

Not a command — a method, and the most valuable habit this guide can leave you with.

Pick one you haven't read. AWS's own post-event summaries, Cloudflare's blog, GitHub's availability reports, Google's incident reports. For each, answer:

1. **What was the trigger?** Usually small and boring.
2. **What amplified it?** This is where the engineering is. Feedback loops, retry storms, shared resources.
3. **Which plane failed — control or data?** (Volume 1.)
4. **What was the blast radius, and why was it that size?** (Volume 5.)
5. **What capability was missing during the incident that existed on paper?** (Volume 8.)
6. **Does my system have the same shape?**

**Why it's interesting:** after five or six of these you start recognizing the patterns before the postmortem names them. That recognition is what separates people who operate systems from people who configure them, and it's not obtainable any other way.

### 4. Build one thing, end to end, as code

The capstone. Take something small and build it entirely in CloudFormation, CDK, Terraform, or OpenTofu — no console clicks.

A reasonable target: **a static site on S3 with CloudFront in front of it, the bucket fully private via Origin Access Control, a Route 53 record if you own a domain, and an ACM certificate.** Volume 5 covered every piece.

Requirements to set yourself:

- Nothing created by hand. If you clicked it, delete it and write it.
- The bucket is never public. Block Public Access stays on.
- Everything tagged (`Environment`, `ManagedBy`, `Project`).
- A single command destroys all of it.
- A README explaining *why*, not just what — including one trade-off you made and rejected.

**Cost:** effectively nothing. S3 storage for a few small files, CloudFront's free tier is generous, ACM certificates are free, Route 53 is roughly $0.50/month per hosted zone if you use one.

**Why it's interesting:** this is the artifact that gets you interviews. Not because a static site is impressive — because the README explaining why you chose OAC over a public bucket, and what it cost you, demonstrates exactly the thinking that's hard to find.

**Cleanup:** your own destroy command. That it works is part of the exercise.

### 5. Turn on the things that watch while you're not looking

Small ongoing cost, worth it. These are the settings you'd want on any account you care about.

```bash
# Cost anomaly detection - free, catches runaway spend in hours not weeks
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName": "account-wide",
  "MonitorType": "DIMENSIONAL",
  "MonitorDimension": "SERVICE"
}' 2>/dev/null || echo "monitor may already exist"

# Account-level Block Public Access - free, overrides every bucket policy
aws s3control put-public-access-block --account-id $ACCOUNT \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# IAM Access Analyzer - free, reports anything reachable from outside the account
aws accessanalyzer create-analyzer --analyzer-name account-analyzer --type ACCOUNT 2>/dev/null \
  || echo "analyzer may already exist"

# GuardDuty - NOT free, but has a 30-day trial. Uncomment deliberately.
# aws guardduty create-detector --enable
```

**What to expect:** all succeed or report they already exist.

**Why it's interesting:** the first three are free and each closes a failure mode from this guide — the runaway Lambda from Volume 7, the open bucket epidemic from Volume 5, and the cross-account exposure from Volume 2. GuardDuty is the fourth and it does cost money after the trial; whether it's worth it depends on what's in the account, and that's a judgment you're now equipped to make.

**Cleanup:** leave them on. That's the point.

---


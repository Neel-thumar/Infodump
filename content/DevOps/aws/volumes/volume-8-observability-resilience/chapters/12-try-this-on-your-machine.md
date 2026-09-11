## TRY THIS ON YOUR MACHINE

All five are **free**. Exercise 4 runs a Logs Insights query, charged per GB scanned — on a personal account that's fractions of a cent. Nothing here creates persistent billable resources, and exercise 1 will probably *save* you money.

### 1. Find the money leaking out of your log groups

```bash
export AWS_DEFAULT_REGION=us-east-1

echo "=== log groups with NO retention policy ==="
for region in us-east-1 us-west-2 eu-west-1; do
  aws logs describe-log-groups --region $region \
    --query "logGroups[?!not_null(retentionInDays)].{Name:logGroupName,Bytes:storedBytes}" \
    --output text 2>/dev/null | while read name bytes; do
      mb=$((bytes / 1048576))
      echo "$region  ${mb}MB  $name"
    done
done
```

**What to expect:** in a fresh account, a handful from the exercises in this guide. In any inherited account, frequently dozens or hundreds — including log groups for services deleted long ago.

**Why it's interesting:** every one of those has retention set to Never Expire, which is the default. They will bill you forever. This audit takes thirty seconds and is routinely the highest-value thing anyone does in a CloudWatch cost review.

Fix them (adjust the retention to taste):

```bash
aws logs describe-log-groups \
  --query "logGroups[?!not_null(retentionInDays)].logGroupName" --output text | \
while read lg; do
  echo "setting 30-day retention on $lg"
  aws logs put-retention-policy --log-group-name "$lg" --retention-in-days 30
done
```

**Cleanup:** none — this is the fix.

### 2. Build an alarm that stays silent while everything burns

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name volume8-default-missing \
  --metric-name Errors --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=a-function-that-does-not-exist \
  --statistic Sum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold

aws cloudwatch put-metric-alarm \
  --alarm-name volume8-breaching-missing \
  --metric-name Errors --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=a-function-that-does-not-exist \
  --statistic Sum --period 60 --evaluation-periods 2 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data breaching

sleep 180

aws cloudwatch describe-alarms \
  --alarm-names volume8-default-missing volume8-breaching-missing \
  --query "MetricAlarms[].{Name:AlarmName,State:StateValue,Missing:TreatMissingData}" \
  --output table
```

**What to expect:** the first sits in `INSUFFICIENT_DATA`. The second goes to `ALARM`.

**Why it's interesting:** both alarms watch a metric that will never have data — a service that is, in effect, completely dead. Only one of them tells you. The default is the quiet one. Now go and check your production alarms: any alarm on something that should *always* emit data, left on the default, will stay grey through a total outage.

**Cleanup:**
```bash
aws cloudwatch delete-alarms --alarm-names volume8-default-missing volume8-breaching-missing
```

### 3. Discover what CloudTrail isn't recording

```bash
echo "=== trails configured ==="
aws cloudtrail describe-trails \
  --query "trailList[].{Name:Name,Multiregion:IsMultiRegionTrail,Validation:LogFileValidationEnabled,Bucket:S3BucketName}" \
  --output table

echo "=== data event selectors (the important bit) ==="
for trail in $(aws cloudtrail describe-trails --query "trailList[].Name" --output text); do
  echo "--- $trail ---"
  aws cloudtrail get-event-selectors --trail-name "$trail" \
    --query "{Basic:EventSelectors,Advanced:AdvancedEventSelectors}" --output json
done
```

**What to expect:** either no trails at all, or trails whose event selectors show `DataResources` as an empty list.

Now prove the asymmetry. Generate one of each kind of event:

```bash
BUCKET="volume8-lab-$(aws sts get-caller-identity --query Account --output text)-$RANDOM"
aws s3api create-bucket --bucket $BUCKET
echo hello > /tmp/v8.txt
aws s3 cp /tmp/v8.txt s3://$BUCKET/v8.txt
aws s3 cp s3://$BUCKET/v8.txt /tmp/v8-back.txt

sleep 120

echo "=== searching event history for the bucket creation (management event) ==="
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateBucket \
  --max-results 5 \
  --query "Events[].{Time:EventTime,Name:EventName,User:Username}" --output table

echo "=== searching event history for the object read (data event) ==="
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=GetObject \
  --max-results 5 \
  --query "Events[].{Time:EventTime,Name:EventName,User:Username}" --output table
```

**What to expect:** `CreateBucket` appears. `GetObject` almost certainly does not.

**Why it's interesting:** you just created a bucket, wrote to it, and read from it — and only the *creation* is in the record. That gap is the Capital One exfiltration. The attacker's reads would look exactly like your read: absent. Anyone investigating would see the role being assumed and nothing after it.

**Cleanup:**
```bash
aws s3 rb s3://$BUCKET --force
rm -f /tmp/v8.txt /tmp/v8-back.txt
```

### 4. Run a forensic query against yourself

If you have a CloudTrail trail delivering to CloudWatch Logs, query it. If not, query any log group you have — the Lambda logs from Volume 7 work if you recreate the function.

```bash
LOG_GROUP=$(aws logs describe-log-groups --query "logGroups[0].logGroupName" --output text)
echo "querying: $LOG_GROUP"

QUERY_ID=$(aws logs start-query \
  --log-group-name "$LOG_GROUP" \
  --start-time $(( $(date +%s) - 86400 )) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | sort @timestamp desc | limit 20' \
  --query queryId --output text)

sleep 12
aws logs get-query-results --query-id $QUERY_ID \
  --query "{Status:status,Scanned:statistics.recordsScanned,Matched:statistics.recordsMatched}" \
  --output table
```

**What to expect:** a status of `Complete` with counts of records scanned and matched.

**Why it's interesting:** note `recordsScanned`. **Logs Insights bills on bytes scanned**, and the time range is what determines that. A query over 90 days of a busy log group costs real money per execution. This is why retention policy, log group structure, and narrow time ranges are cost decisions and not just hygiene.

The query language is worth learning properly — `filter`, `stats`, `parse`, `sort` — because during an incident it's the difference between finding the answer in two minutes and grepping through downloaded files for an hour.

### 5. Price static stability for yourself

No resources created.

```bash
python3 - <<'EOF'
PEAK_LOAD = 600          # units of work at peak
PER_INSTANCE = 100       # what one instance handles
COST_PER_MONTH = 70      # approximate, per instance

print("Requirement: survive the loss of one Availability Zone\n")

for azs in (2, 3, 4):
    needed = PEAK_LOAD / PER_INSTANCE

    # Dynamic: size for normal load, scale on failure
    dyn = int(-(-needed // azs)) * azs
    dyn_surviving = dyn - (dyn // azs)
    dyn_util = PEAK_LOAD / (dyn_surviving * PER_INSTANCE) * 100

    # Static: size so surviving AZs alone carry peak
    per_az = int(-(-needed // (azs - 1)))
    stat = per_az * azs
    stat_surviving = stat - per_az
    stat_util = PEAK_LOAD / (stat_surviving * PER_INSTANCE) * 100

    print(f"{azs} AZs")
    print(f"  dynamic: {dyn:2d} instances  ${dyn*COST_PER_MONTH:5d}/mo  "
          f"-> {dyn_util:5.1f}% utilised after AZ loss  (needs control plane)")
    print(f"  static:  {stat:2d} instances  ${stat*COST_PER_MONTH:5d}/mo  "
          f"-> {stat_util:5.1f}% utilised after AZ loss  (needs nothing)")
    print(f"  premium: ${(stat-dyn)*COST_PER_MONTH}/mo\n")
EOF
```

**What to expect:** the static-stability premium **falls sharply as you add AZs**. Across two AZs it's expensive. Across three it's much more modest. Across four it's nearly free.

**Why it's interesting:** this is the actual argument for three AZs rather than two, and it's a cost argument as much as a reliability one. With two AZs, being statically stable means running each at 50% — you're paying for a whole spare copy. With four, you need roughly 33% headroom.

Now price your own workload, decide whether the premium is worth removing a control plane dependency during exactly the event where control planes fail, and **write the number down**. That's what an RTO conversation with a business stakeholder should look like.

**Cleanup:** none.

---


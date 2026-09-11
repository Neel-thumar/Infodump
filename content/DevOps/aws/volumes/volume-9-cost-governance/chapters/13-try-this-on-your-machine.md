## TRY THIS ON YOUR MACHINE

All five are **free or effectively free**. Cost Explorer API calls are about $0.01 each — you'll make a handful. CloudFormation itself is free; the exercises create an S3 bucket and an SNS topic, both negligible. Teardown at the end.

### 1. Find out where your money actually goes

```bash
export AWS_DEFAULT_REGION=us-east-1
START=$(date -u -d '30 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-30d +%Y-%m-%d)
END=$(date -u +%Y-%m-%d)

aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query "ResultsByTime[].Groups[?Metrics.UnblendedCost.Amount>'0.001'].{Service:Keys[0],Cost:Metrics.UnblendedCost.Amount}" \
  --output table
```

**What to expect:** a service-by-service breakdown. On a learning account, small numbers — but the *shape* is what matters.

**Why it's interesting:** this is the view that actually answers "what am I paying for." Note what appears that you didn't expect. On most real accounts, at least one line is something nobody remembers creating.

### 2. Isolate the invisible tax

```bash
aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost UsageQuantity \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --filter '{"Dimensions":{"Key":"USAGE_TYPE_GROUP","Values":["EC2: Data Transfer - Internet (Out)","EC2: Data Transfer - Inter AZ"]}}' \
  --query "ResultsByTime[].Groups[].{Type:Keys[0],Cost:Metrics.UnblendedCost.Amount,GB:Metrics.UsageQuantity.Amount}" \
  --output table 2>/dev/null || echo "no data transfer charges in this period"
```

**What to expect:** on a learning account, probably nothing. On a production account, often a genuinely surprising number.

**Why it's interesting:** `USAGE_TYPE` is where data transfer becomes visible, and it's the dimension almost nobody groups by. Line items containing `DataTransfer-Regional-Bytes` are cross-AZ traffic — the tax on the multi-AZ resilience from Volume 8. Seeing it as a number changes how you think about service placement.

Try the unfiltered version to see every usage type you generate:

```bash
aws ce get-cost-and-usage \
  --time-period Start=$START,End=$END \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --query "ResultsByTime[].Groups[?Metrics.UnblendedCost.Amount>'0.0001'].{Type:Keys[0],Cost:Metrics.UnblendedCost.Amount}" \
  --output table
```

### 3. Build a stack, then break it behind CloudFormation's back

```bash
SUFFIX=$(aws sts get-caller-identity --query Account --output text)-$RANDOM

cat > /tmp/v9-stack.yaml <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Volume 9 drift demo

Parameters:
  Suffix:
    Type: String

Resources:
  DemoTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'volume9-${Suffix}'
      Tags:
        - Key: ManagedBy
          Value: cloudformation
        - Key: Environment
          Value: lab

Outputs:
  TopicArn:
    Value: !Ref DemoTopic
EOF

aws cloudformation create-stack --stack-name volume9-lab \
  --template-body file:///tmp/v9-stack.yaml \
  --parameters ParameterKey=Suffix,ParameterValue=$SUFFIX

aws cloudformation wait stack-create-complete --stack-name volume9-lab

TOPIC=$(aws cloudformation describe-stacks --stack-name volume9-lab \
  --query "Stacks[0].Outputs[0].OutputValue" --output text)
echo "Topic: $TOPIC"
```

Now change it in a way CloudFormation doesn't know about — simulating the 2 AM console fix:

```bash
aws sns set-topic-attributes --topic-arn $TOPIC \
  --attribute-name DisplayName --attribute-value "changed-by-hand"

DRIFT_ID=$(aws cloudformation detect-stack-drift --stack-name volume9-lab \
  --query StackDriftDetectionId --output text)

sleep 20
aws cloudformation describe-stack-resource-drifts --stack-name volume9-lab \
  --query "StackResourceDrifts[].{Resource:LogicalResourceId,Status:StackResourceDriftStatus,Diffs:PropertyDifferences[].PropertyPath}" \
  --output json
```

**What to expect:** a drift status of `MODIFIED` with the changed property identified.

**Why it's interesting:** CloudFormation found a change nobody recorded. **Drift is inevitable** — emergencies happen and people click. The failure isn't that drift occurs; it's that nobody runs detection, so the template and reality diverge silently until an update fails with `UPDATE_ROLLBACK_FAILED` because the rollback references a state that no longer exists. Run drift detection on a schedule.

### 4. See a change before you make it

```bash
cat > /tmp/v9-stack-v2.yaml <<'EOF'
AWSTemplateFormatVersion: '2010-09-09'
Description: Volume 9 drift demo

Parameters:
  Suffix:
    Type: String

Resources:
  DemoTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'volume9-${Suffix}'
      Tags:
        - Key: ManagedBy
          Value: cloudformation
        - Key: Environment
          Value: lab

  DemoQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub 'volume9-queue-${Suffix}'
      MessageRetentionPeriod: 3600

Outputs:
  TopicArn:
    Value: !Ref DemoTopic
EOF

aws cloudformation create-change-set --stack-name volume9-lab \
  --change-set-name add-a-queue \
  --template-body file:///tmp/v9-stack-v2.yaml \
  --parameters ParameterKey=Suffix,ParameterValue=$SUFFIX

sleep 15
aws cloudformation describe-change-set --stack-name volume9-lab \
  --change-set-name add-a-queue \
  --query "Changes[].ResourceChange.{Action:Action,Resource:LogicalResourceId,Type:ResourceType,Replacement:Replacement}" \
  --output table
```

**What to expect:** one `Add` for the queue, and the existing topic either absent or listed with `Replacement: False`.

**Why it's interesting:** the **`Replacement`** column is the one to read. `True` means CloudFormation will **destroy and recreate** the resource — and on a database or a stateful resource, that is a data-loss event dressed up as a configuration change. A change set takes fifteen seconds and is the difference between knowing and finding out.

You can execute it or abandon it. Abandoning is fine:

```bash
aws cloudformation delete-change-set --stack-name volume9-lab --change-set-name add-a-queue
```

### 5. Check your governance posture

```bash
echo "=== Organizations ==="
aws organizations describe-organization \
  --query "Organization.{Id:Id,Master:MasterAccountId,Features:FeatureSet}" \
  --output table 2>/dev/null || echo "not part of an organization (normal for a solo account)"

echo "=== Cost anomaly monitors ==="
aws ce get-anomaly-monitors \
  --query "AnomalyMonitors[].{Name:MonitorName,Type:MonitorType}" \
  --output table 2>/dev/null || echo "no anomaly detection configured"

echo "=== Budgets ==="
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws budgets describe-budgets --account-id $ACCOUNT \
  --query "Budgets[].{Name:BudgetName,Limit:BudgetLimit.Amount,Unit:BudgetLimit.Unit}" \
  --output table 2>/dev/null || echo "NO BUDGETS - go back to Volume 1 step 4"

echo "=== Some service quotas that bite ==="
aws service-quotas get-service-quota --service-code lambda \
  --quota-code L-B99A9384 --query "Quota.{Name:QuotaName,Value:Value}" --output table 2>/dev/null
aws service-quotas get-service-quota --service-code vpc \
  --quota-code L-F678F1CE --query "Quota.{Name:QuotaName,Value:Value}" --output table 2>/dev/null
```

**What to expect:** no organization on a solo account, your budget from Volume 1, and a couple of quota values — Lambda concurrent executions (the 1,000 from Volume 7) and VPCs per Region.

**Why it's interesting:** those quotas are **per account**, which is the concrete argument for multi-account from earlier in this volume. If you and a noisy dev workload share an account, you share that Lambda concurrency pool — and Volume 7 showed you exactly what happens next.

If anomaly detection shows nothing, set it up. It's free, and it's the tool that catches a runaway loop in hours rather than at month end.

**Cleanup:** none — read-only.

### Teardown

```bash
aws cloudformation delete-stack --stack-name volume9-lab
aws cloudformation wait stack-delete-complete --stack-name volume9-lab
rm -f /tmp/v9-stack.yaml /tmp/v9-stack-v2.yaml

echo "remaining stacks:"
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[].StackName" --output text
```

Note how much easier that was than the manual teardowns in Volumes 3, 4, and 6. **One command removed everything in the correct dependency order.** That convenience is the smallest benefit of infrastructure as code and the most immediately obvious one.

---


## TRY THIS ON YOUR MACHINE

Exercises 1–3 use Lambda, which has a **perpetual free tier** of 1 million requests and 400,000 GB-seconds per month — these cost effectively nothing. Exercise 4 needs Docker installed locally and uses a tiny image well inside ECR's free tier. Exercise 5 is a read-only calculation and creates nothing.

**No EKS cluster is created anywhere here** — at roughly 73 USD/month for the control plane alone, it's not something to spin up casually. Exercise 5 gets you the important EKS lesson without the bill.

### 1. Take a cold start apart

```bash
export AWS_DEFAULT_REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

# Execution role (Volume 2)
aws iam create-role --role-name volume7-lambda-role \
  --assume-role-policy-document '{
    "Version":"2012-10-17",
    "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

aws iam attach-role-policy --role-name volume7-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
sleep 15
```

Write a function that does measurable CPU work:

```bash
mkdir -p /tmp/v7fn && cat > /tmp/v7fn/main.py <<'EOF'
import hashlib, time, os

# This runs ONCE per execution environment - the init phase
COLD_START_TIME = time.time()
BOOT_ID = os.urandom(4).hex()

def handler(event, context):
    start = time.time()
    h = b"seed"
    for _ in range(400000):
        h = hashlib.sha256(h).digest()
    return {
        "boot_id": BOOT_ID,
        "env_age_seconds": round(time.time() - COLD_START_TIME, 3),
        "work_seconds": round(time.time() - start, 3)
    }
EOF

cd /tmp/v7fn && zip -q fn.zip main.py

aws lambda create-function --function-name volume7-demo \
  --runtime python3.12 --handler main.handler \
  --role arn:aws:iam::$ACCOUNT:role/volume7-lambda-role \
  --zip-file fileb:///tmp/v7fn/fn.zip \
  --memory-size 512 --timeout 30 \
  --query "{Name:FunctionName,Memory:MemorySize}"
```

Invoke it twice and compare:

```bash
echo "--- first (cold) ---"
aws lambda invoke --function-name volume7-demo --log-type Tail /tmp/out1.json \
  --query LogResult --output text | base64 -d | grep -i "REPORT"
cat /tmp/out1.json; echo

echo "--- second (warm) ---"
aws lambda invoke --function-name volume7-demo --log-type Tail /tmp/out2.json \
  --query LogResult --output text | base64 -d | grep -i "REPORT"
cat /tmp/out2.json; echo
```

**What to expect:** the first REPORT line includes an **`Init Duration`** field. The second does not. And `boot_id` is **identical** across both invocations, while `env_age_seconds` has grown.

**Why it's interesting:** `Init Duration` is phases 1–4 of the cold start, isolated and measured for you. The identical `boot_id` proves the execution environment was reused — which is why putting expensive setup outside the handler pays off, and also why global mutable state in a Lambda is a bug waiting to happen.

### 2. Prove that memory is CPU

```bash
for mem in 256 512 1024 1769 3008; do
  aws lambda update-function-configuration --function-name volume7-demo \
    --memory-size $mem > /dev/null
  aws lambda wait function-updated --function-name volume7-demo

  # Warm it first so we measure work, not cold start
  aws lambda invoke --function-name volume7-demo /dev/null > /dev/null

  result=$(aws lambda invoke --function-name volume7-demo /tmp/r.json > /dev/null && \
    python3 -c "import json;print(json.load(open('/tmp/r.json'))['work_seconds'])")
  echo "${mem} MB -> ${result}s   (GB-seconds: $(python3 -c "print(round($mem/1024*$result,4))"))"
done
```

**What to expect:** duration falls sharply as memory rises, with the biggest gains up to around 1,769 MB. The GB-seconds column — what you actually pay — often stays flat or **falls**.

**Why it's interesting:** you just watched a function get several times faster at the same or lower cost. Memory is a CPU dial with a misleading name. Almost every Lambda in production is set to 128 or 512 MB because that was the default someone accepted, and a large fraction of them would be cheaper and faster higher up.

### 3. Throttle yourself on purpose

```bash
aws lambda put-function-concurrency --function-name volume7-demo \
  --reserved-concurrent-executions 1

# Fire 10 invocations in parallel against a cap of 1
for i in $(seq 1 10); do
  aws lambda invoke --function-name volume7-demo --invocation-type RequestResponse \
    /tmp/throttle-$i.json --query StatusCode --output text 2>&1 &
done
wait

grep -l "" /tmp/throttle-*.json 2>/dev/null | head -3
echo "--- checking for throttles ---"
sleep 60
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Throttles \
  --dimensions Name=FunctionName,Value=volume7-demo \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-10M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Sum --query "Datapoints[].Sum" --output text
```

**What to expect:** some invocations return errors, and the `Throttles` metric is non-zero.

**Why it's interesting:** you just built the outage. Now scale the thought up: that reserved concurrency of 1 came out of the account pool of 1,000. A function with *no* reserved limit, scaling freely under a batch load, takes that budget from every other function in the Region. Reserved concurrency is a bulkhead, and this is what it feels like when the bulkhead holds.

**Remove the cap:**
```bash
aws lambda delete-function-concurrency --function-name volume7-demo
```

### 4. Watch layers deduplicate

**Requires Docker locally. Uses a tiny image, well inside ECR's free tier.**

```bash
aws ecr create-repository --repository-name volume7-lab \
  --query "repository.repositoryUri" --output text

REPO=$(aws ecr describe-repositories --repository-names volume7-lab \
  --query "repositories[0].repositoryUri" --output text)

aws ecr get-login-password | docker login --username AWS --password-stdin ${REPO%/*}

mkdir -p /tmp/v7img && cd /tmp/v7img
cat > Dockerfile <<'EOF'
FROM public.ecr.aws/docker/library/alpine:3.19
RUN apk add --no-cache curl
COPY app.txt /app.txt
CMD ["cat", "/app.txt"]
EOF

echo "version one" > app.txt
docker build -q -t $REPO:v1 .
docker push $REPO:v1
```

Now change only the last layer and push again:

```bash
echo "version two" > app.txt
docker build -q -t $REPO:v2 .
docker push $REPO:v2
```

**What to expect:** the second push reports most layers as **already existing**, uploading only the changed one. It completes almost instantly.

**Why it's interesting:** the base image and the `apk add` layer were stored once and referenced twice. That's content-addressable storage doing its job — and it's exactly why Dockerfile ordering matters. Reverse the `COPY` and `RUN` lines, rebuild, and watch the dependency layer re-upload every time.

Check what's inside:

```bash
aws ecr describe-images --repository-name volume7-lab \
  --query "imageDetails[].{Tags:imageTags,SizeMB:imageSizeInBytes,Pushed:imagePushedAt}" \
  --output table
```

### 5. Compute how many pods fit — and where your subnet runs out

No cluster required.

```bash
for t in t3.small t3.medium m5.large m5.xlarge m5.4xlarge; do
  aws ec2 describe-instance-types --instance-types $t \
    --query "InstanceTypes[0].{Type:InstanceType,ENIs:NetworkInfo.MaximumNetworkInterfaces,IPsPerENI:NetworkInfo.Ipv4AddressesPerInterface}" \
    --output text
done | awk '{ printf "%-12s ENIs:%-3s IPs/ENI:%-3s  max pods ≈ %d\n", $3, $1, $2, ($1*$2)-1 }'
```

**What to expect:** a `t3.small` supports roughly 11 pods. A `t3.medium` roughly 17. An `m5.4xlarge` far more — but still a fixed ceiling set by network hardware, not by CPU or RAM.

Now the subnet arithmetic:

```bash
python3 - <<'EOF'
subnets = {"/24": 251, "/22": 1019, "/20": 4091}
nodes, pods_per_node = 20, 17
needed = nodes * pods_per_node + nodes
print(f"{nodes} nodes x {pods_per_node} pods = {needed} IP addresses needed\n")
for cidr, avail in subnets.items():
    verdict = "OK" if avail > needed else "RUNS OUT"
    print(f"  {cidr}: {avail} usable -> {verdict}")
EOF
```

**What to expect:** a `/24` is insufficient for a modest 20-node cluster.

**Why it's interesting:** this is the AWS VPC CNI meeting Volume 3's subnet reservations, and it's the most common EKS networking surprise there is. The symptom in a real cluster is pods stuck in `ContainerCreating` with an IP assignment failure, on nodes with plenty of free CPU and memory. You planned capacity for compute and ran out of addresses. **Size EKS subnets for pod count, not node count** — and because a VPC's primary CIDR can never be changed (Volume 3), this is a decision you make once.

**Cleanup:** none — read-only.

### Teardown

```bash
aws lambda delete-function --function-name volume7-demo
aws logs delete-log-group --log-group-name /aws/lambda/volume7-demo 2>/dev/null

aws iam detach-role-policy --role-name volume7-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name volume7-lambda-role

aws ecr delete-repository --repository-name volume7-lab --force

rm -rf /tmp/v7fn /tmp/v7img /tmp/out*.json /tmp/throttle-*.json /tmp/r.json
```

Note the explicit log group deletion. **Lambda creates log groups with no expiry by default**, and they outlive the function. A deleted function's logs keep billing you forever. That's Volume 8's opening problem.

---


## TRY THIS ON YOUR MACHINE

**Cost flags read carefully.** Exercises 1–3 are free-tier eligible (`t3.micro`, small EBS volumes). **Exercise 4 creates an Application Load Balancer at roughly 0.0225 USD/hour plus capacity units — about 0.03 USD if you complete it in an hour, about 17 USD/month if you forget it.** Teardown script at the end. Set a timer.

### 1. Look at the hardware through the abstraction

Launch a small instance and connect via Session Manager (no key pair, no open port — Volume 3):

```bash
export AWS_DEFAULT_REGION=us-east-1

AMI=$(aws ssm get-parameters \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query "Parameters[0].Value" --output text)

ROLE_NAME=volume4-ssm-role
aws iam create-role --role-name $ROLE_NAME --assume-role-policy-document '{
  "Version":"2012-10-17",
  "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name $ROLE_NAME \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name $ROLE_NAME
aws iam add-role-to-instance-profile --instance-profile-name $ROLE_NAME --role-name $ROLE_NAME
sleep 15

INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --iam-instance-profile Name=$ROLE_NAME \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=volume4-lab}]' \
  --query "Instances[0].InstanceId" --output text)
aws ec2 wait instance-status-ok --instance-ids $INSTANCE_ID
echo "Instance: $INSTANCE_ID"

aws ssm start-session --target $INSTANCE_ID
```

Once you have a shell:

```bash
sudo dmidecode -s system-manufacturer
sudo dmidecode -s system-product-name
lscpu | head -20
ls -la /dev/nvme*
cat /sys/hypervisor/type 2>/dev/null || echo "no xen hypervisor node"
```

**What to expect:** manufacturer reporting Amazon EC2, NVMe devices where you might have expected `/dev/xvda`, and no Xen hypervisor node on a Nitro instance.

**Why it's interesting:** your "disk" presents as an NVMe device because the Nitro card exposes network-attached EBS as local NVMe hardware. The abstraction goes all the way down to the device interface. On older Xen instances you'd see `/dev/xvda` and a Xen paravirtual driver instead.

### 2. Watch the credit bucket drain

Still in the session, install a load generator and check the baseline first:

```bash
sudo dnf install -y stress-ng
nproc
```

Exit the session (`exit`), then read the credit metric before loading it:

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=$INSTANCE_ID \
  --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-30M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Average \
  --query "Datapoints[].{Time:Timestamp,Credits:Average}" --output table
```

Now burn CPU for ten minutes and re-read it:

```bash
aws ssm send-command --instance-ids $INSTANCE_ID \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["stress-ng --cpu 2 --timeout 600s &"]'
```

Wait 15 minutes, then run the `get-metric-statistics` command again.

**What to expect:** a credit balance that was climbing or flat, now visibly falling.

**Why it's interesting:** this is the mechanism behind the Wednesday-morning performance cliff. Note especially that `CPUUtilization` during throttling looks *low* — the instance is pinned at baseline, which reads as a healthy 10%. The metric that tells the truth is the one nobody graphs by default.

### 3. Prove snapshots are incremental

```bash
AZ=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID \
  --query "Reservations[0].Instances[0].Placement.AvailabilityZone" --output text)

VOL_ID=$(aws ec2 create-volume --size 1 --volume-type gp3 \
  --availability-zone $AZ --query VolumeId --output text)
aws ec2 wait volume-available --volume-ids $VOL_ID

SNAP1=$(aws ec2 create-snapshot --volume-id $VOL_ID \
  --description "volume4 first" --query SnapshotId --output text)
aws ec2 wait snapshot-completed --snapshot-ids $SNAP1

SNAP2=$(aws ec2 create-snapshot --volume-id $VOL_ID \
  --description "volume4 second" --query SnapshotId --output text)
aws ec2 wait snapshot-completed --snapshot-ids $SNAP2

aws ec2 describe-snapshots --snapshot-ids $SNAP1 $SNAP2 \
  --query "Snapshots[].{Id:SnapshotId,Size:VolumeSize,Desc:Description,Started:StartTime}" \
  --output table
```

**What to expect:** both snapshots report the same *volume* size, but the second completes almost instantly.

**Why it's interesting:** the reported size is the volume's, not the storage consumed. The second snapshot stored almost nothing, because almost nothing changed. This is why hourly snapshots are viable — and why "how much do my snapshots cost" is a question the console can't answer simply.

### 4. Build an ASG and kill an instance

**Cost flag: creates an ALB, roughly 0.0225 USD/hour. Delete it when done.**

```bash
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[0:2].SubnetId" --output text)
SUBNET_ARR=($SUBNETS)

SG_ID=$(aws ec2 create-security-group --group-name volume4-alb-sg \
  --description "volume 4 lab" --vpc-id $VPC_ID --query GroupId --output text)
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --protocol tcp --port 80 --cidr ${MY_IP}/32
```

Create a launch template whose user data installs a web server:

```bash
USERDATA=$(cat <<'EOF' | base64 -w0
#!/bin/bash
dnf install -y nginx
echo "served by $(hostname)" > /usr/share/nginx/html/index.html
systemctl enable --now nginx
EOF
)

aws ec2 create-launch-template --launch-template-name volume4-lt \
  --launch-template-data "{
    \"ImageId\":\"$AMI\",
    \"InstanceType\":\"t3.micro\",
    \"SecurityGroupIds\":[\"$SG_ID\"],
    \"UserData\":\"$USERDATA\"
  }"
```

Create a target group, ALB, and ASG:

```bash
TG_ARN=$(aws elbv2 create-target-group --name volume4-tg \
  --protocol HTTP --port 80 --vpc-id $VPC_ID \
  --health-check-path / --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 --unhealthy-threshold-count 2 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

ALB_ARN=$(aws elbv2 create-load-balancer --name volume4-alb \
  --subnets ${SUBNET_ARR[0]} ${SUBNET_ARR[1]} --security-groups $SG_ID \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

aws elbv2 create-listener --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name volume4-asg \
  --launch-template LaunchTemplateName=volume4-lt,Version='$Latest' \
  --min-size 2 --max-size 4 --desired-capacity 2 \
  --vpc-zone-identifier "${SUBNET_ARR[0]},${SUBNET_ARR[1]}" \
  --target-group-arns $TG_ARN \
  --health-check-type ELB --health-check-grace-period 120
```

Wait a few minutes, then watch the targets become healthy:

```bash
watch -n 10 "aws elbv2 describe-target-health --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State}' --output table"
```

Now the experiment. Terminate one instance manually and **time the recovery**:

```bash
VICTIM=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names volume4-asg \
  --query "AutoScalingGroups[0].Instances[0].InstanceId" --output text)

date
aws ec2 terminate-instances --instance-ids $VICTIM
watch -n 10 "date; aws elbv2 describe-target-health --target-group-arn $TG_ARN \
  --query 'TargetHealthDescriptions[].{Target:Target.Id,State:TargetHealth.State}' --output table"
```

**What to expect:** the target goes unhealthy, then drains and disappears. A replacement launches, appears as `initial`, and eventually becomes `healthy`. **Time it.** Expect several minutes.

**Why it's interesting:** you just measured the lag arithmetic from earlier in this volume, on a real system, with nothing else going on. Now imagine that clock running while traffic is arriving. This number — not your scaling policy — is what determines whether you survive a spike.

### 5. Find your gp2 volumes

```bash
for region in us-east-1 us-west-2 eu-west-1; do
  echo "=== $region ==="
  aws ec2 describe-volumes --region $region \
    --filters Name=volume-type,Values=gp2 \
    --query "Volumes[].{Id:VolumeId,Size:Size,State:State}" --output table 2>/dev/null
done
```

**What to expect:** in a fresh account, probably nothing. In any inherited account, likely a list.

**Why it's interesting:** every gp2 volume in that list can be modified to gp3 live, with no downtime, for roughly 20% less per GB and usually better baseline performance. `aws ec2 modify-volume --volume-id X --volume-type gp3`. It's the closest thing to free money in AWS, and it sits unclaimed in an enormous number of accounts.

**Cleanup:** none — read-only.

### Teardown — run all of this

```bash
aws autoscaling update-auto-scaling-group --auto-scaling-group-name volume4-asg \
  --min-size 0 --desired-capacity 0
sleep 60
aws autoscaling delete-auto-scaling-group --auto-scaling-group-name volume4-asg --force-delete

aws elbv2 delete-listener --listener-arn $(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN --query "Listeners[0].ListenerArn" --output text)
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
sleep 30
aws elbv2 delete-target-group --target-group-arn $TG_ARN
aws ec2 delete-launch-template --launch-template-name volume4-lt

aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

aws ec2 delete-snapshot --snapshot-id $SNAP2
aws ec2 delete-snapshot --snapshot-id $SNAP1
aws ec2 delete-volume --volume-id $VOL_ID
aws ec2 delete-security-group --group-id $SG_ID

aws iam remove-role-from-instance-profile --instance-profile-name volume4-ssm-role --role-name volume4-ssm-role
aws iam delete-instance-profile --instance-profile-name volume4-ssm-role
aws iam detach-role-policy --role-name volume4-ssm-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role --role-name volume4-ssm-role
```

Then verify in the console that no load balancer remains. The ALB is the only thing here that bills meaningfully if forgotten.

---


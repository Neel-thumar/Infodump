## TRY THIS ON YOUR MACHINE

Exercises 1, 2, 4, and 5 are **free** — VPCs, subnets, route tables, security groups, and gateway endpoints carry no charge. Exercise 3 launches a `t3.micro` instance, covered by the free tier for the first 12 months of a new account (roughly 0.01 USD/hour otherwise). **No NAT Gateway is created anywhere in this set** — deliberately, since it's the one piece here that costs real money by the hour.

A full teardown script is at the end. Run it.

### 1. Build a VPC and find the missing addresses

```bash
export AWS_DEFAULT_REGION=us-east-1

VPC_ID=$(aws ec2 create-vpc --cidr-block 10.42.0.0/16 \
  --query Vpc.VpcId --output text)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=volume3-lab
echo "VPC: $VPC_ID"

SUBNET_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID \
  --cidr-block 10.42.1.0/24 --availability-zone us-east-1a \
  --query Subnet.SubnetId --output text)

aws ec2 describe-subnets --subnet-ids $SUBNET_ID \
  --query "Subnets[].{Cidr:CidrBlock,AZ:AvailabilityZone,Available:AvailableIpAddressCount}" \
  --output table
```

**What to expect:** `AvailableIpAddressCount` of **251**, not 256.

**Why it's interesting:** those five missing addresses are the reservations from earlier — router, DNS, network, broadcast, and one held in reserve. On a `/24` it's a rounding error. Try the same with a `/28` and you'll have eleven usable addresses, which is genuinely constraining, and is exactly the arithmetic that bites EKS clusters later.

**Cleanup:** at the end.

### 2. Read the routing table that defines "private"

```bash
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Target:GatewayId,State:State}" \
  --output table
```

**What to expect:** exactly one route — `10.42.0.0/16` to `local`.

Now attach an internet gateway and watch the subnet change character:

```bash
IGW_ID=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID

RTB_ID=$(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "RouteTables[0].RouteTableId" --output text)

aws ec2 create-route --route-table-id $RTB_ID \
  --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

aws ec2 describe-route-tables --route-table-ids $RTB_ID \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Target:GatewayId}" --output table
```

**Why it's interesting:** you just converted a private subnet into a public one, and the entire change is one row in a table. There is no "make public" operation. Public is a routing fact. Internalize that and a whole category of AWS confusion dissolves.

### 3. Make statefulness visible

**Free-tier flag: launches one `t3.micro`. Terminated in cleanup.**

First, a security group allowing SSH-style inbound from your own IP only, and a subnet that auto-assigns public IPs:

```bash
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_ID --map-public-ip-on-launch

MY_IP=$(curl -s https://checkip.amazonaws.com)
SG_ID=$(aws ec2 create-security-group --group-name volume3-lab-sg \
  --description "volume 3 lab" --vpc-id $VPC_ID --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $SG_ID \
  --protocol tcp --port 22 --cidr ${MY_IP}/32
```

Launch an instance using Session Manager rather than an SSH key — no key pair, no inbound port needed:

```bash
AMI=$(aws ssm get-parameters \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query "Parameters[0].Value" --output text)

INSTANCE_ID=$(aws ec2 run-instances --image-id $AMI --instance-type t3.micro \
  --subnet-id $SUBNET_ID --security-group-ids $SG_ID \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=volume3-lab}]' \
  --query "Instances[0].InstanceId" --output text)
echo "Instance: $INSTANCE_ID"
```

Now the actual experiment. The security group allows **all outbound** and no inbound except port 22. The instance can still reach the internet — because security groups are stateful, the responses come back without any inbound rule for them.

Check the rules to confirm there is no inbound rule permitting return traffic:

```bash
aws ec2 describe-security-groups --group-ids $SG_ID \
  --query "SecurityGroups[].{In:IpPermissions,Out:IpPermissionsEgress}" --output json
```

**What to expect:** one inbound rule (port 22 from your IP) and one outbound rule (all traffic). Nothing permitting inbound responses on ephemeral ports — and yet outbound connections from the instance work fine.

**Why it's interesting:** that asymmetry is statefulness. Now imagine replicating this with a NACL: you'd need an explicit outbound allow *and* an inbound allow for ports 1024–65535, or every response would vanish. The rules you didn't have to write are the point.

### 4. Give yourself a free S3 gateway endpoint

```bash
aws ec2 create-vpc-endpoint --vpc-id $VPC_ID \
  --service-name com.amazonaws.us-east-1.s3 \
  --route-table-ids $RTB_ID

aws ec2 describe-route-tables --route-table-ids $RTB_ID \
  --query "RouteTables[].Routes[].{Dest:DestinationCidrBlock,Prefix:DestinationPrefixListId,Target:GatewayId}" \
  --output table
```

**What to expect:** a new route whose destination is a **prefix list ID** rather than a CIDR, targeting a `vpce-` gateway.

**Why it's interesting:** the prefix list is a managed, auto-updating set of S3's IP ranges — AWS maintains it so you don't. Because it's more specific than `0.0.0.0/0`, longest-prefix-match sends S3 traffic to the endpoint instead of out through NAT. This single free object is the 230-dollars-a-month fix from earlier in the volume.

Now attach an endpoint policy and watch IAM and networking meet:

```bash
VPCE_ID=$(aws ec2 describe-vpc-endpoints \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "VpcEndpoints[0].VpcEndpointId" --output text)
echo "Endpoint: $VPCE_ID"
```

The default endpoint policy permits everything. In production you'd scope it to your own bucket ARNs — making exfiltration to a foreign bucket impossible at the network layer regardless of credentials.

### 5. Audit your whole account for `0.0.0.0/0`

```bash
for region in $(aws ec2 describe-regions --query "Regions[].RegionName" --output text); do
  result=$(aws ec2 describe-security-groups --region $region \
    --filters Name=ip-permission.cidr,Values=0.0.0.0/0 \
    --query "SecurityGroups[].{Group:GroupId,Name:GroupName,VPC:VpcId}" \
    --output text 2>/dev/null)
  if [ -n "$result" ]; then
    echo "=== $region ==="
    echo "$result"
  fi
done
```

**What to expect:** at minimum, the security group from exercise 3 is *not* listed (it's scoped to your IP), but default security groups and anything you've created loosely will appear.

**Why it's interesting:** this is the manual version of the check that Config, Security Hub, and every cloud security product sell you. Run it against any AWS account you inherit. The results are frequently educational, and occasionally alarming.

**Cleanup:** none — read-only.

### Teardown — run this

VPC components have dependencies, so order matters. Instance termination takes a minute or two.

```bash
aws ec2 terminate-instances --instance-ids $INSTANCE_ID
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID

aws ec2 delete-vpc-endpoints --vpc-endpoint-ids $VPCE_ID
aws ec2 delete-security-group --group-id $SG_ID
aws ec2 delete-subnet --subnet-id $SUBNET_ID
aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID
aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID
aws ec2 delete-vpc --vpc-id $VPC_ID

echo "Verifying nothing is left:"
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=volume3-lab" \
  --query "Vpcs[].VpcId" --output text
```

The last command should print nothing. If a delete fails with a dependency error, something is still attached — `describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID"` will usually tell you what.

---


## TRY THIS ON YOUR MACHINE

All of these need the CLI from Volume 1. **Exercise 4 creates a KMS key, which costs roughly 1 USD per month prorated** — cleanup is included and takes a moment to schedule.

### 1. Watch explicit Deny beat AdministratorAccess

Create a policy that denies one narrow thing:

```bash
cat > /tmp/deny-ec2-describe.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "ec2:DescribeInstances",
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name TempDenyDescribeInstances \
  --policy-document file:///tmp/deny-ec2-describe.json
```

Attach it to your admin user (substitute your username), then try the action:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws iam attach-user-policy --user-name YOUR-USERNAME \
  --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances

aws ec2 describe-instances --region us-east-1
```

**What to expect:** `UnauthorizedOperation`, despite holding `AdministratorAccess`.

**Why it's interesting:** you just proved Rule 2 empirically. There is no override, no precedence argument, no ordering. This is the mechanism behind every organizational guardrail you'll ever write.

**Cleanup:**
```bash
aws iam detach-user-policy --user-name YOUR-USERNAME \
  --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances
aws iam delete-policy --policy-arn arn:aws:iam::$ACCOUNT:policy/TempDenyDescribeInstances
rm /tmp/deny-ec2-describe.json
```

### 2. Ask IAM to explain itself before you deploy

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::$ACCOUNT:user/YOUR-USERNAME \
  --action-names s3:GetObject s3:DeleteBucket iam:CreateUser ec2:TerminateInstances \
  --query "EvaluationResults[].{Action:EvalActionName,Decision:EvalDecision}" \
  --output table
```

**What to expect:** a table of `allowed` / `implicitDeny` / `explicitDeny` per action.

**Why it's interesting:** this runs the real evaluation engine without performing anything. `implicitDeny` versus `explicitDeny` tells you *why* something failed — nothing granted it, versus something actively blocked it. That distinction turns most IAM debugging from guesswork into a lookup.

**Cleanup:** none — read-only.

### 3. Become someone else for an hour

Create a role that your own user can assume:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::$ACCOUNT:user/YOUR-USERNAME" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role --role-name TempReadOnlyRole \
  --assume-role-policy-document file:///tmp/trust.json

aws iam attach-role-policy --role-name TempReadOnlyRole \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
```

Wait a few seconds for propagation, then assume it and inspect the result:

```bash
aws sts assume-role \
  --role-arn arn:aws:iam::$ACCOUNT:role/TempReadOnlyRole \
  --role-session-name my-test-session
```

**What to expect:** JSON containing `AccessKeyId`, `SecretAccessKey`, **`SessionToken`**, and an `Expiration` timestamp. Note the key ID starts with `ASIA`, not `AKIA` — that prefix distinguishes temporary from long-lived credentials.

Export all three and check your identity:

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
aws sts get-caller-identity
```

**Why it's interesting:** your ARN now shows `assumed-role/TempReadOnlyRole/my-test-session`, not your user. You've swapped identity without any new permanent credential existing anywhere. The `Expiration` field is the entire security argument against the access key in your `~/.aws/credentials`.

**Cleanup:**
```bash
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
aws iam detach-role-policy --role-name TempReadOnlyRole \
  --policy-arn arn:aws:iam::aws:policy/ReadOnlyAccess
aws iam delete-role --role-name TempReadOnlyRole
rm /tmp/trust.json
```

### 4. Do envelope encryption by hand

**Cost flag: this creates a customer managed KMS key, about 1 USD/month prorated.** Cleanup schedules deletion at the 7-day minimum.

```bash
KEY_ID=$(aws kms create-key \
  --description "envelope encryption demo - delete me" \
  --query KeyMetadata.KeyId --output text)
echo "Key: $KEY_ID"
```

Generate a data key — note it comes back twice:

```bash
aws kms generate-data-key --key-id $KEY_ID --key-spec AES_256 \
  --query "{Plaintext:Plaintext,Encrypted:CiphertextBlob}" --output json > /tmp/datakey.json

jq -r .Plaintext /tmp/datakey.json | base64 -d > /tmp/plaintext.key
jq -r .Encrypted /tmp/datakey.json | base64 -d > /tmp/encrypted.key
ls -l /tmp/plaintext.key /tmp/encrypted.key
```

Encrypt a file locally with the plaintext key, then destroy it:

```bash
echo "the actual secret payload" > /tmp/secret.txt
openssl enc -aes-256-cbc -pbkdf2 -in /tmp/secret.txt -out /tmp/secret.enc \
  -pass file:/tmp/plaintext.key
shred -u /tmp/plaintext.key 2>/dev/null || rm -f /tmp/plaintext.key
```

Now recover it — the only thing you kept was the *encrypted* key:

```bash
aws kms decrypt --ciphertext-blob fileb:///tmp/encrypted.key \
  --query Plaintext --output text | base64 -d > /tmp/recovered.key

openssl enc -d -aes-256-cbc -pbkdf2 -in /tmp/secret.enc -pass file:/tmp/recovered.key
```

**What to expect:** your original line of text.

**Why it's interesting:** you performed manually what S3, EBS, and RDS do invisibly on every write. Notice what never crossed the network: your data. Notice what makes the recovery possible: not possession of a key, but *permission to call KMS*. That's the whole design — access control replaced key custody.

**Cleanup:**
```bash
aws kms schedule-key-deletion --key-id $KEY_ID --pending-window-in-days 7
rm -f /tmp/secret.txt /tmp/secret.enc /tmp/recovered.key /tmp/encrypted.key /tmp/datakey.json
```

### 5. Audit yourself the way an attacker would

```bash
aws iam generate-credential-report > /dev/null
sleep 5
aws iam get-credential-report --query Content --output text | base64 -d | column -t -s,
```

**What to expect:** a CSV of every IAM user with MFA status, key age, last-used dates, and password age.

**Why it's interesting:** this is the first artifact any auditor or incident responder pulls. Look specifically at `access_key_1_last_used_date` — a key that's years old and never used is pure unguarded risk. In an inherited AWS account, this report plus an IMDSv1 audit is a genuinely good first day of work.

**Cleanup:** none — read-only.

---


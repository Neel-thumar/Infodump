## TRY THIS ON YOUR MACHINE

All five are **free** or effectively free — S3 free tier covers small storage and requests, and everything here uses tiny objects. Cleanup at the end.

### 1. Prove there are no folders

```bash
export AWS_DEFAULT_REGION=us-east-1
BUCKET="volume5-lab-$(aws sts get-caller-identity --query Account --output text)-$RANDOM"
aws s3api create-bucket --bucket $BUCKET
echo "Bucket: $BUCKET"

echo "quarterly numbers" > /tmp/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2026/q3/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2026/q4/summary.txt
aws s3 cp /tmp/summary.txt s3://$BUCKET/reports/2025/q1/summary.txt
```

Now look at the raw truth versus the illusion:

```bash
echo "--- what actually exists ---"
aws s3api list-objects-v2 --bucket $BUCKET --query "Contents[].Key" --output text

echo "--- what the console shows you ---"
aws s3api list-objects-v2 --bucket $BUCKET --prefix "reports/" --delimiter "/" \
  --query "{Objects:Contents[].Key, Folders:CommonPrefixes[].Prefix}" --output json
```

**What to expect:** the first command lists three flat strings. The second returns no objects at all and one "common prefix" — `reports/2025/` and `reports/2026/` — which the console renders as folder icons.

**Why it's interesting:** you can see the illusion being constructed. `CommonPrefixes` is a string-grouping result, not a directory listing. Now try deleting the "folder":

```bash
aws s3api delete-object --bucket $BUCKET --key "reports/2025/"
aws s3api list-objects-v2 --bucket $BUCKET --prefix "reports/2025/" --query "Contents[].Key"
```

The delete succeeds — deleting a key that doesn't exist is not an error in S3 — and the object underneath is untouched. There was nothing to delete.

### 2. Watch a delete not delete anything

```bash
aws s3api put-bucket-versioning --bucket $BUCKET \
  --versioning-configuration Status=Enabled

echo "version one" > /tmp/doc.txt
aws s3 cp /tmp/doc.txt s3://$BUCKET/doc.txt
echo "version two" > /tmp/doc.txt
aws s3 cp /tmp/doc.txt s3://$BUCKET/doc.txt

aws s3 rm s3://$BUCKET/doc.txt

echo "--- normal listing ---"
aws s3 ls s3://$BUCKET/

echo "--- what is actually stored ---"
aws s3api list-object-versions --bucket $BUCKET --prefix doc.txt \
  --query "{Versions:Versions[].{Id:VersionId,Latest:IsLatest,Size:Size}, DeleteMarkers:DeleteMarkers[].{Id:VersionId,Latest:IsLatest}}" \
  --output json
```

**What to expect:** the normal listing shows nothing. The version listing shows **two object versions still present** plus a delete marker.

Recover the file by removing the delete marker:

```bash
MARKER=$(aws s3api list-object-versions --bucket $BUCKET --prefix doc.txt \
  --query "DeleteMarkers[0].VersionId" --output text)
aws s3api delete-object --bucket $BUCKET --key doc.txt --version-id $MARKER
aws s3 cp s3://$BUCKET/doc.txt -
```

**Why it's interesting:** you just performed ransomware recovery. It's also the mechanism behind the cost surprise — you "deleted" a file and your storage bill didn't move by a byte. Every version is still billed.

### 3. Take apart a presigned URL

```bash
aws s3 presign s3://$BUCKET/reports/2026/q3/summary.txt --expires-in 60
```

Copy the URL and look at its query string — then fetch it:

```bash
URL=$(aws s3 presign s3://$BUCKET/reports/2026/q3/summary.txt --expires-in 60)
echo "$URL" | tr '&' '\n'
curl -s "$URL"
```

Wait 70 seconds and try again:

```bash
sleep 70
curl -s "$URL" | head -20
```

**What to expect:** query parameters including `X-Amz-Algorithm=AWS4-HMAC-SHA256`, `X-Amz-Credential` (containing the credential scope from Volume 1 — date, region, service), `X-Amz-Date`, `X-Amz-Expires`, and `X-Amz-Signature`. The first fetch returns your file. The second returns an XML error saying the request has expired.

**Why it's interesting:** a presigned URL is not a special S3 feature. It's **SigV4 from Volume 1 with the signature moved from a header into the query string**, plus an expiry. That's all. Anyone holding the URL has exactly the access it encodes, for exactly as long as it says — which is why presigned URLs should always have short expiries and should never be logged.

### 4. Try to make a bucket public and watch it refuse

```bash
cat > /tmp/public-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET/*"
  }]
}
EOF

aws s3api put-bucket-policy --bucket $BUCKET --policy file:///tmp/public-policy.json
```

**What to expect:** an `AccessDenied` error mentioning public access block, on a bucket you own, holding `AdministratorAccess`.

Check why:

```bash
aws s3api get-public-access-block --bucket $BUCKET
aws s3api get-bucket-ownership-controls --bucket $BUCKET
```

**Why it's interesting:** all four Block Public Access settings are `true` by default on new buckets, and Object Ownership is `BucketOwnerEnforced` — meaning ACLs are switched off entirely. This is the April 2023 default change, and it's the direct product response to the 2017 epidemic. Note that it's an override sitting *above* the permission systems, exactly the Volume 2 guardrail pattern: no amount of Allow defeats it.

**Do not disable this to "make the exercise work."** The point is that it stopped you.

### 5. Watch a CDN from the outside

```bash
echo "--- delegation chain ---"
dig +trace +nodnssec aws.amazon.com | tail -20

echo "--- first request (likely a miss) ---"
curl -sI https://aws.amazon.com/ | grep -i "x-cache\|x-amz-cf-pop\|via\|age"

echo "--- second request ---"
curl -sI https://aws.amazon.com/ | grep -i "x-cache\|x-amz-cf-pop\|age"
```

**What to expect:** `x-amz-cf-pop` containing an airport code for the edge location serving you (`LHR50`, `SIN2`, `IAD79`). `x-cache` showing `Hit from cloudfront` or `Miss from cloudfront`. An `age` header counting seconds since the object was cached.

**Why it's interesting:** the airport code tells you which physical city answered you, and it's almost certainly not where the origin is. That's the distance problem solved. Run the same command from a phone on cellular data versus home wifi and you may get different POPs — you're watching routing decide your edge.

**Cleanup:**

```bash
aws s3api delete-objects --bucket $BUCKET --delete "$(aws s3api list-object-versions \
  --bucket $BUCKET --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null

aws s3api delete-objects --bucket $BUCKET --delete "$(aws s3api list-object-versions \
  --bucket $BUCKET --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null

aws s3 rb s3://$BUCKET --force
rm -f /tmp/summary.txt /tmp/doc.txt /tmp/public-policy.json
```

Note that emptying a versioned bucket requires deleting versions *and* delete markers explicitly — `aws s3 rm --recursive` alone won't do it. That inconvenience is exercise 2's lesson arriving as a chore.

---


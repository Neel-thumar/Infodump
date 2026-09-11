## THE MECHANISM: CloudFormation

AWS's native infrastructure-as-code service, and the foundation under several others.

### The model

You write a **template** (YAML or JSON) describing resources. You create a **stack** from it. CloudFormation figures out the dependency order, creates everything, and **tracks the stack's state**.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: Minimal example

Parameters:
  BucketSuffix:
    Type: String
    Description: Unique suffix for the bucket name

Resources:
  DataBucket:
    Type: AWS::S3::Bucket
    DeletionPolicy: Retain
    Properties:
      BucketName: !Sub 'my-data-${BucketSuffix}'
      VersioningConfiguration:
        Status: Enabled

  BucketTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !Sub 'notifications-${BucketSuffix}'

Outputs:
  BucketArn:
    Value: !GetAtt DataBucket.Arn
    Export:
      Name: !Sub '${AWS::StackName}-BucketArn'
```

**The stack is the unit of management.** Update the template and CloudFormation computes the difference and applies it. Delete the stack and it removes everything in dependency order.

### The features that matter

**Change sets** — compute what an update *would* do before doing it. This is CloudFormation's equivalent of `terraform plan`, and skipping it on production is how people discover that a change they thought was in-place actually requires resource replacement.

**Drift detection** — compares actual resource configuration against the template. It finds the security group rule someone added in the console at 2 AM during an incident. Drift is inevitable; **the problem isn't that drift happens, it's that nobody looks**.

**Deletion policies** — `Retain`, `Snapshot`, or `Delete`. Put `Retain` on your database and your S3 buckets. This is the setting that separates "we deleted a stack by accident" from "we deleted our data by accident."

**Stack policies** — deny updates to specific resources within a stack, so a template change can't accidentally replace your production database.

**StackSets** — deploy one template across many accounts and Regions at once. This is how you roll out baseline configuration across an organization.

**Resource import** — bring existing hand-made resources under management without recreating them. This is your migration path out of click-ops.

### The pain points, honestly

**`UPDATE_ROLLBACK_FAILED`.** An update fails, CloudFormation tries to roll back, the rollback also fails, and the stack is stuck in a state where you can't update or delete it. Recovery involves `continue-update-rollback` with resources to skip, and it is genuinely unpleasant. It usually happens because something was changed outside CloudFormation — drift causing the rollback to reference a state that no longer exists.

**Templates get long.** A serious template is thousands of lines of YAML with limited abstraction. Nested stacks help. This verbosity is precisely what CDK and Terraform exist to address.

**Not everything is supported immediately.** New AWS features sometimes reach the console and API before CloudFormation.

### CDK

The **AWS Cloud Development Kit** lets you define infrastructure in TypeScript, Python, Java, Go, or C#. It **synthesizes CloudFormation templates** — it's a higher-level authoring layer over the same engine.

The value is real abstraction: loops, conditionals, functions, classes, unit tests, and IDE completion. Its **L2 and L3 constructs** encode sensible defaults, so `new s3.Bucket(this, 'Data', { versioned: true })` produces a bucket with encryption and Block Public Access already configured.

The trade-off: you're now debugging generated CloudFormation, and the abstraction can hide what's actually being created until it surprises you.

---


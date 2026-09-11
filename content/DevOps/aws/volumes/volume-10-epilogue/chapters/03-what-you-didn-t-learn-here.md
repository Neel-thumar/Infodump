## What You Didn't Learn Here

Being honest about scope. This guide covered your original service list plus what was needed to make it coherent. AWS has hundreds of services. Here's what you'd reach for next, roughly by how often it comes up.

**Very commonly needed:**

- **DynamoDB** — AWS's managed NoSQL database. Single-digit millisecond latency, genuinely serverless, and a completely different data modelling discipline from the relational thinking in Volume 6. The partition key design decides everything.
- **SQS, SNS, and EventBridge** — you met EventBridge in Volume 8, but decoupling with queues and topics is foundational to nearly every AWS architecture.
- **API Gateway** — the front door for serverless HTTP APIs, and the usual partner to Lambda.
- **Step Functions** — state machines for orchestrating multi-step workflows, including the ones longer than Lambda's 15-minute ceiling.
- **ElastiCache** — managed Redis and Memcached. The usual answer when your RDS instance is doing too much read work.

**Commonly needed:**

- **WAF and Shield** — web application firewall and DDoS protection, usually in front of CloudFront or an ALB.
- **Cognito** — user authentication and identity for applications, which is a different problem from IAM.
- **Athena, Glue, and Redshift** — querying data in S3, ETL, and data warehousing.
- **Kinesis and MSK** — streaming data, and AWS's managed Kafka.
- **Systems Manager** — beyond Session Manager, which you used: patch management, run commands, Parameter Store.
- **CodePipeline, CodeBuild, CodeDeploy** — AWS's CI/CD services, though a large share of teams use GitHub Actions or GitLab instead.

**Specialized:**

- **Direct Connect** — dedicated physical connectivity, mentioned in Volume 3 but not explored.
- **Transfer Family, DataSync, Snowball** — bulk and specialized data movement.
- **Outposts, Local Zones, Wavelength** — AWS hardware outside AWS Regions.
- The machine learning service catalogue, which is large and moving.

**None of this is harder than what you've already done.** Each is a service with a problem it solves, a mechanism, and a set of failure modes. You now have the method for approaching one.

---


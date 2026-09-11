## What You Need Before Volume 1

Nothing yet. Volume 0 is the only volume you can read on a train with no laptop.

Volume 1 will walk you through, from zero: creating an AWS account, immediately locking the root user behind MFA, setting a billing alarm before you do literally anything else, creating a non-root admin identity, and installing the AWS CLI. If you already have an account, you'll do the hardening steps anyway, because a startling number of long-time AWS users have never done them.

**On money:** the vast majority of exercises in this guide fit inside the AWS Free Tier. A handful — NAT Gateway, the EKS control plane, RDS Multi-AZ — cost real money by the hour and cannot be made free. I will flag those loudly every single time, tell you the approximate hourly cost, and always give you the teardown command. Nothing in this guide will ever surprise you with a bill.

---


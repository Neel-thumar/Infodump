## THE PROBLEM: You Can't Debug What You Didn't Record

A request fails. It passed through CloudFront, an ALB, three containers, a Lambda, and a database. It's 2 AM. The user is gone.

**What do you have?**

Whatever you were recording *before* it happened. Nothing else. You cannot go back and instrument the past. This is the fundamental asymmetry of operations: every observability decision is made in advance of the incident it will be judged by.

Which creates a genuine tension. Record everything and you go broke — CloudWatch Logs ingestion charges are real money at volume, and verbose logging at scale can exceed the cost of the compute producing it. Record too little and you're blind.

So you need to know what each tool is actually for.

---


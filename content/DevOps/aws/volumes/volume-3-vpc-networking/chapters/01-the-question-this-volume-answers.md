## The Question This Volume Answers

You launch two EC2 instances. They can talk to each other. You launch a third in a different account, in the same data center, possibly on the same physical host — and it can't reach either of them, can't see their traffic, doesn't know they exist.

There is no cable between the first two. There is no switch you configured. There's no VLAN you set up. The "network" they share is a fiction maintained by software.

**So what is it made of, and what happens when the fiction leaks?**

This volume is about the layer that decides where packets may go. It's the layer that most reliably separates people who can operate AWS from people who can only use it — partly because networking is genuinely hard, and partly because two AWS features that look like the same thing behave in opposite ways, and nobody tells you until you've lost an afternoon.

Three things to take away:

1. **A VPC is a software-defined network**, and its routing rules are explicit objects you can read.
2. **Security groups are stateful. Network ACLs are not.** That one word is the whole difference.
3. **Every network path has a price**, and the expensive paths are invisible until the bill arrives.

---


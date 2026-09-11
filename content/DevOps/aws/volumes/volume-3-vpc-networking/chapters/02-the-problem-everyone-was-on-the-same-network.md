## THE PROBLEM: Everyone Was on the Same Network

To understand why VPC exists, you have to understand what came before it, because it was genuinely alarming.

### EC2-Classic

When EC2 launched in 2006, there was no such thing as your own network. Every instance you launched went onto a single enormous flat network shared with **every other AWS customer**. Your instance got a public IP address, directly, and was reachable from the internet by default.

Think about what that means:

- No private subnets. Your database server had a public IP, same as your web server.
- No network-level isolation from other customers. Your neighbour was some stranger's instance.
- No control over IP addressing. You got what you were given, and it changed when you stopped and started.
- Security groups existed, and they were the *only* thing standing between your instance and the entire internet.

It worked, in the sense that it shipped and people used it. But it made certain architectures impossible. You could not build the standard enterprise pattern — a DMZ with public-facing servers, a private tier behind it that has no route to the internet at all. There was no "no route to the internet." There was only "a firewall rule that says no."

And you certainly couldn't connect this to a corporate data center in any sane way.

### What AWS built

**Amazon VPC arrived in 2009.** The proposition: you get your own logically isolated section of the AWS cloud, with your own IP range, your own subnets, your own route tables, and your own gateways. A network that behaves like a network you'd build yourself, except it's entirely software.

For several years VPC was opt-in and EC2-Classic remained the default. In 2013 AWS flipped it — new accounts got a **default VPC**, and EC2-Classic began a long retirement, finally completed in **August 2022**.

If you created an AWS account in Volume 1, you already have a default VPC in every Region. It's a convenience: a `/16`, one public subnet per AZ, an internet gateway, all wired up. It's also why your first EC2 instance "just works" — and why a lot of people never learn any of this, right up until the day they need to.

*Accuracy note: the 2009 launch and the 2022 EC2-Classic retirement are firm. The exact sequencing of default-VPC rollout across Regions in 2013 I'd treat as approximately right rather than precisely so.*

---


## What You're About to Understand That Most AWS Users Never Do

This is the teaser list. If you finish this guide, these will all be obvious to you, and they are not obvious to the median person with an AWS certification.

1. **Why the console is a lie.** Every click is an HTTPS request signed with an algorithm called SigV4, and once you see that, the CLI, the SDKs, Terraform, and the console all collapse into the same thing. *(Volume 1)*
2. **The difference between the control plane and the data plane** — and why that single distinction predicts what will survive the next AWS outage and what won't. *(Volume 1)*
3. **The actual order IAM evaluates a policy in**, including the part where an explicit Deny anywhere in the chain wins regardless of how many Allows you stacked up. *(Volume 2)*
4. **What envelope encryption really is**, and why KMS never actually encrypts your data — it encrypts a key that encrypts your data, and the difference is the whole product. *(Volume 2)*
5. **Why a security group and a network ACL are not two versions of the same thing.** One is stateful, one isn't, and that single word explains a category of outage that people burn entire afternoons on. *(Volume 3)*
6. **Why AWS designed and manufactures its own hardware.** The Nitro system moved virtualization off the CPU and onto dedicated cards, which is why a modern instance gives you nearly bare-metal performance. *(Volume 4)*
7. **Why your `t`-family instance mysteriously slows to a crawl** after running fine for hours — CPU credits, and the same burst-credit logic hiding inside certain EBS volume types. *(Volume 4)*
8. **That S3 has no folders.** None. The flat keyspace and the "directories" the console draws for you are a UI fiction, and knowing this changes how you think about listing, permissions, and performance. *(Volume 5)*
9. **What actually causes a Lambda cold start**, why Firecracker microVMs made them dramatically cheaper for AWS, and why some cold starts are one hundred times worse than others. *(Volume 7)*
10. **Which parts of "AWS containers" are actually AWS.** ECS is Amazon's own scheduler; Kubernetes belongs to the CNCF and EKS is AWS operating it for you. Marketing blurs this constantly; your architecture decisions shouldn't. *(Volume 7)*
11. **Why your bill is mostly data transfer.** Compute is easy to reason about. The money is in bytes crossing boundaries — between AZs, out to the internet, through a NAT Gateway — and almost nobody is taught to see those boundaries. *(Volume 9)*
12. **Why "Multi-AZ" and "highly available" are not synonyms**, and how to actually price the difference between surviving a rack failure and surviving a region failure. *(Volume 8)*

---


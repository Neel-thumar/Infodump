## Where We Go Next

**Volume 2 — Identity and Secrets: IAM, STS, KMS, Secrets Manager.**

This is the big one, and it's the volume most people get wrong. We'll build up from principals and policies to the actual evaluation algorithm AWS runs on every single request — including the part where an explicit Deny beats every Allow you've ever written. Then roles, trust policies, STS and temporary credentials, and why the access key sitting in your `~/.aws/credentials` right now is a compromise rather than a best practice.

Second half: envelope encryption from first principles. Why KMS doesn't encrypt your data, what it actually encrypts, the difference between a key policy and an IAM policy, and where Secrets Manager fits.

Two incidents anchor it: **Capital One in 2019**, where a server-side request forgery reached that `169.254.169.254` address and turned into a hundred-million-record breach — and the crypto-mining economy built entirely on access keys people pushed to GitHub by accident.

It's a long one. I'll ask you before we start whether you want it split into chapters.

---

*Volume 1 complete. Say **continue** when you're ready for Volume 2.*

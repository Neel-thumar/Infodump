## THE MECHANISM: Terraform — and Being Precise About What It Is

**Terraform is not an AWS product.** It's made by HashiCorp, it's the most widely used infrastructure-as-code tool for AWS, and most teams you join will be using it rather than CloudFormation.

That combination — third-party, dominant — is exactly the kind of thing casual explanations blur, so let's be exact.

### How it differs from CloudFormation

**State is a file, not a service.** Terraform maintains a state file mapping your configuration to real resources. CloudFormation keeps this inside AWS; Terraform's is yours to manage, typically in S3 with locking (historically via a DynamoDB table; S3 now supports native locking).

**That state file is sensitive and critical.** It can contain secrets in plaintext. Lose it and Terraform no longer knows what it manages. Corrupt it and you're doing surgery.

**It's multi-cloud.** One tool and one language for AWS, Azure, GCP, Cloudflare, GitHub, Datadog, and hundreds of other providers. For an organization spanning several vendors, this is the argument.

**`terraform plan` is excellent**, and it's the feature most people cite. A clear, readable diff before you apply anything.

**Modules** provide real reuse with versioning, and the public registry is large.

### The 2023 licence change, and the fork

Here's the community design fight worth knowing about, because it's recent and it changed the landscape.

**In August 2023, HashiCorp changed Terraform's licence** from the Mozilla Public License 2.0 — a permissive open source licence — to the **Business Source License 1.1**. BUSL is a source-available licence that restricts commercial use competing with the licensor, converting to an open licence after a delay.

The immediate practical effect was limited for most users. The reaction from the ecosystem was not.

A substantial part of the community argued that a tool this foundational, built on years of community contribution, shouldn't have its terms changed unilaterally. Within weeks a fork was announced, and it became **OpenTofu**, which was accepted by the **Linux Foundation** in September 2023 and continues under an open licence.

So the ecosystem now has two largely compatible tools with different governance. Organizations have made different choices, and both are in production use.

**Then, in a development that surprised many:** IBM announced its acquisition of HashiCorp in 2024, and the deal completed in 2025.

*This is the most time-sensitive material in the entire guide.* The competitive and governance landscape here is actively moving. **Verify the current state against primary sources before making a decision on it.**

**The durable lesson**, independent of the outcome: your infrastructure tooling has a governance model, and governance models can change. It's worth knowing who controls the tools you depend on, and what your options are if the terms change.

### Which should you use?

**CloudFormation or CDK when:** you're AWS-only, you want AWS to manage state, you need StackSets across an organization, or you want first-party support.

**Terraform or OpenTofu when:** you're multi-cloud, your team already knows it, you want the module ecosystem, or you want a tool that isn't tied to one vendor.

**Honestly: the tool matters far less than using one at all.** The gap between hand-clicked infrastructure and any IaC tool is enormous. The gap between two IaC tools is a preference.

---


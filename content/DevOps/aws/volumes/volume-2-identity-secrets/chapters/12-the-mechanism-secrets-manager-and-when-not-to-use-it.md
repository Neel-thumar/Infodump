## THE MECHANISM: Secrets Manager, and When Not to Use It

KMS handles keys. But you also have *secrets* — database passwords, third-party API tokens, things that aren't encryption keys but must not be in a config file.

Two services, and the choice matters:

| | Secrets Manager | SSM Parameter Store (SecureString) |
|---|---|---|
| Cost | ~0.40 USD per secret/month + API charges | Standard tier free; advanced tier charged |
| Built-in rotation | Yes, via managed Lambda | No, build it yourself |
| Native RDS integration | Yes | No |
| Cross-account resource policy | Yes | Limited |
| Best for | Database credentials needing rotation | Config values, general secrets, cost sensitivity |

Both encrypt with KMS. Both are enormous improvements over a file.

**The honest guidance:** Parameter Store SecureString is genuinely fine for most secrets and materially cheaper. Reach for Secrets Manager when you specifically want automated rotation or the native database integrations. Teams that default to Secrets Manager for hundreds of config values are paying for a rotation feature they never enable.

**And the anti-pattern to watch for:** fetching a secret from Secrets Manager on every single request, inside a Lambda, at scale. It works, it's correct, and the API charges will surprise you. Cache it for the life of the execution environment.

---


# Volume 4 — Production Deployments and Release Engineering

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand that *how* you deploy determines what failure costs you |
| Practical goal | Add real verification and an exercised rollback to the pipeline |
| Production goal | Choose a deployment strategy with reasoning; know what each one's failure looks like |
| Troubleshooting goal | Deploy succeeded but app is down; rollback doesn't work |
| Interview goal | Compare recreate / rolling / blue-green / canary, and explain rollback design |

Volume 3 ended with an uncomfortable fact: **your deploy job reports on your deploy script, not on your application.** This volume closes that gap.

---


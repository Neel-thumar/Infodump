## Things senior engineers notice

1. **The image digest, not the tag, is the true identity of what is running.** Tags are names people chose; digests are what was actually deployed.
2. **Promotion is a policy decision expressed in the pipeline.** If the pipeline *can* rebuild between staging and production, someone eventually will, under pressure, at 2 a.m.
3. **The build job is the highest-value target in the whole system.** It has source access, registry write access, and produces the artifact everyone trusts. Compromise it and every downstream control is bypassed.
4. **A privileged build container on a shared runner is a shared-tenancy problem**, not just a checkbox.
5. **Environments are a record, not a folder.** Their value is answering "what is running, from which commit, deployed by whom" — which is the audit question.
6. **Manual approval is only meaningful if the approver has information.** A button clicked without knowing what changed or how staging behaved is theatre with an audit trail.
7. **Rollback capability is created here, not in Volume 4.** If you tag properly and promote immutable images, rollback is redeploying a known digest. If you deploy `:latest`, no amount of process will give you a rollback.
8. **Deploy jobs report their own success.** Until something independently checks the application, a green deployment stage is a statement about your script, not your service.

---


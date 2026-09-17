## Volume 4 checklist

- [ ] I can pick a deployment strategy and justify it from downtime tolerance, version coexistence, and detection speed
- [ ] My pipeline verifies readiness, asserts the deployed version, and runs smoke tests
- [ ] I have an explicit rollback job that deploys a specific known-good SHA
- [ ] **I have actually executed a rollback and timed it**
- [ ] I understand why schema changes are the real limit on rollback
- [ ] Releases are recorded, and I can trace release → commit → image → deployment

**Next:** Volume 5 — Security, Troubleshooting and Production CI/CD. How secrets actually leak, scanning in the pipeline, runner architecture, and a systematic method applied to broken pipelines.

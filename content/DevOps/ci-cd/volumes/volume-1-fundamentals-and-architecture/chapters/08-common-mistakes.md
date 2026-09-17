## Common mistakes

- Assuming jobs share files. They don't.
- Copying a large `.gitlab-ci.yml` from the internet before understanding stages and jobs.
- Tagging jobs unnecessarily, then wondering why they never run.
- Using `image:` with a shell-executor runner and expecting it to take effect (it does not — that runner has no containers).
- Writing scripts that swallow failures, so the job goes green while the work failed.
- Debugging application code when the log header already says the job ran on an unexpected runner.

---


## 7. Optional: see a green pipeline once

You do not need to understand this yet. The point is to see that the machinery is real.

Create a project in GitLab, and add a file named `.gitlab-ci.yml` at the repository root:

```yaml
hello:
  script:
    - echo "The pipeline ran."
```

Commit it. Then open **Build → Pipelines** in the project sidebar.

What you should observe:

- A pipeline appears within a few seconds of the push.
- It contains one job named `hello`.
- Its status moves through `pending` → `running` → `passed`.
- Clicking the job shows a log: the runner cloning your repository, then your `echo` line, then `Job succeeded`.

Two questions to sit with until Volume 1 answers them:

1. **Who ran that script?** Not GitLab's web interface. Some machine, somewhere, picked up this job. Which one, and why?
2. **Where did it run it?** In what directory, on what operating system, with what tools installed?

If the job stays `pending` forever, no runner was available to take it. That is not a bug in your YAML — it is the runner concept introducing itself early. Volume 1 covers it properly.

---


## Things senior engineers notice

1. **The pipeline is production infrastructure.** If it's down, you can't ship a fix during an incident. Its availability needs the same seriousness as the application's.
2. **Scoping beats masking, always.** Masking is a guard against accidents; scoping is a control against intent.
3. **A runner is a trust boundary, and tags are how you enforce it.** The question "which runner may take this job?" is really "which jobs may touch production?".
4. **Scanning without triage is expensive theatre.** The scanner's output is the start of the work, not the end.
5. **"Just re-run it" is a cultural symptom of an unreliable pipeline**, and it erodes every safety guarantee the pipeline was built to provide.
6. **Most CI/CD failures live outside application code** — environment, credentials, capacity, network. Identify the layer before you dig.
7. **Secret detection findings are already-compromised credentials.** Rotation comes before history cleanup.
8. **Shared templates are a blast-radius decision.** Unpinned includes mean someone else's commit can break 200 pipelines at once.
9. **Time-to-restore and deployment frequency tell you more about a delivery system than any pipeline diagram.**
10. **The cheapest security control here is code review on `.gitlab-ci.yml`**, because that file decides what runs with your credentials.

---


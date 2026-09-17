## Things senior engineers notice

1. **The first three lines of a job log answer most questions.** Which runner, which executor, which image. Read them before reading the error.
2. **Isolation is not an optional nicety.** A shell runner shared across teams means one job can leave state that changes another team's result.
3. **A tag is an access-control decision, not just routing.** "Which runner may take this job" often means "which jobs may touch production credentials".
4. **Exit codes are your only real contract with GitLab.** Anything that hides a non-zero exit — a trailing `|| true`, a script that catches errors — silently converts a broken build into a passing one.
5. **Pipeline config being versioned with the code is an underrated property.** You can check out a six-month-old commit and know exactly how it was built. That is what makes reproducible rollback possible later.
6. **Queue time is part of feedback time.** Optimising job scripts while ignoring runner capacity often changes nothing the developer can feel.

---


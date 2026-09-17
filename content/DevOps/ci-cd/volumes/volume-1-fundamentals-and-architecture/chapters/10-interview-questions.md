## Interview questions

**Q: What is a GitLab Runner?**
A separate agent process, installed on its own machine or cluster, that connects to GitLab, picks up jobs, and executes them. GitLab schedules and stores; the runner executes. Runners are registered with an executor that determines the environment each job gets, and can carry tags used to route jobs.

**Q: What's the difference between a pipeline, a stage, and a job?**
A pipeline is one execution of the delivery process for a commit. A stage is a named group of jobs with ordering relative to other stages. A job is one unit of work run by one runner in one isolated workspace. Jobs in the same stage run in parallel; the next stage starts once the previous one succeeds.

**Q: What is an executor and why does it matter?**
It determines where and how a job runs — shell means directly on the runner's OS with whatever is installed there; Docker means a fresh container per job from a declared image; Kubernetes means a pod per job. It matters because it decides reproducibility and isolation: a shell executor inherits whatever the machine and the previous job left behind, a container executor does not.

**Q: A job is stuck in pending. How do you investigate?**
Check runner availability for the project first. Then compare the job's tags against the tags on the available runners — a tag with no matching runner means nothing will ever pick the job up. Then check whether runners are online and not saturated, and whether shared runners are enabled and within quota. The failure is in the runner layer, not the YAML.

**Q: Why does a job pass locally but fail in CI?**
Because the two environments differ in one of three ways: installed tooling, available files, or resolved dependency versions. The runner has only what the image provides and only what is committed to Git. The fix is to make the build depend on nothing outside the repository and the declared environment.

**Q: How do jobs pass data to each other?**
Not by the filesystem — each job gets a clean workspace, possibly on a different machine. Data must be passed explicitly through artifacts, which one job declares and a later job downloads. Cache is a separate mechanism for reusing dependencies and is not a reliable transfer method.

---


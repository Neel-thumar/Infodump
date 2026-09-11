## The question this volume answers

Volume 2 left you with a static thing: an ordered list of tarballs and a JSON config. Volume 1 left you with a running thing: a process in namespaces, inside a cgroup, on an overlay mount.

This volume is the bridge. **What exactly happens between `docker run` and a process existing, and what happens to that process at every subsequent transition?**

The reason this matters beyond trivia: almost every confusing Docker behaviour in production is a lifecycle question wearing a disguise. Why did my container exit with code 137? Why did `docker stop` take ten seconds? Why is my "stopped" container still eating 4 GB of disk? Why did the restart policy resurrect a container I deliberately stopped? Each one has a precise answer at the process level, and you already have the tools to see it.

---


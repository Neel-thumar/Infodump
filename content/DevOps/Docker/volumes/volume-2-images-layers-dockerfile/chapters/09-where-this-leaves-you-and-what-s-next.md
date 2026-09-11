## Where this leaves you, and what's next

You can now open an image and name every part: layers as content-addressed tarballs, a config with the run-time metadata, a manifest tying them together. You know why the cache is a chain and can order any Dockerfile correctly from first principles rather than from a rule you memorized. You've watched a 900 MB image become 8 MB without losing a feature, seen a secret survive its own deletion and then fixed it by moving a line, and moved a tag out from under a running workflow to feel exactly how weak a tag's guarantee is.

**Volume 3: Running, Managing, and Debugging Containers.**

Images are static; next we make them move. The full lifecycle — create, start, stop, pause, kill, remove — with what happens to the underlying process at each transition (including why `docker pause` uses the cgroup freezer rather than a signal). Then `docker run` flag literacy taught by problem rather than by list, each flag introduced through the situation that demands it. Then real debugging: `logs`, `exec`, `inspect`, and entering a container's namespaces directly with the `nsenter` skills you already have. Then we make Volume 1's cgroup theory visible by watching containers get OOM-killed and throttled on purpose. Practical networking — bridges, published ports, name-based container-to-container communication — with the internals saved for Volume 5. And we close on a documented outage caused by a misunderstood restart policy interacting with missing resource limits.

Say "continue" when you're ready.

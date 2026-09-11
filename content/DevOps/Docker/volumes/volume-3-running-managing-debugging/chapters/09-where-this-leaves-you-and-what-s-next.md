## Where this leaves you, and what's next

You can now trace a container from `create` through to `rm` and say what happens to the process, the cgroup, and the overlay at every step. You can read an exit code and know whether the app shut down cleanly, got OOM-killed, or timed out its grace period. You can debug a container with no shell in it, freeze a crash loop before reading its logs, and watch cgroup limits fire on purpose rather than in production.

The recurring theme across all three volumes so far: **Docker's commands are thin wrappers over kernel mechanisms you can inspect directly.** `docker pause` is a write to `cgroup.freeze`. `docker exec` is `setns()`. `-m 256m` is a number in `memory.max`. Whenever Docker's behaviour surprises you, the answer is one level down, and you now know how to look.

One thing this volume deliberately deferred: you used `-v pgdata:/var/lib/postgresql/data` without explaining it, and you watched a stopped container hold 200 MB of a writable layer that `rm` destroyed.

**Volume 4: Data and Persistence.**

Containers are meant to be disposable, and real applications have state — we'll derive that tension explicitly rather than papering over it. Volumes versus bind mounts versus tmpfs: what each actually is at the mount-namespace level, not just which flag to type. Where Docker really puts volume data on your host filesystem, which you'll go find yourself. Backing up and restoring a volume as a worked example. And a close on the data-loss failure that follows directly from what you saw in exercise 3.1 — treating a container's writable layer as if it were storage.

Say "continue" when you're ready.

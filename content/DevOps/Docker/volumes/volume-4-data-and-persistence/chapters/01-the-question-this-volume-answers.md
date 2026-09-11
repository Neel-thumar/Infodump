## The question this volume answers

Everything you've learned so far pushes in one direction: containers are cheap, disposable, replaceable. Volume 2 built images you can rebuild in seconds. Volume 3 had you throwing containers away with `--rm` and treating a crash-restart as routine. The whole model assumes a container is a thing you can destroy without thinking.

Then reality: your database has forty gigabytes of customer records in it.

**These two facts are in direct tension, and the tension is real rather than a gap in your understanding.** A disposable process cannot own durable state. So the question this volume answers is: if containers are disposable, where does the data that must *not* be disposable actually live, and what exactly is the mechanism that lets a throwaway process reach it?

The answer turns out to be one mechanism you already met in Volume 1 — the mount namespace — used three slightly different ways.

---


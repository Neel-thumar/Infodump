## The question this volume answers

Six volumes in, you have built a real application. It has a plaintext password in a committed YAML file, a database running as root, a writable root filesystem, every default Linux capability granted, and base images nobody has looked at.

That is not unusual. It's roughly the median state of containerized software.

But before we fix any of it, there's a prior question that most security guidance skips, and skipping it is why so much container security advice is either paranoid theatre or dangerous overconfidence:

**What does a container actually protect against, and what does it not?**

You have the background to answer this properly now. You know a container is a process with restricted views (Volume 1), sharing the host kernel, with a budget, on an overlay mount. Everything below follows from that, including the limits.

---


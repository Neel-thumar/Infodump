## The First Rule of Tuning: Measure Before You Change

This deserves its own section before any tuning advice because it is the most important point.

**Do not tune nginx based on blog posts.** Tune it based on what is actually happening on your system.

The default settings in modern nginx are sensible for most workloads. Changing them without understanding the current bottleneck can make things worse. Increasing `worker_connections` to 100,000 doesn't help if the bottleneck is a slow database behind your backend. Enabling aggressive gzip doesn't help if your responses are already small.

Before changing any performance setting, ask:

1. **What is the actual problem?** Slow responses? Connection timeouts? High CPU? High memory?
2. **Where is the bottleneck?** nginx itself? The backend? The network? The disk?
3. **What does the data say?** Check access logs (response times), error logs (connection failures, timeouts), system metrics (CPU, memory, open file descriptors, network).

Only after answering these questions does tuning make sense.

With that said, there are settings where the defaults are known to be suboptimal for specific patterns, and understanding them helps you configure nginx correctly from the start.

---


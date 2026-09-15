## Interview Preparation

### Level 1 — Fundamentals

**Q: What is Kubernetes in simple words?**

How to think: do not recite a definition. Describe the problem first.

Answer: It is a system that runs applications across a group of machines. You tell it what you want running, and it decides where to run it and keeps it running. If something dies, it replaces it automatically.

**Q: What is a container orchestrator?**

Answer: Software that decides where containers run, starts and stops them, replaces failed ones, and connects them to the network — instead of a human doing all of that.

### Level 2 — Practical

**Q: You deleted a Pod and it came back. Why?**

Answer: The Pod was managed by a Deployment. A controller compares desired replicas with actual replicas and creates a new Pod when the number is short. Nothing restarted the old Pod — a new one was created.

### Level 3 — Scenario

**Q: A team wants to move a single small internal website to Kubernetes. What do you say?**

How to think: show judgement, not enthusiasm.

Answer: I would ask what problem they are solving. For one small site, Kubernetes adds cluster upgrades, networking, and security work that somebody has to own. A managed app service is usually cheaper and safer. Kubernetes makes sense when they have many services, variable load, or a real need for standard deployment across teams.

### Level 4 — Senior Thinking

**Q: What is the biggest risk when a company adopts Kubernetes?**

Answer: Underestimating operations. The cluster itself becomes a production system that needs upgrades, monitoring, security and on-call. Teams often plan for migration and forget that they now run a distributed platform.


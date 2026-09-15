## What Kubernetes Actually Is

Three things, and nothing more:

**1. A database of what you want.** You write down your intent. Kubernetes stores it, checks it, and remembers it. Technically this is a REST API in front of a key-value store called etcd.

**2. A set of loops that fix things.** Small programs called *controllers* constantly compare "what you asked for" with "what actually exists", and take action to close the gap.

**3. An agent on every machine.** A program called the *kubelet* runs on each node, reads the part of the database that concerns it, and makes its machine match — pulls images, starts containers, reports status back.

That is genuinely the whole system. Everything else is detail on top of these three.


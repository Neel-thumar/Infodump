## Where this leaves you, and what's next

You built container networking from nothing: a namespace, a veth pair, an address, a route, forwarding, source NAT out, destination NAT in. Then you found every one of those pieces in Docker's own setup, read the actual DNAT rule your `-p` flag generated, watched conntrack hold the translation, traced a packet through `PREROUTING` to the bridge to the container, and found the embedded resolver living behind a per-namespace NAT rule at an address that doesn't exist anywhere.

And you understand the firewall bypass not as a gotcha to memorize but as a consequence you could have predicted from the packet path.

That completes the mechanism tour. Volumes 1 to 5 covered namespaces, cgroups, layered filesystems, storage, and networking — every kernel feature that makes a container. **From here the guide shifts from "how does this work" to "how do you actually build and run things with it."**

**Volume 6: Docker Compose and Multi-Container Applications.**

Every command you've typed has managed one container. Real applications are an app, a database, a cache, a proxy — each needing the right network, the right volumes, the right environment, started in a workable order, reproducibly, by anyone who clones the repo. We'll derive what Compose is actually for, build `docker-compose.yml` from first principles (services, networks, volumes, env files) using the networking and storage you now understand rather than treating them as magic, and build a real multi-service application end to end. Then the classic gotcha, with a proper look at why it bites: `depends_on` waits for *started*, not for *ready* — and the race condition that follows has broken more first deployments than any other single misunderstanding in Docker.

Say "continue" when you're ready.

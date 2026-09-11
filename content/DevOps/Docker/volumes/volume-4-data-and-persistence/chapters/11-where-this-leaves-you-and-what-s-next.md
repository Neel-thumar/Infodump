## Where this leaves you, and what's next

You can now state exactly where every byte a container writes ends up, and why. Three storage types, one mechanism — a mount placed into the container's mount namespace — differing only in what sits behind it. You've watched a database's data vanish, then not vanish, and understood the difference as a lifecycle property rather than a Docker mystery. You've found volume data on your own disk, moved it between containers and distributions as a tarball, and completed a restore into a fresh volume that proved the backup was real.

The through-line of Volumes 1 to 4: **Docker's abstractions are thin, and every one of them bottoms out in something you can inspect with standard Linux tools.** Namespaces in `/proc`. cgroups in `/sys/fs/cgroup`. Layers in `/var/lib/docker/overlay2`. Volumes in `/var/lib/docker/volumes`. There is no hidden layer left where the magic could be hiding.

Except one. Networking is the last part of Volume 1's list you've only used practically, never opened up. You've published ports without knowing what publishing does to your host. You've resolved container names by DNS without knowing who answers. And in Volume 3 I claimed — without proof — that Docker writes firewall rules that may bypass rules you wrote yourself.

**Volume 5: Networking, Deeply.**

The four network drivers at the namespace and `iptables` level. Veth pairs and the bridge: what physically connects an isolated network namespace to the outside world. A packet traced from an external client all the way to a process inside a container, hop by hop, with you running the commands to see each hop. How NAT and port publishing are actually implemented, including the exact rules in your `nat` table right now. How embedded DNS makes container names resolve, and where that server lives. And we close on a documented case of container networking misconfiguration causing real security exposure — the "I thought that port was internal" failure, with specifics.

Say "continue" when you're ready.

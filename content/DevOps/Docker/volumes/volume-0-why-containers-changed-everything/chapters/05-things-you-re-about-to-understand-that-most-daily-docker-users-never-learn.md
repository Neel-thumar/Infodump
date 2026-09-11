## Things you're about to understand that most daily Docker users never learn

Concrete teasers, each pulled from a specific later volume. If several of these make you want to skip ahead, good — that's the reaction I'm going for.

- **Why "a container is a lightweight VM" is not a simplification but a category error.** There is no guest kernel. There is no boot. Run `ps aux` on your host while a container is running and you will see the container's process sitting there in your own process table, an ordinary PID like any other. *(Volume 1)*
- **You can build a container by hand**, with no Docker installed, using `unshare`, `mount`, and a few writes into `/sys/fs/cgroup`. Doing this once permanently destroys the mystique. *(Volume 1, and as an optional deep project in Volume 9)*
- **Why a one-character change to your Dockerfile can cut your build from four minutes to four seconds** — and why the rule of thumb everyone repeats ("copy your lockfile before your source") is a *consequence* of the cache mechanism, not the mechanism itself. *(Volume 2)*
- **What `latest` actually is.** It is not "the newest version." It is a tag with no special properties whatsoever, which Docker happens to use as a default. The production failure mode this causes is specific and repeatable. *(Volume 2)*
- **The exact difference between `CMD` and `ENTRYPOINT`,** which almost nobody can state precisely, and the shell-form vs exec-form trap that silently means your container never receives `SIGTERM` and gets hard-killed on every deploy. *(Volumes 2 and 3)*
- **Where your container's data physically lives on your disk right now.** You will go find it with `ls`. And you'll see why writing to a container's writable layer and expecting it to survive is one of the most common data-loss stories in the field. *(Volume 4)*
- **How a packet actually gets from your browser to a container** — the veth pair, the bridge, and the specific `iptables` NAT rule Docker wrote into your host's kernel without telling you. You'll read that rule yourself. *(Volume 5)*
- **Why `depends_on` does not do what its name suggests,** and the race condition it has caused in approximately every Compose project ever written. *(Volume 6)*
- **What containers do *not* protect you against.** The kernel is shared. A kernel exploit crosses the boundary. There is a whole genre of real, documented attacks — including automated cryptomining worms that scan the internet for exposed Docker daemons — that exist precisely because people believed the isolation was stronger than it is. *(Volume 7)*
- **Why Docker, Inc. invented the defining infrastructure technology of the decade and then had to sell its enterprise business to Mirantis in 2019.** The gap between inventing a technology and capturing value from it is one of the most instructive stories in the industry, and it's routinely misremembered. *(Volume 8)*

---


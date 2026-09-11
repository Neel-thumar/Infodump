## The incident: the firewall that wasn't consulted

This one is unusual: it is not a bug, not a CVE, and not a single company's outage. It is a **documented design decision** whose consequences have exposed an enormous number of databases to the internet, and Docker documents it themselves.

### The setup

An Ubuntu or Debian server. The admin does the responsible thing:

```bash
# illustrative — don't run this unless you know your SSH access survives it
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status
```

Default deny. Only SSH open. Then a container is started for an internal service:

```bash
docker run -d --name db -p 5432:5432 -e POSTGRES_PASSWORD=devpassword postgres:16
```

The admin's mental model: UFW denies everything except 22, so 5432 is internal only.

**The reality: port 5432 is open to the entire internet.** And it is not subtle — `ufw deny 5432` explicitly will not close it either.

### Why, and you can already derive it

Look back at the packet trace. `ufw` writes its rules into the **`INPUT`** chain (via `ufw-user-input`). Docker publishes ports with a **DNAT rule in the `nat` table's `PREROUTING`** chain, which rewrites the destination *before* the routing decision. The rewritten packet is destined for `172.17.0.2`, which is not the host, so the kernel puts it on the **`FORWARD`** path.

The packet never enters `INPUT`. UFW's rules live in `INPUT`. **The two systems operate on entirely different parts of the packet path**, so `ufw status` can honestly report "deny incoming" while the port answers the world.

Docker's own documentation states this plainly: traffic to and from published container ports is diverted before it reaches the chains ufw uses, because Docker routes container traffic in the `nat` table.

> **Confidence: high.** This is documented in Docker's official networking documentation and independently described across many technical writeups. It is longstanding intended behaviour, not a defect — which is precisely why it keeps catching people.

### Why it's so dangerous in practice

Four factors compound:

1. **`-p 5432:5432` binds `0.0.0.0`** — every interface, including the public one. The short form gives no hint of this.
2. **The admin has positive evidence they're safe.** `ufw status` says default deny. That's worse than no firewall, because it stops the investigation.
3. **Database images ship with weak development defaults**, and a `POSTGRES_PASSWORD` set for local convenience becomes a production credential.
4. **The internet is scanned continuously.** An exposed database on a default port is typically found within hours, not weeks. This is the same automated-scanning economy behind Volume 2's cryptomining images, and it's the direct precursor to Volume 7's exposed-daemon attacks.

Copy-pasting a Compose file that publishes every service's port — extremely common, because it's convenient during development — turns this from one mistake into several at once.

### The fixes, in order of preference

**1. Don't publish what doesn't need publishing.** The strongest fix, and free. A database used only by your app needs no `-p` at all — it needs a shared network and a name:

```bash
docker network create private
docker run -d --name db --network private -e POSTGRES_PASSWORD=x postgres:16
docker run -d --name app --network private -p 127.0.0.1:8080:8080 myapp:v2
```

**2. Bind to loopback when you do publish.** `-p 127.0.0.1:5432:5432` is reachable from the host (and SSH tunnels) and from nowhere else. Make this your reflex for anything not deliberately public.

**3. Use `DOCKER-USER` for real filtering.** It's evaluated before Docker's rules and Docker never rewrites it:

```bash
# illustrative — understand each line before running on a host you care about
sudo iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -I DOCKER-USER -i eth0 -j DROP
```

Order matters (later `-I` inserts go first), the interface name must match your real uplink, and these do not survive a reboot without `iptables-persistent`. Community tooling exists to bridge UFW config into `DOCKER-USER`; read it before trusting it.

**4. Put a firewall outside the host.** Cloud security groups, a VPC firewall, or a hardware firewall sit on the wire and don't care what your host's iptables say. This is the only layer that's robust against the entire class of mistake.

**5. Verify from outside, always.** The most valuable habit in this volume:

```bash
sudo ss -tlnp | grep -E "0.0.0.0|\[::\]"
```

Anything bound to `0.0.0.0` is a candidate for public exposure. Then scan from a *different machine* — `nmap` from your laptop against the server. **Do not trust `ufw status`; trust what the network can actually see.**

### The general lesson

Two subsystems each behaved correctly and documented themselves accurately. The failure was in the seam — the same shape as Volume 1's CVE-2019-5736, where every namespace worked and the escape came through a file descriptor nobody had considered crossing the boundary.

**Isolation is a property of a whole system, not of any component.** Your security posture is not the sum of your tools' configurations; it's what actually happens to a packet. The only way to know that is to test it from the outside.

---


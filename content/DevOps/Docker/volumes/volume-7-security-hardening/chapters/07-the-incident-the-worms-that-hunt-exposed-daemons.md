## The incident: the worms that hunt exposed daemons

This is the best-documented category of real-world container attack, and you now have exactly the background to understand it end to end.

### Graboid, October 2019

Unit 42 researchers at Palo Alto Networks identified a cryptojacking worm they named **Graboid** — after the sandworms in the 1990 film *Tremors*, because it moves in short bursts and is, in their own assessment, relatively inept. It spread to **more than 2,000 unsecured Docker hosts**. Unit 42 described it as the first cryptojacking worm seen spreading via containers in the Docker Engine (Community Edition).

**The entry point was not a vulnerability.** A Shodan search at the time showed more than 2,000 Docker engines exposed to the internet with no authentication or authorization, allowing full control of the engine and the host. Unit 42's Jen Miller-Osborn put it plainly: the problem was a lack of updating any of the initial security settings — the entry point existed because none of the defaults were changed.

**How it worked**, and every step should now be transparent to you:

1. Scan for Docker API endpoints reachable without authentication (the daemon's TCP port, conventionally 2375 unencrypted).
2. Use that unauthenticated API to pull and run a malicious image from Docker Hub. The images involved were named to blend in — `pocosow/centos` and `gakeaws/nginx` — and had been downloaded more than 10,000 and 6,500 times respectively.
3. The container downloads scripts and a list of vulnerable hosts from command-and-control servers.
4. Each iteration randomly picks three targets: install the worm on one, stop the miner on another, start the miner on a third. That deliberately odd behaviour is why infection looks intermittent — Unit 42 measured each miner as active about 63% of the time, in periods of around 250 seconds.
5. Monero mining, with the capacity to fetch new scripts — meaning it could be repurposed to ransomware or anything else at the operator's discretion.

Unit 42 simulated the spread and estimated that, assuming 70% host availability, it would take **under 60 minutes to infect 1,400 vulnerable hosts**. Over half the vulnerable hosts were in China, about 14% in the US. The Docker team worked with Unit 42 to remove the malicious images.

> **Confidence: high.** Sourced from Unit 42's own published research and corroborated across Threatpost, Dark Reading, Help Net Security and others.

### It escalated: TeamTNT and Cetus

Graboid was the opening act. Unit 42 later set up a **Docker daemon honeypot** and found **Cetus**, a more capable cryptojacking worm, created by **TeamTNT** — a group known for attacking AWS and Docker daemons. The trajectory across this family of campaigns is the important part: from "mine some Monero" to **stealing cloud credentials** found on compromised hosts, which converts a single exposed daemon into access to an entire cloud account.

> **Confidence: high** on Unit 42's Cetus research and its attribution to TeamTNT; **medium** on the broader campaign details, which are reported across many vendor writeups of varying rigour.

### Why it keeps working

Four reasons, each of which you can now explain from mechanism:

1. **The Docker API is root.** You proved it at the top of this volume. An unauthenticated daemon is an unauthenticated root shell — it isn't an escalation path, it's the destination.
2. **The daemon is exposed by accident.** Nobody decides to publish port 2375. It happens when someone follows a tutorial for remote Docker access, configures `-H tcp://0.0.0.0:2375` for a CI integration, or runs a cloud VM whose firewall doesn't cover what Docker does to iptables — which is exactly Volume 5's incident.
3. **Container activity is invisible to traditional tooling.** Unit 42 made this point directly: most endpoint protection doesn't inspect data and activity inside containers. A miner running in a container can be entirely invisible to host-level security software.
4. **It's fully automated.** Scanning the entire IPv4 space for a given port takes hours. There is no "too small to be a target."

### The defences, in order

**1. Never expose the Docker API over TCP.** The default on Debian is a Unix socket at `/var/run/docker.sock` with root ownership, which is right. Check yours:

```bash
sudo ss -tlnp | grep -E "2375|2376" || echo "daemon not listening on TCP — correct"
ps aux | grep "[d]ockerd" | head -1
sudo cat /etc/docker/daemon.json 2>/dev/null || echo "(no daemon.json — defaults in use)"
```

**Expect:** nothing on 2375/2376, and no `-H tcp://` in the dockerd command line.

**2. For genuine remote access, use SSH.** `DOCKER_HOST=ssh://user@host docker ps` gives you remote Docker over an authenticated, encrypted channel with no new listening port. This is the correct answer and it's easy:

```bash
# from your laptop, against a server you control
# DOCKER_HOST=ssh://you@server.example.com docker ps
```

If you truly need TCP, it's mTLS (port 2376 with `--tlsverify`, client certificates required) — never plain 2375.

**3. Treat `docker` group membership as root.** Audit it:

```bash
getent group docker
```

Everyone on that list has root on the machine. On a shared server, that's an access-control decision, not a convenience.

**4. Monitor what your containers do.** A miner is loud in exactly one way: sustained 100% CPU. `docker stats`, cgroup CPU accounting, and alerts on unexpected outbound connections catch this category cheaply.

**5. Scan and pin your images.** The malicious images were on Docker Hub with plausible names — Volume 2's lesson, arriving here as the second stage of the attack.

**6. Run rootless where you can.** Volume 8 covers it; it removes the "daemon runs as root" premise entirely.

### The lesson

Every incident in this guide has had the same shape.

**CVE-2019-5736**: namespaces worked, a file descriptor crossed the boundary.
**docker123321**: the registry worked, trust was the gap.
**UFW bypass**: both subsystems worked, the seam didn't.
**Graboid**: no vulnerability at all — a default nobody changed.

**Security failures cluster at the boundaries between correctly-functioning components, and at defaults nobody revisited.** Docker's defaults optimize for "it works in thirty seconds," which is exactly the right choice for adoption and exactly the wrong configuration for production. Nothing in this volume defends against a novel kernel exploit. What it does is remove the easy paths — and the overwhelming majority of real attacks take easy paths, because they're automated and there is always an easier target.

---


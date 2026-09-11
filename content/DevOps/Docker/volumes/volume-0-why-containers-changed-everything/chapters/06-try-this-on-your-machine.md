## TRY THIS ON YOUR MACHINE

Volume 0 is narrative, so these are short. Their job is to get Docker installed and to let you *see*, before any theory, the two facts the rest of the guide explains: containers are processes, and images are shared layers.

> **Assumptions:** Debian (bookworm or later), a user with `sudo`, an internet connection. Everything here is non-destructive. Disk usage and cleanup are flagged per exercise.

### 0.1 — Install Docker Engine from Docker's official repository

Do **not** use `apt install docker.io` from Debian's own repos for this guide — it's an older, differently-packaged build, and version drift will cause confusing mismatches with what I show you later. Use Docker's repository.

```bash
# Remove any conflicting older packages (safe if none are installed)
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do
  sudo apt remove -y $pkg 2>/dev/null
done

# Add Docker's official GPG key
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository, pinned to your Debian codename and architecture
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
sudo docker run hello-world
```

Optionally, add yourself to the `docker` group so you can drop the `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker   # or log out and back in
docker run hello-world
```

**Expect:** a short greeting explaining what just happened. **Disk:** roughly 500 MB for the Docker packages, plus a ~20 KB image.

**Security note, said once and meant:** membership in the `docker` group is equivalent to root on this machine. The daemon runs as root, and anyone who can talk to it can mount your host filesystem into a container. This is fine on your personal laptop and is a real finding on a shared server. Volume 7 explains exactly why, and Volume 8 covers the rootless alternatives.

**Why it's interesting:** notice you already have three separate things installed — `docker-ce` (the daemon), `docker-ce-cli` (the client you type at), and `containerd.io` (a lower-level runtime Docker delegates to). Most people believe they installed one program. Volume 8 is largely about why that's three.

### 0.2 — Watch a container be an ordinary process

Two terminals.

Terminal A:

```bash
docker run --rm --name sleeper alpine sleep 300
```

Terminal B:

```bash
ps -ef | grep "[s]leep 300"
sudo ls -l /proc/$(pgrep -f "sleep 300")/ns/
```

**Expect:** your host's `ps` shows `sleep 300` as a plain process owned by root, with a normal host PID. The second command lists that process's namespace links — `mnt`, `net`, `pid`, `uts`, `ipc`, `cgroup` — each an inode number.

**Why it's interesting:** there is no virtual machine here and nothing to boot. Docker started a process and attached it to a different set of namespaces. That inode list is, almost in its entirety, the thing that makes it "a container." Compare those inode numbers to your own shell's with `ls -l /proc/self/ns/` — the ones that differ are exactly the isolation you're getting.

**Cleanup:** Terminal A exits on its own after five minutes, or press `Ctrl-C`. `--rm` removes the container.

### 0.3 — Watch layer sharing happen in real time

```bash
docker pull python:3.12-slim
docker pull python:3.12-alpine
docker images
docker system df
```

Now pull something that shares a base with one of those:

```bash
docker pull debian:bookworm-slim
docker system df
```

**Expect:** `docker images` reports sizes that, added up, exceed what `docker system df` reports as actually used. The `RECLAIMABLE` column and the shared-layer accounting is where the discrepancy lives.

**Why it's interesting:** the "size" of an image is a lie of convenience. Images are not files; they're references into a shared, content-addressed layer store. This is the mechanism behind Volume 2 and the reason a fifteen-image machine doesn't need fifteen copies of Debian.

**Disk:** roughly 250–350 MB total. **Cleanup:**

```bash
docker rmi python:3.12-slim python:3.12-alpine debian:bookworm-slim
```

### 0.4 — Time it against your intuition

```bash
time docker run --rm alpine echo hello
time (for i in $(seq 1 20); do docker run --rm alpine true; done)
```

**Expect:** the first run, with the image already local, in the low hundreds of milliseconds. Twenty sequential runs in a few seconds — and note that most of that time is the Docker *client* talking to the daemon, not the container itself starting.

**Why it's interesting:** hold this number against the honest alternative. Booting a VM to get a guaranteed environment is 30–90 seconds. You are getting a comparable environmental guarantee for roughly the cost of `fork()` plus some filesystem setup. That ratio — four orders of magnitude — is the entire economic argument for containers, and Volume 1 explains precisely where the saved time went.

**Cleanup:** none; `--rm` handles it. The `alpine` image (~8 MB) stays cached — keep it, you'll use it constantly.

### 0.5 — Meet chroot, the 1979 ancestor

Build the oldest version of a container by hand, with no Docker involved.

```bash
mkdir -p ~/tiny-root/bin
sudo apt install -y busybox-static
cp /bin/busybox ~/tiny-root/bin/
cd ~/tiny-root
for cmd in sh ls ps cat mount; do ln -sf /bin/busybox bin/$cmd; done
sudo chroot ~/tiny-root /bin/sh
```

Inside that shell, try:

```bash
ls /
ps aux
```

**Expect:** `ls /` shows only your tiny tree — the filesystem is successfully confined. But `ps aux` shows... something surprising. Depending on whether `/proc` is visible, you'll either get an error or a view that leaks host information. Exit with `exit`.

**Why it's interesting:** this is exactly the 1979 state of the art, and it demonstrates the gap that took thirty-four more years to close. The filesystem is isolated. The **process table, the network stack, the hostname, the user IDs, and the resource limits are not.** Every one of those gaps is a Linux namespace or a cgroup, and Volume 1 fills them in one at a time.

**Disk:** ~2 MB. **Cleanup:**

```bash
rm -rf ~/tiny-root
```

---


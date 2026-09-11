## TRY THIS ON YOUR MACHINE

Five final exercises. These are retrospective and consolidating rather than new material — the point is to find out what actually stuck.

### 9.1 — Explain a container without using the word "Docker"

Not a command. An exercise.

Write, in your own words, no more than 300 words, an explanation of what a container is — to a competent Linux engineer who has never used one. Constraints: you may not use the words *Docker*, *lightweight*, or *virtual machine*. You must name at least three kernel mechanisms and say what each one does.

Then check yourself against Volume 1 and see what you got wrong or vague.

**Why it's interesting:** the constraint against "lightweight VM" forces you to construct the actual explanation instead of reaching for the metaphor. If you can do this cleanly, you know the material. If you find yourself hand-waving at a particular point, that's precisely where to re-read.

### 9.2 — Audit a machine like you're being paid to

Run the full sweep against any host you're responsible for — or your own laptop.

```bash
echo "=== DAEMON EXPOSURE ==="
sudo ss -tlnp | grep -E ":2375|:2376" || echo "OK: no TCP daemon listener"
getent group docker
echo
echo "=== CONTAINERS WITH HOST-LEVEL ACCESS ==="
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} privileged={{.HostConfig.Privileged}} pid={{.HostConfig.PidMode}} net={{.HostConfig.NetworkMode}}'
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} {{range .Mounts}}{{.Source}} {{end}}' | grep -E "docker.sock|^\S+ /$" || echo "OK: no socket mounts"
echo
echo "=== UNLIMITED CONTAINERS ==="
docker ps -q | xargs -r docker inspect --format \
  '{{.Name}} mem={{.HostConfig.Memory}} pids={{.HostConfig.PidsLimit}} user={{.Config.User}}'
echo
echo "=== PUBLIC PORT BINDINGS ==="
docker ps --format "{{.Names}} {{.Ports}}" | grep "0.0.0.0" || echo "OK: nothing bound to all interfaces"
echo
echo "=== LOG ROTATION ==="
docker info --format 'driver: {{.LoggingDriver}}'
sudo grep -A5 "log-opts" /etc/docker/daemon.json 2>/dev/null || echo "WARNING: no daemon.json — logs are unbounded (Volume 3)"
echo
echo "=== UNATTRIBUTABLE VOLUMES ==="
docker volume ls -qf dangling=true | wc -l
echo
echo "=== DISK ==="
docker system df
```

**Why it's interesting:** every check maps to a specific incident in this guide — Graboid, the UFW bypass, the restart-loop disk exhaustion, the writable-layer data loss. Save it as a script. It's a genuinely useful artifact, and it's yours.

### 9.3 — Build the smallest useful image you can

Take any program you've written and get it as small as possible, measuring at each step.

```bash
mkdir -p ~/smallest && cd ~/smallest
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "small")
	})
	http.ListenAndServe(":8080", nil)
}
EOF
printf 'module smallest\n\ngo 1.22\n' > go.mod

printf 'FROM golang:1.22\nWORKDIR /s\nCOPY . .\nRUN go build -o /app .\nCMD ["/app"]\n' > Dockerfile.1
printf 'FROM golang:1.22 AS b\nWORKDIR /s\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /app .\nFROM alpine:3.20\nCOPY --from=b /app /app\nCMD ["/app"]\n' > Dockerfile.2
printf 'FROM golang:1.22 AS b\nWORKDIR /s\nCOPY . .\nRUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app .\nFROM scratch\nCOPY --from=b /app /app\nUSER 10001\nENTRYPOINT ["/app"]\n' > Dockerfile.3

for n in 1 2 3; do docker build -qf Dockerfile.$n -t small:v$n . > /dev/null; done
docker images small --format "table {{.Tag}}\t{{.Size}}"
```

**Expect:** roughly 900 MB, then ~15 MB, then ~7 MB. Two orders of magnitude, with the final image containing exactly one file.

**Why it's interesting:** it compresses Volume 2 into one measurement you can show someone. And the last image is worth sitting with — an image with no shell, no libc, no package manager, and no OS, which nonetheless serves HTTP. That's what "a container is a process" means, taken to its conclusion. **Cleanup:** `cd ~ && rm -rf ~/smallest && docker rmi small:v1 small:v2 small:v3`

### 9.4 — Start your own runtime, tonight

Thirty minutes for a working skeleton, using only what Volume 1 taught you.

```bash
mkdir -p ~/myruntime && cd ~/myruntime

docker create --name rootfs-src alpine:3.20 > /dev/null
docker export rootfs-src -o rootfs.tar
docker rm rootfs-src > /dev/null
mkdir -p rootfs && tar -xf rootfs.tar -C rootfs

cat > mycontainer.sh <<'SCRIPT'
#!/bin/bash
set -e
ROOTFS="$(dirname "$(readlink -f "$0")")/rootfs"
CG=/sys/fs/cgroup/mycontainer

mkdir -p $CG
echo "100M" > $CG/memory.max
echo "50"   > $CG/pids.max

echo "[mycontainer] starting with namespaces + cgroup limits"
unshare --pid --fork --mount --uts --ipc --net --mount-proc="$ROOTFS/proc" \
  chroot "$ROOTFS" /bin/sh -c '
    hostname mycontainer
    echo "--- inside ---"
    hostname
    ps aux
    ip addr | head -4
    exec /bin/sh'

rmdir $CG 2>/dev/null || true
SCRIPT
chmod +x mycontainer.sh
sudo ./mycontainer.sh
```

**Expect:** a shell in its own PID, mount, UTS, IPC and network namespaces, on an Alpine root filesystem, with a memory and process cap. Exit with `exit`.

**Why it's interesting:** that's forty lines, and it is recognizably a container runtime. What it's missing is the roadmap: `pivot_root` instead of `chroot`, capability drops, a seccomp filter, an overlay root assembled from image layers, a veth pair, and an OCI `config.json` parser. Each one is a section you've already read. **Flagged:** creates a cgroup under `/sys/fs/cgroup` and removes it on exit; if the script is interrupted, clean up with `sudo rmdir /sys/fs/cgroup/mycontainer`. **Cleanup:** `cd ~ && rm -rf ~/myruntime`

### 9.5 — Delete everything, then rebuild it from memory

```bash
docker ps -aq | xargs -r docker rm -f
docker system prune -a --volumes -f
docker system df
```

**Flagged: this deletes every image, container, and volume on the machine.** That's the point — do it only if you're happy to.

Then, without looking at any previous volume, rebuild the Volume 6 stack from scratch: a service, a database with a named volume, a cache, a private network, healthchecks with proper `depends_on` conditions, non-root users, dropped capabilities, resource limits, and a loopback-bound published port.

**Why it's interesting:** recall is a different skill from recognition, and it's the one that matters at 3am. Whatever you have to look up is what you actually need to review — and you'll find it's less than you fear.

---


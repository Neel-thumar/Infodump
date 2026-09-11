## TRY THIS ON YOUR MACHINE

> Some exercises install optional packages; each is flagged with its cleanup.

### 8.1 — Watch the full delegation chain for one container

```bash
docker run -d --name chain --rm alpine sleep 300
PID=$(docker inspect -f '{{.State.Pid}}' chain)

echo "--- container process and its ancestry ---"
pstree -sp $PID 2>/dev/null || (sudo apt install -y psmisc && pstree -sp $PID)

echo "--- what containerd knows ---"
CID=$(docker inspect -f '{{.Id}}' chain)
sudo ctr --namespace moby containers info $CID 2>/dev/null | head -20

echo "--- the OCI runtime spec containerd handed to runc ---"
sudo ctr --namespace moby containers info $CID 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
spec=d.get('Spec',{})
print('namespaces:', [n['type'] for n in spec.get('linux',{}).get('namespaces',[])])
print('capabilities (bounding):', spec.get('process',{}).get('capabilities',{}).get('bounding',[])[:5], '...')
print('process args:', spec.get('process',{}).get('args'))
" 2>/dev/null

docker stop chain
```

**Expect:** the process tree showing `systemd → containerd-shim-runc-v2 → sleep` with no `dockerd` in the ancestry, and a JSON spec listing exactly the namespaces from Volume 1 and the capabilities from Volume 7.

**Why it's interesting:** that JSON *is* the OCI Runtime Spec. Every flag you've typed across eight volumes — `--cap-drop`, `-m`, `--read-only`, `--network` — is a field in that document. Docker's CLI is, functionally, a generator for it.

### 8.2 — Run a container with Docker completely uninvolved

```bash
sudo ctr images pull docker.io/library/alpine:3.20
sudo ctr run --rm docker.io/library/alpine:3.20 noDocker sh -c '
  echo "hostname: $(hostname)"
  echo "pid 1: $(ps aux | head -2 | tail -1)"
  cat /etc/os-release | head -2'

echo "--- meanwhile, what does Docker think exists? ---"
docker ps -a | head -3
sudo ctr images rm docker.io/library/alpine:3.20
```

**Expect:** a working container; `docker ps -a` knows nothing about it.

**Why it's interesting:** it separates "containers" from "Docker" experimentally rather than rhetorically. Everything you understand about namespaces, images and layers applies here, to a stack Docker isn't part of. This is what the OCI bought the industry.

### 8.3 — Prove an image is not Docker-specific

```bash
mkdir -p /tmp/oci-demo && cd /tmp/oci-demo
docker pull alpine:3.20
docker save alpine:3.20 -o alpine.tar
mkdir -p unpacked && tar -xf alpine.tar -C unpacked

echo "--- OCI layout markers ---"
ls unpacked/
cat unpacked/oci-layout 2>/dev/null
python3 -m json.tool unpacked/index.json 2>/dev/null | head -20

echo "--- mediaTypes tell you the spec in use ---"
grep -o '"mediaType":"[^"]*"' unpacked/index.json 2>/dev/null | sort -u
```

**Expect:** an `oci-layout` file, an `index.json`, and media types containing `application/vnd.oci.*` or `application/vnd.docker.*` — both standardized formats with documented specifications.

**Why it's interesting:** the directory you're looking at is defined by a public specification anyone can implement, which is why tools written by people who have never spoken to each other can all read it. Compare this to a VM disk image's format story. **Cleanup:** `cd ~ && rm -rf /tmp/oci-demo`

### 8.4 — Try a rootless container and see the UID mapping

Install Podman alongside Docker — they coexist without conflict.

```bash
sudo apt install -y podman
podman run --rm alpine echo "hello from podman, no daemon"

echo "--- who am I inside? ---"
podman run --rm alpine id

echo "--- who am I from the host's perspective? ---"
podman run -d --name rootlesstest alpine sleep 60
PID=$(podman inspect -f '{{.State.Pid}}' rootlesstest)
ps -o pid,user,cmd -p $PID
cat /proc/$PID/uid_map
podman stop rootlesstest && podman rm rootlesstest

echo "--- contrast with Docker ---"
docker run -d --name rootfultest --rm alpine sleep 60
DPID=$(docker inspect -f '{{.State.Pid}}' rootfultest)
ps -o pid,user,cmd -p $DPID
docker stop rootfultest

echo "--- and is there a podman daemon? ---"
pgrep -a podman || echo "no podman daemon — correct, it's daemonless"
```

**Expect:** inside the Podman container you are `uid=0(root)`; on the host, that same process is owned by **your user**, with a `uid_map` showing the translation. The Docker container's process is owned by **root**. And there is no podman daemon running between invocations.

**Why it's interesting:** this is Volume 1's user namespace and Volume 7's threat model made concrete in one comparison. A container escape from the Podman container lands as you, with your permissions. From the Docker one, it lands as root. That's the entire architectural argument, visible in two `ps` lines. **Disk:** ~100 MB for Podman. **Cleanup:** `sudo apt remove -y podman` if you don't want to keep it.

### 8.5 — Measure the runtime layers

```bash
echo "--- what's actually installed ---"
dpkg -l | grep -E "docker-ce|containerd" | awk '{print $2, $3}'

echo "--- what's running, and how much memory each layer costs ---"
ps -eo pid,rss,comm | grep -E "dockerd|containerd|shim" | \
  awk '{printf "%-28s %6.1f MB\n", $3, $2/1024}'

echo "--- container start time through the full stack ---"
time docker run --rm alpine true

echo "--- and through containerd alone ---"
sudo ctr images pull -q docker.io/library/alpine:3.20 > /dev/null 2>&1
time sudo ctr run --rm docker.io/library/alpine:3.20 timing true
sudo ctr images rm docker.io/library/alpine:3.20 > /dev/null
```

**Expect:** `dockerd` and `containerd` each consuming meaningful resident memory even when idle, a shim per running container, and `ctr` starting a container noticeably faster than `docker` — because it skips the CLI, the daemon's REST API, and the network and volume setup that Docker performs.

**Why it's interesting:** it quantifies what the convenience layer costs. On a laptop, irrelevant. On a node running 200 containers, or an edge device with 512 MB of RAM, this is exactly why Kubernetes talks to containerd directly rather than going through Docker — and why the dockershim removal was a simplification rather than a loss.

### Cleanup for this volume

```bash
docker ps -aq | xargs -r docker rm -f
docker system prune -f
sudo ctr --namespace moby containers list | head -3
```

---


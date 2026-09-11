## TRY THIS ON YOUR MACHINE

> All exercises use `~/docker-app` from earlier in this volume unless stated. Disk and cleanup flagged per item.

### 2.1 — Watch layer sharing pay for itself

```bash
docker pull python:3.12-slim
docker system df
docker build -t myapp:v2 ~/docker-app
docker system df
```

**Expect:** the python base is ~130 MB. After building your app on top, total disk used goes up by only a few tens of MB, not another 130.

Now build a second, unrelated app on the same base and compare:

```bash
mkdir -p /tmp/app2 && printf 'FROM python:3.12-slim\nRUN pip install --no-cache-dir requests\n' > /tmp/app2/Dockerfile
docker build -t app2:v1 /tmp/app2
docker images | grep -E "python|myapp|app2"
docker system df
```

**Expect:** `docker images` claims both apps are ~130+ MB each. `docker system df` shows total usage far below the sum. The base layer exists **once**.

**Why it's interesting:** the "size" column is the size of the full stack, not the incremental cost. Teams regularly panic about image sizes that don't actually consume the disk they appear to. **Cleanup:** `docker rmi app2:v1; rm -rf /tmp/app2`

### 2.2 — Find the secret that `RUN rm` didn't delete, and then fix it

Volume 1 showed the whiteout mechanism. Now do it properly.

```bash
mkdir -p ~/secret-demo && cd ~/secret-demo
cat > Dockerfile.leaky <<'EOF'
FROM alpine:3.20
RUN echo "AWS_SECRET=hunter2hunter2" > /creds && \
    cat /creds > /dev/null
RUN rm /creds
EOF
docker build -f Dockerfile.leaky -t leaky .
docker save leaky -o leaky.tar && mkdir -p x && tar -xf leaky.tar -C x
grep -r "hunter2" x/ 2>/dev/null | head -3
```

**Expect:** the string is found in a layer blob despite being "removed."

Now the fix — never let it be committed in the first place:

```bash
cat > Dockerfile.clean <<'EOF'
FROM alpine:3.20
RUN echo "AWS_SECRET=hunter2hunter2" > /creds && \
    cat /creds > /dev/null && \
    rm /creds
EOF
docker build -f Dockerfile.clean -t notleaky .
docker save notleaky -o notleaky.tar && mkdir -p y && tar -xf notleaky.tar -C y
grep -r "hunter2" y/ 2>/dev/null | head -3
```

**Expect:** nothing found. Same commands, different instruction boundaries.

**Why it's interesting:** the *only* difference is where the layer boundary falls. A layer is committed at the end of each `RUN`; anything that exists when the instruction ends is permanent, and anything created and destroyed *within* one instruction never existed as far as the image is concerned. This single mental model prevents most accidental image bloat and a good share of credential leaks.

**Disk:** ~30 MB. **Cleanup:** `cd ~ && rm -rf ~/secret-demo && docker rmi leaky notleaky`

### 2.3 — Race the cache

```bash
cd ~/docker-app
docker build --no-cache -t myapp:cold . 2>&1 | tail -1
time docker build --no-cache -q -t myapp:cold .
touch app.py
time docker build -q -t myapp:v2 .
time docker build -f Dockerfile.badorder -q -t myapp:badorder .
```

**Expect:** the cold build takes tens of seconds. The well-ordered rebuild after touching `app.py` takes a second or two. The badly-ordered one re-runs `pip install`.

**Why it's interesting:** you're measuring the cost of one line's position in a file. On a real project with a hundred dependencies, this is the difference between a fifteen-second inner loop and a three-minute one — and the person who structured the Dockerfile determines which one the whole team lives with.

### 2.4 — Read the whole build history of an image you didn't build

```bash
docker pull nginx:1.27
docker history nginx:1.27 --no-trunc --format "table {{.Size}}\t{{.CreatedBy}}" | head -20
docker inspect nginx:1.27 --format '{{json .Config}}' | python3 -m json.tool
```

**Expect:** the full sequence of instructions that built the official nginx image — its `ENTRYPOINT`, the `STOPSIGNAL`, the exposed ports, the env vars, and which layers cost what.

**Why it's interesting:** this is free reconnaissance on any image you're considering trusting, and it's also the best available teaching material. The official images are written by people who've thought hard about these mechanics; reading `nginx`, `postgres`, and `redis` histories teaches more about Dockerfile craft than most tutorials. Note nginx's `STOPSIGNAL SIGQUIT` — an instruction we haven't covered, chosen because that's nginx's graceful-shutdown signal rather than `SIGTERM`. **Disk:** ~70 MB. **Cleanup:** `docker rmi nginx:1.27`

### 2.5 — Prove that a tag is not a name

```bash
docker pull alpine:3.20
docker tag alpine:3.20 mybase:production
docker images | grep -E "alpine|mybase"
docker inspect --format='{{.Id}}' alpine:3.20
docker inspect --format='{{.Id}}' mybase:production
```

**Expect:** identical image IDs. Two names, one image, zero extra disk.

Now move the tag to something completely different:

```bash
docker pull busybox:1.36
docker tag busybox:1.36 mybase:production
docker run --rm mybase:production cat /etc/os-release 2>/dev/null || echo "not alpine anymore"
```

**Expect:** `mybase:production` now points at BusyBox. Nothing warned you. Nothing versioned. Any script that says `FROM mybase:production` or `docker run mybase:production` just silently changed what it runs.

**Why it's interesting:** you have just performed, locally and in five seconds, exactly the operation that makes `latest` dangerous in production — and exactly the operation an attacker performs with a compromised registry credential. A tag is a mutable pointer. Digests are the only names that can't move. **Cleanup:** `docker rmi mybase:production busybox:1.36 alpine:3.20`

### Cleaning up this volume

```bash
docker rmi myapp:naive myapp:v2 myapp:cold myapp:badorder myapp:shellform 2>/dev/null
docker system df
docker builder prune        # reclaims build cache — will prompt
```

Keep `~/docker-app`; Volume 3 uses it.

---


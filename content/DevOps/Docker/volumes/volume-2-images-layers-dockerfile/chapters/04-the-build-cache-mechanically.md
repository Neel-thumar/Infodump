## The build cache, mechanically

Now the payoff of putting `requirements.txt` before `app.py`.

### How Docker decides a layer is reusable

For each instruction, the builder computes a **cache key** and looks for an existing layer with that key. The key combines:

1. The **digest of the parent layer** — so a cache miss on any step invalidates every step after it. The cache is a chain, not a set.
2. For most instructions (`RUN`, `ENV`, `WORKDIR`, `CMD`...), the **literal instruction text**. Docker does not know what your `RUN` command does. `RUN apt-get update` matches on the string; its output could differ wildly between runs and the cache won't notice.
3. For `COPY` and `ADD`, the **checksum of the file contents** being copied, plus metadata. This is the exception — content, not just the instruction text.

From those three rules, everything else follows.

### Watch it happen

```bash
docker build -t myapp:v2 .          # everything CACHED
echo "# a harmless comment" >> app.py
docker build -t myapp:v2 .
```

**Expect:** the `COPY requirements.txt` and `pip install` steps report `CACHED`. Only the steps from `COPY app.py` onward re-run. The expensive pip install — the one that hits the network and takes tens of seconds — was skipped because nothing it depends on changed.

Now break it deliberately:

```bash
cat > Dockerfile.badorder <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]
EOF

docker build -f Dockerfile.badorder -t myapp:badorder .
echo "# another comment" >> app.py
time docker build -f Dockerfile.badorder -t myapp:badorder .
```

**Expect:** `COPY . .` sees changed content, its cache key changes, and *because the cache is a chain*, `pip install` re-runs too — network round trip and all. A one-character comment change re-downloads your dependencies.

**So the famous rule — "copy your dependency manifest and install before copying source" — is not a convention. It's arithmetic.** You are ordering instructions by rate of change so that frequently-changing content sits downstream of expensive-and-rarely-changing work. Once you see the chain property, you can derive the right ordering for any stack without looking it up.

### Cache gotchas worth knowing now

- **`RUN apt-get update` on its own line is a trap.** The string never changes, so the cache hits forever, and you install packages against a package index that may be months stale. Always chain `update` and `install` in a single `RUN`.
- **`docker build --no-cache`** when you need a truly clean build.
- **The cache is local.** Your CI runner starts cold every time unless you configure cache import/export (`--cache-from`, BuildKit's registry cache). This is why CI builds are often dramatically slower than yours, and people mistakenly conclude "Docker is slow."
- **`docker history myapp:v2`** shows every layer, its size, and the instruction that created it. It is the first thing to run when an image is unexpectedly large — and, as noted above, it exposes `ARG` values.

```bash
docker history myapp:v2
```

---


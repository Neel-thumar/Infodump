## Tags, digests, and the `latest` trap

### What `latest` actually is

`latest` is **not** "the newest version." It is a tag with no special properties whatsoever, which Docker uses as a default when you don't specify one. `docker pull nginx` means `docker pull nginx:latest`. If a maintainer never pushes a tag called `latest`, there isn't one — and if they push a three-year-old build under that name, `latest` is three years old.

### The failure mode, concretely

Here's the story in its generic form, and you will meet it eventually.

A team's Dockerfile says `FROM python:latest`. Their CI builds on every merge. Everything is fine for eight months. Then Python 3.13 is released, the `latest` tag moves, and the next CI build — triggered by a one-line README change, with zero application changes — produces an image on a new Python minor version. A C extension they depend on has no 3.13 wheel yet, so it builds from source, or fails. Or worse, it succeeds, and a subtle behaviour change ships to production.

Now the diagnostic nightmare: **`git diff` shows nothing relevant.** The inputs to the build are not fully captured in version control. The build is not reproducible, and nobody can explain why "the same code" behaves differently.

The same thing happens at deploy time. `docker pull myapp:latest` on three hosts at slightly different moments gives you three hosts running different builds, and `docker images` shows the same tag on all of them. You can chase that for hours.

### Doing it properly

```dockerfile
# Bad — a moving target
FROM python:latest

# Better — pinned to a minor version, still gets patch updates
FROM python:3.12-slim

# Best for reproducibility — pinned to exact content
FROM python@sha256:0f0f0d15cda3b4b9e0b12f5c53f4e1e38e1ee7e44b8b1c4d0d0a4dd9a0e5f2c1
```

> That digest is illustrative, not a real one. Get the real digest for any image you've pulled with `docker inspect --format='{{index .RepoDigests 0}}' python:3.12-slim`.

The trade is honest and worth stating both ways: digest pinning gives perfect reproducibility and means **you stop receiving security patches** until someone updates the digest. That's why tools like Renovate and Dependabot exist — pin to digests, and automate the bumps so they arrive as reviewable pull requests rather than silent surprises.

For your *own* images, tag with something that identifies the build immutably:

```bash
docker build -t myapp:v2 -t myapp:$(git rev-parse --short HEAD) .
```

Tag with the commit SHA. Now every running container can be traced to exact source, and `latest` becomes a convenience pointer rather than a load-bearing identifier.

---


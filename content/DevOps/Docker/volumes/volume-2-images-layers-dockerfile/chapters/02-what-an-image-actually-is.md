## What an image actually is

### Take one apart

Do this before reading the explanation. It takes thirty seconds and it removes the mystery permanently.

```bash
docker pull alpine:3.20
mkdir -p ~/image-anatomy && cd ~/image-anatomy
docker save alpine:3.20 -o alpine.tar
mkdir extracted && tar -xf alpine.tar -C extracted
find extracted -maxdepth 2 | head -30
```

**Expect:** a `manifest.json`, a JSON file with a long hexadecimal name, an `index.json`, and a `blobs/sha256/` directory full of files named after hashes. No single "image" file. No disk image. No kernel. Nothing that resembles a VM.

```bash
cat extracted/manifest.json | python3 -m json.tool
```

You'll see three things: a **config** file reference, a list of **layers**, and the **repo tags**. Now read the config:

```bash
CONFIG=$(python3 -c "import json;print(json.load(open('extracted/manifest.json'))[0]['Config'])")
python3 -m json.tool extracted/$CONFIG | head -60
```

**Expect:** environment variables, the default command, the working directory, the architecture and OS, a `rootfs` section listing layer `diff_ids`, and a `history` array — one entry per Dockerfile instruction that built this image, including instructions that produced no layer at all.

And a layer is just a tarball of files:

```bash
LAYER=$(python3 -c "import json;print(json.load(open('extracted/manifest.json'))[0]['Layers'][0])")
tar -tf extracted/$LAYER | head -20
```

**Expect:** `bin/`, `etc/`, `usr/`, `lib/` — a plain directory tree.

### The three things in the box

| Component | What it is | Why it exists |
| --- | --- | --- |
| **Layers** | Tarballs of filesystem changes, each identified by the SHA-256 of its content | They become the `lowerdir` chain from Volume 1. Shared between images that have them in common |
| **Config** | JSON: default command, env, working dir, exposed ports, user, plus the ordered list of layer digests and the build history | The metadata a runtime needs to turn a filesystem into a running process |
| **Manifest** | JSON pointing at the config and the layers by digest | The index. What a registry actually serves you first |

So: **an image is an ordered list of tarballs plus a JSON file describing how to run the result.** That's the whole thing. `docker run` fetches the layers, unpacks them into directories, arranges them as `lowerdir=layerN:...:layer1`, adds an empty upper dir, and starts a process with the config's command.

Cleanup:

```bash
cd ~ && rm -rf ~/image-anatomy
```

### Content addressing: why everything is a hash

Notice that nothing is identified by name. Layers are identified by the SHA-256 of their content, and so is the image as a whole. This is **content addressing**, the same idea git uses for objects, and it buys three properties at once:

- **Deduplication is automatic.** Two images built from `debian:bookworm` reference a layer with the same digest. It exists on disk once. No coordination required; identical content produces an identical name.
- **Integrity is free.** If a byte changes anywhere in a layer, its digest changes, and the digest no longer matches the manifest that referenced it. You cannot silently tamper with a layer in transit or at rest.
- **Transfers become diffs.** `docker push` asks the registry which layer digests it already has and uploads only the rest. Change one line of your application and you push a few hundred kilobytes, not the 900 MB image.

That third point was Docker's actual product insight, as argued in Volume 0. Golden VM images had the right correctness model and no distribution story. Content-addressed layers gave environments a distribution story as cheap as pushing a git commit.

### Tags are not names, and digests are

Here is a distinction that causes real production incidents, so be precise about it.

- A **digest** (`sha256:a1b2c3...`) is an immutable, cryptographic name for exact content. `alpine@sha256:abc...` will be the same bytes in ten years or it will not resolve at all.
- A **tag** (`alpine:3.20`) is a mutable pointer to a digest. It is a label someone can move at any time, with no notification and no version bump.

Watch a tag be exactly that:

```bash
docker pull alpine:3.20
docker inspect --format='{{index .RepoDigests 0}}' alpine:3.20
```

**Expect:** something like `alpine@sha256:beefc3...`. That digest is what you actually received. The tag `3.20` merely pointed there today.

We'll return to this with the `latest` trap below, because the failure mode is specific and worth seeing coming.

---


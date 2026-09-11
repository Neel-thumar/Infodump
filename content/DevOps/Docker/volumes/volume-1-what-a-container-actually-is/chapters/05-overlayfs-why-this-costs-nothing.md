## OverlayFS: why this costs nothing

### The problem

You now have isolation and limits. But each container needs a root filesystem — a `/usr`, `/lib`, `/etc`, the whole userland. Naively, running ten Debian containers means ten copies of Debian on disk: several gigabytes, and a multi-second copy before each container can start. That price would have killed containers as a developer tool. Milliseconds are the whole value proposition.

Three observations rescue it:

1. Those ten containers' filesystems are **almost entirely identical**.
2. Most of those files will be **read and never written**.
3. The files a container *does* write are usually few and small.

So: store the common part once, read-only, shared; give each container a thin private writable layer on top; and only copy a file when someone actually writes to it. That last clause is **copy-on-write**, and the filesystem that implements it here is **OverlayFS**, in the mainline kernel since 3.18 (2014). Docker's default storage driver, `overlay2`, is a thin wrapper over it.

> Historical note, **medium confidence on details**: early Docker used **AUFS**, which was never accepted into mainline Linux, so Docker on non-Ubuntu distros needed out-of-tree patches or fell back to worse drivers like `devicemapper`. Getting OverlayFS upstream, and then `overlay2` as the default, removed a real adoption barrier. If you ever meet a horror story about `devicemapper` in loopback mode, this is that era.

### The mechanism, built by hand

OverlayFS takes some read-only **lower** directories, one writable **upper** directory, a **work** directory for atomic operations, and presents a **merged** view.

```bash
mkdir -p ~/overlay-demo/{lower1,lower2,upper,work,merged}
cd ~/overlay-demo

echo "from lower1" > lower1/a.txt
echo "from lower1" > lower1/shared.txt
echo "from lower2 — I win" > lower2/shared.txt
echo "from lower2" > lower2/b.txt

sudo mount -t overlay overlay \
  -o lowerdir=lower2:lower1,upperdir=upper,workdir=work \
  merged

ls merged/
cat merged/shared.txt
```

**Expect:** `merged/` contains `a.txt`, `b.txt`, and `shared.txt`, and `shared.txt` reads "from lower2 — I win." **Leftmost lowerdir wins.** That is precisely how Dockerfile layers work: a later instruction's version of a file shadows an earlier one's, and both copies still exist on disk.

Now watch copy-on-write actually happen:

```bash
ls upper/          # empty — nothing written yet
echo "modified!" >> merged/a.txt
ls upper/          # a.txt has appeared
cat upper/a.txt    # the full file, not a diff
cat lower1/a.txt   # untouched original
```

**This is the single most important observation in the volume.** The moment you appended one word, the kernel copied the *entire file* from the lower layer into the upper layer and modified the copy. The lower layer is pristine. Every other container sharing that lower layer is unaffected.

Consequences that follow directly, and that explain a lot of Docker behaviour you'll meet later:

- **Starting a container is nearly free** because nothing is copied. You create an empty upper dir and a mount.
- **Writing a 2 GB file you only wanted to append to costs 2 GB and the time to copy it.** Write-heavy workloads on the container filesystem are slow for a structural reason. This is one of the main arguments for volumes in Volume 4.
- **Deleting a file from a lower layer doesn't reclaim space.** OverlayFS records the deletion as a **whiteout** — a character device with major:minor 0:0 in the upper layer. The file is still down there.

See the whiteout:

```bash
rm merged/b.txt
ls merged/         # gone
ls -la upper/      # b.txt present as a 'c' (character device) entry
ls lower2/         # still there, untouched
```

**This is why `RUN rm -rf /secret-file` in a Dockerfile does not remove the secret from your image.** It adds a whiteout in a new layer. The file remains in the earlier layer, fully readable by anyone who pulls the image and unpacks the layers. It's not a bug; you're looking at the mechanism that makes it inevitable. Volume 2 covers doing it properly, and Volume 7 covers the class of credential leaks this has caused.

**Cleanup:**

```bash
cd ~
sudo umount ~/overlay-demo/merged
rm -rf ~/overlay-demo
```

### Where Docker keeps yours

```bash
sudo ls /var/lib/docker/overlay2/ | head
sudo du -sh /var/lib/docker/overlay2/
docker system df
```

And for a specific running container:

```bash
docker run -d --name ovl --rm alpine sleep 300
docker inspect -f '{{json .GraphDriver.Data}}' ovl | tr ',' '\n'
```

**Expect:** the JSON names `LowerDir` (a colon-separated chain of the image's layers), `UpperDir` (the container's writable layer), `WorkDir`, and `MergedDir`. Those are exactly the four arguments you passed to `mount -t overlay` by hand two minutes ago. Write a file inside the container and then find it on your host:

```bash
docker exec ovl sh -c 'echo "hello from inside" > /tmp/proof.txt'
UPPER=$(docker inspect -f '{{.GraphDriver.Data.UpperDir}}' ovl)
sudo cat $UPPER/tmp/proof.txt
docker stop ovl
```

Your host just read a file "inside" the container with plain `cat`, because there is no inside. There is a directory.

---


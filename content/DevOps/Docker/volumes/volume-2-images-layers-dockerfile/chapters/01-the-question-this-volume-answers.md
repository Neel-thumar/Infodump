## The question this volume answers

You ended Volume 1 by mounting an OverlayFS by hand: some read-only lower directories, a writable upper directory, a merged view. Then you found Docker's own `LowerDir` chain in `docker inspect` and saw it was the same four arguments.

So here's the question that follows immediately. **If a running container is an overlay mount, then an image must be the recipe for the lowerdir chain — a list of directories plus instructions for how to stack them.** Is that all it is?

Very nearly, yes. And once you see it that way, the rest of this volume stops being syntax to memorize and becomes consequences you can derive. Why `latest` is dangerous, why moving one line in a Dockerfile turns a four-minute build into four seconds, why a 900 MB image can become 12 MB without removing a single feature, why deleting a secret doesn't delete it — all of these fall out of "an image is a stack of directories plus metadata."

Let's prove the claim first, then build on it.

---


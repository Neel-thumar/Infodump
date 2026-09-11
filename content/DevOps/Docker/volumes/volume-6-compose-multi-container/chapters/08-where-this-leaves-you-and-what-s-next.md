## Where this leaves you, and what's next

You can now describe a multi-service application as a single committed artifact, and you know that Compose is not a new system but a YAML front end that issues the same Docker API calls you were making by hand — with a set of labels as its only state. Services find each other by Volume 5's embedded DNS. Data persists via Volume 4's named volumes. Limits are Volume 3's cgroups. Builds are Volume 2's layers.

And you can reproduce, explain, and fix the timing bug that has broken more first deployments than anything else in Docker — along with the more valuable version of the lesson, which is that startup ordering is a convenience and application-level retry is the actual answer.

You have also, along the way, accumulated a stack with a password in plain text in a committed YAML file, a database container running as root, no capability restrictions, a writable root filesystem, and base images nobody has scanned.

**Volume 7: Security and Production Hardening.**

We start with an honest threat model: what a container genuinely protects against, and what it does not — the shared kernel means a kernel exploit still escapes, and this volume will not oversell the boundary. Then each defence introduced by the specific attack it stops: non-root users, read-only root filesystems, dropping capabilities, seccomp and AppArmor profiles, and what `no-new-privileges` actually prevents. Then image scanning and minimal base images, with concrete numbers on attack surface. Then secrets — why baking them into an image or passing them as environment variables is a documented anti-pattern, and what to do instead, including BuildKit's secret mounts. And we close on the best-documented category of container attack in the wild: automated cryptomining worms that find and exploit exposed Docker daemons, which you now have exactly the background to understand completely.

Say "continue" when you're ready.

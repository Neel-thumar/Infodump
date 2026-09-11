## Where this leaves you, and what's next

You can now state what a container is without using the word "lightweight": a process running in a set of namespaces that restrict its view, inside a cgroup that caps its consumption, with a root filesystem assembled by OverlayFS from shared read-only layers plus a private copy-on-write layer. You've built each of those three pieces by hand, with no Docker involved, and then found Docker doing exactly the same thing underneath.

You also saw the two cracks that the rest of this guide keeps returning to: the deletion that doesn't delete (whiteouts), and the boundary that holds at every namespace and fails at a file descriptor (CVE-2019-5736).

**Volume 2: Images, Layers, and the Dockerfile.**

Having built an overlay mount by hand, you're in an unusually good position to understand images properly — because an image is nothing but a recipe for that lowerdir chain, plus metadata. We'll derive why layering exists from the distribution problem it solves, write a real Dockerfile for an actual application from first principles, and take apart the build cache until the "put your lockfile before your source" rule becomes obvious rather than memorized. Then multi-stage builds, with a before/after size comparison you run yourself — expect roughly an order of magnitude. Then tags versus digests and why `latest` is a trap with a specific, repeatable production failure mode. And we'll close on a documented supply-chain incident involving malicious images in a public registry.

Say "continue" when you're ready.

## THE PROBLEM: Filesystems Don't Scale to the Internet

Think about what a filesystem actually is.

A hierarchical tree. Directories containing directories containing files. Inodes, permission bits, an owner, a group. Byte-range writes anywhere in a file. Locks. Rename operations that are atomic within the tree.

Every one of those features is a coordination requirement, and coordination is what breaks at scale.

**The tree is the worst part.** To create `/a/b/c/file.txt` you must know that `/a/b/c` exists, which means directories are objects with state and relationships. Rename `/a` and every path beneath it changes. A hierarchy is a distributed consistency problem wearing a friendly UI.

**Locks are worse.** Two clients writing to the same file need mutual exclusion. Across a planet-scale distributed system, distributed locking is both slow and a rich source of failure.

**Partial writes are impossible to distribute cheaply.** "Write 40 bytes at offset 1,048,576" requires you to know where that file physically is and to coordinate with everyone else who might be writing near it.

So AWS threw the model out. The design that came back:

- **No hierarchy.** One flat namespace per bucket.
- **No partial writes.** Objects are written whole and replaced whole.
- **No locks.** Last writer wins.
- **No POSIX semantics.** Not a filesystem, doesn't pretend to be.

What remains is almost trivially simple: **a key-value store where values are blobs and keys are strings.** And *because* it's that simple, it can be distributed across data centers with enormous redundancy, because there's very little state to coordinate.

S3 launched **March 14, 2006**, at fifteen cents per gigabyte per month. It shipped five months before EC2.

---


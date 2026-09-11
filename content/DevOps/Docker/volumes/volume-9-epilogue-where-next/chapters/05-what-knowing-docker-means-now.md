## What "knowing Docker" means now

Go back to Volume 0 for a moment.

You started with a stat, a story about an environment nobody could reproduce, and a claim you had no way to evaluate: that the mechanism making containers work was not invented by Docker and was sitting unused in Linux for five years before anyone made it usable.

Now you can not only evaluate that claim, you can demonstrate it. In exercise 9.4 you just did.

Here's what actually changed, and it isn't the command list.

**At the start, Docker was a tool you'd use.** Commands to memorize, flags to look up, behaviour to accept. When something went wrong the options were to search for the error message or try something else.

**Now Docker is a thin layer you can see through.** `docker run -m 256m` is a number written into `memory.max`. `docker exec` is `setns()`. `docker pause` is a write to `cgroup.freeze`. `-p 8080:80` is a DNAT rule in the `nat` table. A volume is a bind mount into a mount namespace. An image is an ordered list of tarballs and a JSON file. When something goes wrong now, you have somewhere to look, because you know what's underneath.

That's the difference between using a tool and knowing one, and it generalizes well past containers. Every abstraction you'll meet is like this: someone's convenient interface over mechanisms that are usually simpler and always more interesting than the interface suggests. The habit you've built over nine volumes — *find the layer below and look at it directly* — is more valuable than any specific thing you learned about Docker.

The incidents make the same case from the other direction. CVE-2019-5736: every namespace correct, a file descriptor crossed the boundary. `docker123321`: the registry worked exactly as designed; trust was the gap. The UFW bypass: two subsystems, both correct, both documented, an unexamined seam. Graboid: no vulnerability whatsoever — a default nobody revisited. **Failures live at boundaries and in defaults**, and you only see boundaries if you know what's on both sides.

And there's the last thing, which is the part I'd most like to stick.

Containers were assembled over thirty-four years by people fixing one leak at a time. chroot in 1979 isolated the filesystem and nothing else. Jails added hostname and process isolation in 2000. Google wrote cgroups because they had a noisy-neighbour problem in 2006. Namespaces landed one at a time across a decade. Every piece existed in mainline Linux and free for anyone to use by 2008 — and almost nobody used them, because holding them all correctly at once was too hard. Then in 2013 someone spent five minutes on a stage explaining that they'd made it easy, and the industry changed.

**The mechanism was never the hard part. Making it usable was.** That's worth remembering the next time you're deciding whether a thing you've built is finished.

---


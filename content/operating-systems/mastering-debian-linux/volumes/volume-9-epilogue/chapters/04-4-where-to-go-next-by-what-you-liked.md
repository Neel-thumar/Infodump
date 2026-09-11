# 4. Where to Go Next, By What You Liked

Branch on whichever volume you enjoyed most. These are specific rather than comprehensive.

**If Volume 8's kernel material was your favourite**
→ **LWN.net** is the single best source on kernel development anywhere; the weekly edition is worth
paying for. Then `kernelnewbies.org`, the kernel's own `Documentation/` tree (`apt install
linux-doc`), and Robert Love's *Linux Kernel Development* for the concepts. **Then do the thing:**
find a piece of hardware you own with an imperfect driver and read that driver. Reading one real
driver end to end teaches more than three books.

**If the networking volume hooked you**
→ Stevens' *TCP/IP Illustrated* is still the reference. Beej's Guide to Network Programming is free
and excellent for the socket API you met in Volume 5 §29. Then: run your own recursive resolver, read
packets in Wireshark until the handshakes are boring, and look at **eBPF and XDP**, which is where
Linux networking is actually moving.

**If the history and the incidents were the most fun part**
→ Kernighan's *Unix: A History and a Memoir* is short and first-hand. Read the original Ritchie and
Thompson papers — they're clear and surprisingly readable. Then go to the primary sources for
failures: the **Qualys advisories** (Baron Samedit, regreSSHion), **GitLab's 2017 database incident
postmortem** — published in public, in real time, and a model of the genre — and the postmortem
chapter of Google's SRE book. Debian's General Resolution archives at `debian.org/vote` are the
governance equivalent, with every ballot public.

**If Volume 4's packaging and governance was the draw**
→ `debian-policy` and `developers-reference`, both packaged. The Debian New Maintainers' Guide. Then
go and do §3's first-patch walkthrough for real. And for the radical alternative, look at **Nix and
NixOS**, which answer "what is a package" completely differently and will make you re-examine
everything Volume 4 taught you.

**If Volume 6's boot chain and the systemd argument grabbed you**
→ Read systemd's own documentation, which is unusually good, and then the primary sources from the
dispute — the Debian Technical Committee's 2014 decision and the General Resolutions — rather than
commentary about them. Then build something small with socket activation to see §36.4's trick work.

**If Volume 7's automation was where it clicked**
→ ShellCheck's wiki is a genuinely great bash reference organised by mistake. Then leave bash: learn
Python or Go properly, because the right lesson from Volume 7 is knowing **when a script has outgrown
the shell**. Then Ansible, for the same job at fleet scale.

**If Volume 8's containers were the highlight**
→ Extend §46.7's hand-built container: add a veth pair and give it real networking. Read the **OCI
runtime specification** — it's short, and it's just a formalisation of what you built. Then Liz Rice's
*Container Security*, and **Podman** for rootless containers using the user namespace.

---


# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 0 — Prologue: Why This Operating System Is Worth Obsessing Over

*Read this before Volume 1. It will take a few minutes.*

---

## The name was an accident

In 1991 a Finnish student finished a hobby operating system and wanted to call it **Freax** — free,
plus freak, plus the obligatory X.

He uploaded it to a Finnish university FTP server. The administrator of that server, **Ari Lemmke**,
did not like the name. So when he created the directory for it, he called it something else, and
that is the directory people downloaded from, and that is the name that stuck.

**Linus Torvalds did not choose the name "Linux." A sysadmin who disliked his suggestion did.**

> **Confidence: high** on the substance — Torvalds recounts it himself in *Just for Fun* (2001).
> **Moderate** on the finer institutional details, which vary between tellings.

Hold that next to where the thing ended up.

Every one of the world's 500 fastest supercomputers runs Linux — a clean sweep that has held since
around 2017. It is underneath most of the internet's servers, most cloud infrastructure, the vast
majority of embedded devices you own but never think of as computers, and roughly three billion
Android phones, whose kernel is a Linux kernel.

> **Time-sensitive: verify before quoting.** The TOP500 figure has been 100% for years, but the list
> is published twice yearly and my knowledge has a cutoff. Server and mobile share numbers vary by
> methodology and move constantly. Check `top500.org` and current survey data rather than trusting
> a number from a book.

**One of the most widely deployed pieces of software in human history is named after a directory
someone else created because they thought the author's idea was bad.**

That is the tone of this whole story. Not a grand plan. A series of accidents, arguments and
constraints, some of which turned out to be load-bearing decades later. You are about to spend eight
volumes finding out which ones.

---

## The argument at the centre of it

There is a slogan you will hear: *"Do one thing and do it well."*

Ignore the slogan. There is a real design argument underneath it, and it is more interesting than
the bumper sticker.

**The claim.** Build the system out of many small programs that each solve one problem, communicating
through a single universal medium — a stream of text. Doug McIlroy, who ran the Bell Labs group where
Unix was built, put it roughly that way in the 1970s.

**Why that's not obvious.** It costs you real things. Every program has to *parse* text on the way in
and *format* it on the way out, over and over, with no type checking and no schema. A filename
containing a space breaks a naive pipeline. A filename containing a newline breaks almost all of
them. Launching six processes to do what one function call could do is genuinely wasteful. Microsoft's
PowerShell was designed on the explicit counter-argument that pipelines should carry **structured
objects**, not text — and that is a serious position, not a heresy.

**Why it won anyway.** Because of what it buys: *n* tools give you *n²* combinations, for free,
including combinations nobody anticipated.

There's a concrete proof of this in Volume 1. Pipes — the `|` you type without thinking — did not
exist in early Unix. They were added in 1973. Adding them required **one new system call in the
kernel, some parsing in the shell, and changes to exactly zero existing programs.** Every tool
written before pipes existed became composable with every other tool on the day they shipped,
retroactively, without recompilation.

**And Unix never actually obeyed the rule.** `ls` has dozens of options. `sendmail` was enormous. X11
was enormous. The kernel is the least "one thing" program on your machine.

So the honest version is this: **it's a bias, not a law.** The default assumption is that a thing
should be small and composable, and you need a *reason* to deviate. Volume 6's systemd argument is
what happens when a lot of people disagree about whether a particular deviation was justified — and
it is a much better argument than either side's caricature of it.

---

## "Just a hobby"

On 25 August 1991, Torvalds posted to the `comp.os.minix` newsgroup that he was writing a free
operating system, adding that it was "just a hobby, won't be big and professional like gnu."

It is the most-quoted sentence in the history of the field, and it is usually quoted badly — as a
cute story about humility rewarded. That reading misses what's actually interesting about it.

**Read what else he said.** He noted it wasn't portable, that it relied on 386-specific features, and
that it would probably never support anything but the hard disks he happened to own — because those
were all he had to test with.

**He was right about every constraint and wrong about every consequence.** Linux today runs on more
processor architectures than any other operating system in existence. The specific limitation he was
most certain of — that it would stay tied to his hardware — became its single greatest strength.

**And the post is a question, not an announcement.** He asked what people liked and disliked about
Minix, because he wanted to know what to build. That is the part worth sitting with. Linux was a
conversation from the first day, before there was anything much to talk about. The code was a
starting position.

There's a second decision, less famous and arguably more consequential. The first release carried a
licence that **forbade commercial distribution**. A few months later Torvalds relicensed under the
GPL, and has since described that as the best decision he made. Under the original terms there would
have been no Red Hat, no Android, no Debian as you'll come to know it.

> **Confidence: high** on the date, the newsgroup, and the relicensing to the GPL in early 1992;
> **moderate** on precise version numbers.

**The gap between "just a hobby" and what followed is not a story about modesty.** It's a story about
how badly anyone — including the author, holding all the information — can predict which constraints
matter. That's worth remembering every time someone tells you confidently where technology is going.

---

## And then there's Debian

Here is a question I'd like you to carry into Volume 4.

The 1990s produced a large number of commercial Linux distributions, backed by real companies with
real funding: Caldera, Corel Linux, Mandrake, Turbolinux, Conectiva, Linspire. Most are gone.
Mandriva, the survivor of several mergers, went bankrupt around 2015.

**Debian started in 1993, has never had a company behind it, has never had shareholders or a
sales team, and is still here.**

More than that: it became the substrate. Ubuntu is built on Debian. So are Linux Mint, Raspberry Pi
OS, Kali, Proxmox, Tails, and dozens of others. **An enormous number of people who have never
installed Debian are running it**, one layer down.

Why did the volunteer project outlast the funded ones?

Volume 4 answers this properly, but the short version is that Debian did something unusual very early:
**it wrote down its rules.** A Social Contract that is a promise to users. A set of Free Software
Guidelines precise enough that — with the Debian-specific references stripped out — they became the
industry's actual definition of "open source." A constitution with an elected leader, a technical
committee, and a documented procedure for resolving disputes by vote.

That sounds like bureaucracy. It is the opposite: it's what lets a project survive its founders,
survive disagreement, and survive being unfashionable for a decade. **A company can be acquired or go
bankrupt. A written commitment ratified by its members is a much harder thing to kill.**

And it has cost them. One of the promises is that the project will not hide problems. Volume 4's
incident is Debian discovering that a well-intentioned two-line change of its own making had
compromised every cryptographic key generated on the system for twenty months — and publishing a
detailed account plus the tooling to find the damage. That is what that promise looks like when it's
expensive.

---

## Five things you're about to understand

Not a syllabus. Five specific questions, all of which have satisfying answers, none of which most
daily Linux users ever learn.

**1. Why the password prompt shows nothing — not even dots.**
Not one asterisk. And the program asking for your password isn't the thing hiding it. There's a layer
of *kernel code* sitting between your keyboard and every program you run, quietly handling Backspace,
Ctrl+C and echoing — and a password prompt works by asking the kernel to stop echoing. You'll find
that layer in Volume 1, and turn it off yourself to watch what happens.

**2. Why `cd` cannot possibly be a program.**
Every other command you type runs as a separate process. `cd` can't, and once you see why, it stops
being a rule you memorised and becomes something you could have derived. Volume 1 has you prove it in
five lines — write a program that changes directory, run it, and watch your shell refuse to move.

**3. Why deleting the huge log file didn't free any disk space.**
You deleted a 40 GB file. `df` reports no change. The filesystem is not broken, nothing is corrupt,
and there is a specific command that shows you exactly what's happening — the kernel will literally
tell you, in plain text, that the file is gone and also still there. Volume 3.

**4. How two lines of code, removed to silence a warning, broke every key on Debian for twenty
months.**
Not a hack. Not malice. A maintainer doing careful quality work, who **asked upstream first** and got
an answer to a slightly different question. The result was that every SSH key, TLS certificate and
VPN key generated on Debian or Ubuntu during that window came from a set of about 32,768
possibilities — small enough that the entire keyspace was precomputed and published within days.
Volume 4. It is the best cautionary tale in the book, and nobody in it behaved badly.

**5. That a container is five kernel features and about five commands.**
Docker is genuinely useful and it did not invent containers. By Volume 8 you'll build one by hand —
your own process tree where your shell is PID 1, your own hostname, your own network stack, your own
filesystem root — with no Docker, no daemon, and nothing installed that isn't already on your
machine.

---

## One more thing, about method

This book was written by running things.

Where it says "you should see," that's usually because the command was executed and the output pasted
in. Several times during writing, the machine disagreed with what I expected — a permission bit that
silently vanished, a file that turned out to be a snapshot rather than live state, a test harness
that was defeated by the exact rule it was testing. **Every one of those mistakes is still in the
text, with the correction visible**, because how you find out you're wrong is more useful than a
clean assertion.

Where something couldn't be verified, it says so, and how confident I am. There are claims in here
flagged specifically because you can check them on your machine and I couldn't check them on mine.

**Check them.** Finding one wrong would be the best thing that could happen to this book.

---

## Go

Volume 1 opens with a question that sounds trivial:

> *When you type `ls` and press Enter, what part of the operating system reads your keystrokes and
> decides what `ls` means?*

The answer is that **the kernel has never heard of `ls`.** It does not know what a command is. It has
no idea what `*` means, or `|`, or `$HOME`. All of that is done by an ordinary program running with
no special privileges — one you can replace, and one you could write yourself.

Everything else follows from that.

**Volume 1 is next. Open a terminal while you read it.**

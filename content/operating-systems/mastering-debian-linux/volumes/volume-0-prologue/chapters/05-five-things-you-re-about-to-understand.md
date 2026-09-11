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


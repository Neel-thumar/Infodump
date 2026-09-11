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


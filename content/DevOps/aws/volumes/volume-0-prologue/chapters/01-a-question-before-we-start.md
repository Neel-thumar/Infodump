## A Question Before We Start

Here's something worth sitting with for a moment.

In 2006, if you wanted to launch a web application, you bought a server. A physical one. You waited six to twelve weeks for it to arrive, you drove it to a data center or a closet, you racked it, you cabled it, you installed an operating system, and somewhere in month four you finally served your first HTTP request. If your app got popular, you repeated this process — with another six-to-twelve-week lead time, which meant your success was capped by a purchasing department.

Today you can type one command and have a running computer in another country in about forty seconds, and it costs less than a cup of coffee per day.

The obvious question is *how*. The more interesting question — the one this guide is actually about — is **why that machine behaves the way it does**. Why does it lose its disk when you stop it? Why does it have a strange link-local IP address baked in at `169.254.169.254` that will happily hand out credentials to anyone who asks? Why is one specific region in Northern Virginia quietly load-bearing for a shocking fraction of the internet?

None of these are arbitrary. Every one of them is a scar. Something happened, someone made a decision, and you inherited the consequence.

---


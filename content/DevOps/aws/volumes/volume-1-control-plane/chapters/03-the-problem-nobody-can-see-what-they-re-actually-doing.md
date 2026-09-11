## THE PROBLEM: Nobody Can See What They're Actually Doing

Here's the situation AWS faced, and it's a design problem, not a technical one.

You're building a system where thousands of companies provision infrastructure programmatically, across dozens of physical locations, with wildly different trust levels, over the public internet. Every request has to answer three questions:

1. **Who is asking?**
2. **Where should this happen?**
3. **Did this message get tampered with in flight?**

And it has to answer them without a session — without the server holding state about you between requests — because state means the authentication layer becomes a bottleneck and a single point of failure at planetary scale.

The abstraction AWS chose was: **everything is a stateless, individually authenticated HTTP request to a regional endpoint.** Every single thing. There is no "AWS protocol." There's HTTPS, a request signing scheme, and a very large number of endpoints.

The console is not an exception to this. The console is a web app that makes those same calls on your behalf.

---


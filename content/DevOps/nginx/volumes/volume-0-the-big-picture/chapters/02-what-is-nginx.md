## What Is nginx?

nginx (pronounced "engine-x") is a piece of software that sits between your users and your application. Every HTTP request from a browser, mobile app, or API client hits nginx first. nginx decides what to do with that request — serve a file directly, forward it to an application server, reject it, cache the response, or something else.

That's the core idea. nginx is a **traffic handler**. It receives requests, makes decisions, and either answers them itself or passes them to someone who can.

In production, nginx is almost never the thing that runs your application logic. Your Python, Node.js, Java, Go, or .NET application does that. nginx sits *in front of* those applications and handles the parts they shouldn't have to deal with: accepting thousands of simultaneous connections efficiently, terminating TLS, serving static files, distributing load across multiple backend instances, and adding caching, compression, and rate limiting.

### One sentence to remember

> nginx is the front door of your infrastructure — it receives all incoming traffic and decides where each request goes.

---


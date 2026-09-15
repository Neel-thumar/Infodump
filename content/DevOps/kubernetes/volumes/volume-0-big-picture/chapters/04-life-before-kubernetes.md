## Life Before Kubernetes

Imagine you are running an application in 2012. You have servers — real or virtual — with names like `web-01`, `web-02`, `db-01`.

Your work looks like this:

```text
Build the application
      ↓
Copy it to the correct servers
      ↓
Install dependencies on those servers
      ↓
Restart the service, one server at a time
      ↓
Update the load balancer if needed
      ↓
Watch the graphs and hope
```

Now the problems start.

| Problem | What it looks like in real life |
|---|---|
| Wasted capacity | Servers sized for peak traffic, idle 80% of the day |
| Manual placement | A human decides which app runs on which server, in a spreadsheet |
| Failure = a phone call | A server dies at 3 AM and someone has to move things by hand |
| Configuration drift | After two years no two servers are the same, and nobody knows why |
| Scaling is slow | "Add two more servers" takes days, not seconds |

Look at what all five have in common. **The server is important.** Humans care about it, applications are tied to it, and every problem comes from that.


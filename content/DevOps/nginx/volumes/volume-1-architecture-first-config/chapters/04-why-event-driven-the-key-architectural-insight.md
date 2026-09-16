## Why Event-Driven? The Key Architectural Insight

This is the most important thing to understand about nginx's internals.

### The Traditional Approach: One Thread Per Connection

Older web servers (and many application servers) assign one thread or process to each connection. When a client connects, a thread picks it up and stays dedicated to that connection until it's finished.

The problem is **waiting**. Most of the time, a connection is not doing useful work:

- Waiting for the client to send the full request (slow network).
- Waiting for the backend to respond (database query, API call).
- Waiting for the client to acknowledge received data.
- Waiting for the next request on a keep-alive connection.

While one thread waits, it holds memory and a slot in the thread pool. With 10,000 concurrent connections, you need 10,000 threads, most of them doing nothing. Memory usage explodes. Context-switching between threads wastes CPU.

### nginx's Approach: Event-Driven, Non-Blocking

Each nginx worker runs a single-threaded **event loop**. Instead of blocking on one connection, the worker asks the operating system: "Tell me which of my connections has something ready for me right now."

The OS maintains a list of all connections the worker is managing. When data arrives on any of them, the OS notifies the worker. The worker processes that data, then immediately checks for the next ready connection.

One worker can manage thousands of connections because it never sits idle waiting for a single one. It is always working on whichever connection needs attention right now.

```text
Traditional:

Thread 1 ──── [handle client A] ──── [waiting...] ──── [waiting...] ──── [done]
Thread 2 ──── [handle client B] ──── [waiting...] ──── [done]
Thread 3 ──── [handle client C] ──── [waiting...] ──── [waiting...] ──── [done]
   ...1000 more threads, most of them waiting...

nginx event loop:

Worker ──── [client A: read request] ─┐
            [client C: send response] ─┤  (processes whichever connection is ready)
            [client B: read request]  ─┤
            [client A: proxy to backend]┤
            [client D: new connection] ─┤
            [...thousands more...]     ─┘
```

Think of the analogy: instead of one receptionist standing at one visitor's side until they leave, a single efficient receptionist handles the line — greets someone, hands them a form, moves to the next person, comes back when the form is ready.

### What This Means in Practice

| Scenario | Thread-per-connection | nginx event-driven |
|---|---|---|
| 10,000 idle keep-alive connections | 10,000 threads using ~80 MB+ of memory | One worker, a few MB |
| Slow clients on mobile networks | Threads blocked waiting for slow data | Worker moves on, checks back later |
| Backend is slow to respond | Thread sits waiting for backend | Worker handles other connections while waiting |
| Traffic spike: 50K connections | Need 50K threads or start rejecting | Workers handle it if `worker_connections` is sized right |

This is why nginx can handle massive concurrency with very little memory. The event-driven model is not magic — it is simply a more efficient way to manage waiting.

### The Tradeoff

nginx's event loop is great for I/O-bound work (reading files, proxying, waiting for backends). It is not great for CPU-heavy computation. If a worker has to do something CPU-intensive (like heavy compression of a very large file), it blocks the event loop and all other connections on that worker stall.

This is fine because nginx's job is traffic handling, not computation. The heavy work happens in the backend application.

---


## The Core Idea of Kubernetes

Kubernetes changes one thing:

> Stop telling the system *where* to run your application. Tell it *what you want*, and let the system decide where.

Instead of "install this on `web-02`", you say:

> "Run 3 copies of this application. Each needs 1 CPU and 512 MB of memory. Keep 3 running, always."

Kubernetes takes that statement, picks the machines, starts the containers, notices when one dies, and starts a replacement somewhere else. You never care which machine.

This is called **desired state**. You describe the destination, not the route.

```text
OLD WAY                              KUBERNETES WAY

You → server → process               You → "I want 3 copies"
(you choose everything)                        ↓
                                     Kubernetes chooses the server
                                               ↓
                                            Pod runs
```

And Kubernetes does not check this once. It keeps checking, forever. If a Pod dies, the count is wrong, so it creates another one. This continuous checking is called **reconciliation**, and it is the single most important idea in the whole system.


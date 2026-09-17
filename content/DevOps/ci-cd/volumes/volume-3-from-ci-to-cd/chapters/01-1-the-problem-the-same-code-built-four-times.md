## 1. The problem: the same code, built four times

A tempting design:

```text
Dev environment       →  build from source  →  deploy
Test environment      →  build from source  →  deploy
Staging environment   →  build from source  →  deploy
Production            →  build from source  →  deploy
```

It looks clean. It is dangerous, and here is exactly why.

Each build happens at a different moment. Between the test build and the production build:

- A dependency published a new patch version, and your resolver picked it up.
- A base image tag moved to new contents.
- A transient network failure changed what got installed.
- Someone pushed a commit.

So the thing you tested and the thing you released are **different binaries**. Every test you ran was evidence about an artifact that no longer exists.

```text
WRONG                                RIGHT

source → build → test                source → build → test
source → build → production                        ↓
         ^^^^^ different build            the SAME artifact → production
```

> **The thing you tested must be the thing you deploy.**

This is called **build once, promote many**:

```text
         ┌─────────────────────────────┐
source → │  BUILD (exactly once)       │ → artifact v1.4.2
         └─────────────────────────────┘
                     ↓
              stored in registry
                     ↓
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      test       staging      production
     (same artifact, different configuration)
```

Everything after the build is **promotion**, not rebuilding. What differs between environments is **configuration**, injected at deploy time — never the artifact itself.

In factory terms: one production line, one inspected box, shipped to three shops. Not three lines making three different boxes and inspecting one of them.

---


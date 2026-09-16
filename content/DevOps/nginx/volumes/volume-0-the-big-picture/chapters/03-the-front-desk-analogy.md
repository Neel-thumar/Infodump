## The Front-Desk Analogy

Throughout this guide, we will use one consistent analogy. Think of nginx as the **front desk of a large office building**.

When a visitor (an HTTP request) arrives at the building:

1. They don't walk directly into individual offices. They go to the **front desk** first.
2. The front desk checks who they want to see and what they need.
3. If the visitor just needs a brochure (a static file), the receptionist hands it over directly from the drawer — no need to bother anyone in the back offices.
4. If the visitor needs to talk to someone specific, the receptionist walks them to the right department (an application server) and brings the answer back.
5. If multiple staff members can help (multiple backend instances), the receptionist picks the one who is least busy.
6. The receptionist handles the security check at the door (TLS), so the back-office staff don't have to check IDs themselves.
7. If someone keeps asking the same question repeatedly, the receptionist remembers the last answer and gives it directly (caching).

This analogy is not perfect — no analogy is. But it maps surprisingly well to how nginx works, and we will return to it when new concepts land better with this mental picture.

**Always remember:** the analogy is a starting point. The real explanation follows every time.

---


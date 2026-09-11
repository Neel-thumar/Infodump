## THE PROBLEM: Nobody Can See the Price Tag

Here's the structural issue, and it isn't carelessness.

An engineer designs a system. Two services talk to each other. They draw a box, a box, and an arrow.

**Nothing on that diagram indicates that the arrow costs money.** But whether those two services sit in the same Availability Zone or different ones is the difference between free and roughly two cents per gigabyte in each direction — and at a terabyte a day, that's a meaningful monthly line item produced entirely by an invisible property of the drawing.

Compute is legible. An instance has a type and an hourly rate; you can look it up. **Data transfer is a property of paths**, and paths are implicit in architecture rather than declared.

Then add three compounding factors:

- **Billing data lags** by hours, so feedback is slow.
- **Costs are aggregated by service**, not by feature or team, so "why is our bill up 30%?" has no obvious answer.
- **Nothing degrades.** An expensive architecture performs exactly as well as a cheap one. There is no symptom.

That last point should feel familiar. It's the same structure as the over-permissive security group in Volume 3 and the missing log retention in Volume 8: **a bad state with no feedback loop.**

---


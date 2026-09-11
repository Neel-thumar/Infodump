## The Question This Volume Answers

Everything in this guide so far has been an engineering decision. This volume is about the two forces that turn those decisions into something an organization can actually operate.

**The first is money.** Not as an afterthought — as an architectural input. In a data center, cost is a capital expenditure negotiated once a year by someone else. In AWS, **every architectural choice has a price attached, continuously, and the person making the choice is usually the person who has no idea what it costs.**

That's genuinely new, and most engineers are never taught to read a bill.

**The second is control.** One account with one person clicking in the console is fine. Forty accounts with two hundred engineers is a different problem: who can do what, how does anything get reproduced, and what stops someone from doing something catastrophic at 4 PM on a Friday.

Four things to take away:

1. **Data transfer is the cost nobody budgets for**, because it's a property of paths and nothing in your diagram says "this arrow costs money."
2. **Commitment models trade flexibility for discount**, and choosing wrongly is expensive in both directions.
3. **Infrastructure as code is a disaster recovery requirement**, not a nicety — Volume 8 said this, and here's why.
4. **Multi-account is a blast radius decision** before it's an organizational one.

---


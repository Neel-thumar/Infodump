## THE PROBLEM: "Highly Available" Is Not a Specification

"We need high availability." "We need disaster recovery." These phrases mean nothing on their own, and architectures built on them tend to be expensive and untested simultaneously.

You need two numbers.

**RTO — Recovery Time Objective.** How long may we be down? Seconds? An hour? A day?

**RPO — Recovery Point Objective.** How much data may we lose? Zero? Five minutes? A day?

These are **business decisions with engineering costs**, and the conversation only becomes productive when you attach prices:

- RPO of zero means synchronous replication, which means write latency and roughly double the infrastructure.
- RTO of seconds means a fully running second environment, which means paying for capacity you hope never to use.
- RTO of hours and RPO of hours can be satisfied by backups, which cost almost nothing.

**The correct process is: business states RTO and RPO, engineering states the price, business revises.** It is never the other way around, and the number of architectures built by engineers guessing at requirements is the source of a great deal of both over- and under-spending.

And be precise about the difference:

- **High availability** handles *expected* failures — an instance dies, an AZ has a power event. Automatic, routine, no human involvement.
- **Disaster recovery** handles *exceptional* failures — a Region is impaired, someone deletes the production database, ransomware encrypts everything. Often involves a human decision.

They need different designs. Multi-AZ is HA. Multi-Region is DR. Conflating them produces architectures that survive a rack failure beautifully and cannot survive a bad deployment at all.

---


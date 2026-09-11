## Where We Go Next

**Volume 6 — RDS and Aurora: Handing Someone Else Your Database.**

The decision to run a managed database is one of the most consequential architecture choices you'll make, and it's usually made casually. We'll cover what you actually give up, how Multi-AZ failover works mechanically and how it differs from read replicas (people conflate these constantly), parameter groups, automated backups and point-in-time recovery, and the snapshot restore process people discover for the first time during an emergency.

Then Aurora, which is genuinely novel rather than just managed — a storage layer that pushes redo log processing down into a distributed fleet and stops shipping full database pages across the network at all. AWS published a SIGMOD paper explaining why the classic architecture was wasteful, and it's one of the clearest pieces of systems writing in the field.

The incident is quieter than the ones in this volume: failovers that were configured and never drilled.

---

*Volume 5 complete. Say **continue** when you're ready for Volume 6.*

## The Question This Volume Answers

Your database is the one component you genuinely cannot lose.

An EC2 instance dies — Volume 4 taught you to replace it. A load balancer misbehaves — you route around it. But the database holds the only copy of things that exist nowhere else: what customers ordered, who owes what, what happened. Lose an instance and you lose capacity. Lose the database and you lose the business.

**So why would you hand it to someone else?**

And the follow-up that matters more: when you do, **what exactly have you given up**, and what have you been given that you couldn't build yourself?

That second question has two very different answers, because RDS and Aurora are not the same kind of thing. RDS is *managed PostgreSQL*. Aurora is *a different database engine* that happens to speak PostgreSQL. Marketing lists them together. They are not the same decision.

Four things to take away:

1. **Managed means constrained**, and the constraints are specific and knowable.
2. **Multi-AZ and read replicas solve different problems.** They are conflated constantly, including by people who run both.
3. **Aurora is genuinely novel**, and the paper explaining why is one of the clearest pieces of systems writing in the field.
4. **A backup you have never restored is not a backup.** This volume's incident is about exactly that.

---


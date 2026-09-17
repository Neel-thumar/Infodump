## 3. The compatibility problem nobody warns you about

Every zero-downtime strategy requires old and new code to run simultaneously. That constraint reaches into your database.

Consider renaming a column:

```sql
ALTER TABLE users RENAME COLUMN email TO email_address;
```

The instant that runs, every still-running old instance breaks. Rollback doesn't save you — the old code can't work against the new schema.

The discipline is the **expand / contract** pattern: make changes additive first, and remove only when nothing needs the old shape.

```text
Release 1 (expand)     add email_address; write to BOTH columns; read from email
Release 2              read from email_address; keep writing both
Release 3 (contract)   drop email — only after all old instances are gone
```

Three deployments instead of one. In return, **every individual release is rollback-safe**.

> **Rollback is only real if the database can roll back too.** A deployment strategy chosen without considering schema changes gives you a false sense of safety. Most "we couldn't roll back" incidents are database incidents.

---


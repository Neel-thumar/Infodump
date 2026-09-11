## THE MECHANISM: What Managed Actually Means

### What you give up

Be concrete, because these constraints bite at inconvenient moments.

**No OS access.** No SSH, ever. You cannot install an agent, read a system log directly, run `perf`, or inspect the filesystem. If your debugging instinct is "let me get on the box," that instinct is now unavailable.

**No superuser.** On RDS PostgreSQL you get `rds_superuser`, which is close but not the same. Some extensions are unavailable. Some operations requiring true superuser are impossible. The list of permitted extensions is AWS's, not yours.

**No arbitrary configuration.** Settings are managed through **parameter groups**, and not every parameter is exposed. Some are locked because changing them would break AWS's management layer.

**Version availability is AWS's decision.** A PostgreSQL point release may exist for weeks before RDS offers it. You cannot run a version AWS hasn't certified.

**Maintenance happens on AWS's schedule.** You choose a weekly window. Within it, AWS may reboot your instance to apply patches. You can defer some of this, not all of it indefinitely.

**Storage only grows.** You can increase allocated storage online. **You can never decrease it.** Over-provision by 2 TB and you pay for 2 TB for the life of that instance. Fixing it means creating a new instance and migrating.

### What you get

**Automated backups with point-in-time recovery.** A daily snapshot plus continuous transaction log capture — logs are written roughly every five minutes — letting you restore to any second within your retention window (0 to 35 days). This alone is worth a great deal, and building the equivalent yourself is genuinely hard.

**Multi-AZ with automatic failover.** Detection, promotion, and endpoint redirection, handled.

**Read replicas** with one API call, including across Regions.

**Automatic minor version patching**, if you enable it.

**Storage autoscaling**, growing the volume before you run out.

**Performance Insights** — a genuinely good query-level performance view, showing which queries consume database time and what they wait on. It's better than what most teams build for themselves.

**Encryption at rest** via KMS (Volume 2), with one important catch we'll come to.

### Parameter groups

Configuration lives in a parameter group attached to the instance. Two kinds of parameter:

- **Dynamic** — applies immediately on change
- **Static** — requires an instance reboot

Change a static parameter and the instance shows `pending-reboot`. Nothing has happened yet. It's common to change a setting, observe no effect, and conclude the setting doesn't work — when in fact it's queued.

The default parameter group **cannot be modified**. To change anything you create a custom group, which is the correct first move on any new instance.

### The encryption catch

**You must enable encryption when you create the instance.** You cannot encrypt an existing unencrypted RDS instance in place.

The workaround: snapshot it, copy the snapshot *with* encryption specified, restore from the encrypted copy, then cut over. That's a migration with downtime, on a production database, that exists only because of a checkbox nobody ticked on day one.

**Tick the box. Always. Even in dev.** It costs nothing and removes a future project from your life.

---


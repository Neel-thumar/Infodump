## 8. Troubleshooting

### "New release is broken and rollback does not work"

The worst one, and it's always one of four causes:

| Cause | Evidence | Prevention |
|---|---|---|
| The old image is gone | Registry pull fails, `manifest unknown` | Cleanup policies that keep deployed/release tags forever |
| The old version can't run against the new database | App starts, then errors on queries | Expand/contract migrations; never contract in the same release |
| Nobody knows what the previous version was | Guessing at SHAs during an incident | Environment history; version endpoint; release records |
| The rollback path was never tested | Permission errors, missing runner, a script that no longer works | Exercise it on a schedule |

**During the incident:** stabilise however you can — scale the old version if any instances survive, disable the feature by flag, take traffic off the broken path. Then fix the rollback mechanism afterwards as a real work item, not a note in a retro nobody reads.

### "Deployment succeeded, application is unavailable"

Now you have verification, so the *pipeline* should catch this. If it didn't, the verification is wrong. Check in this order:

1. Did the verification job run at all? (`rules:` may have excluded it.)
2. Does the health endpoint actually check dependencies, or return 200 blindly?
3. Did the version assertion run? If the old image is live, the deploy targeted the wrong reference.
4. Is it environment-specific configuration — a variable present in staging and missing in production?
5. Is it load-related — fine on staging's traffic, failing under production's?

### "It worked in staging"

Staging and production differ in ways that bite in a predictable order: **data volume** (queries fast on 1,000 rows, catastrophic on 10 million), **traffic and concurrency**, **configuration**, **integrations** (sandbox APIs behave differently from real ones), and **scale** (one instance versus twenty, where caching and state assumptions break).

The honest conclusion: staging reduces risk; it never eliminates it. That is precisely the argument for canary deployments and for fast, practised rollback.

---


## 8. Troubleshooting

### "Container image push fails"

**Layer:** Registry / credentials.

Read the error precisely — they mean different things:

| Error | Meaning | Fix |
|---|---|---|
| `unauthorized` / `authentication required` | Login didn't happen or didn't succeed | Check `docker login` ran and used the CI registry variables |
| `denied: requested access to the resource is denied` | Authenticated, but not allowed to write **this path** | The image name must be under `$CI_REGISTRY_IMAGE`; a custom path needs explicit permission |
| `name unknown` / `404` | Registry not enabled for the project | Enable the Container Registry in project settings |
| `Cannot connect to the Docker daemon` | No daemon — DinD service missing or privileged mode not allowed | Runner configuration, not YAML |
| `no space left on device` | Runner disk full | Runner maintenance / cleanup policies |

**First check:** does the log show a successful login line before the push?

### "Authentication works locally but fails in CI"

Your laptop has ambient credentials — a logged-in Docker config, an SSH agent, a cloud CLI profile, a kubeconfig. The runner has none of that. Only what you explicitly provide as variables exists.

Second cause, and it fools people for hours: **the variable is protected, and the branch is not.** The variable silently doesn't exist, and your script sends an empty password. Symptom: authentication fails on a feature branch and works on `main`.

Diagnostic that is safe:

```bash
- if [ -z "$MY_TOKEN" ]; then echo "MY_TOKEN is empty"; exit 1; fi
```

Never `echo $MY_TOKEN`. Check emptiness, not content.

### "Deployment job succeeded but the application is down"

The most important failure in this volume, and a preview of Volume 4.

The deploy job's success means **the deployment command exited 0**. It does not mean the application started, connected to its database, or can serve traffic.

```text
Deploy job: "I told the platform to run image X."     ✅ exit 0
Reality:    container crash-loops on a missing env var ❌ nobody asked
```

Investigate in this order:

1. **Is the right image actually running?** Compare the running image tag with `$CI_COMMIT_SHA` from the pipeline. Frequently the deploy targeted a stale tag.
2. **Did the container start, or is it restarting?** Container/platform status, not the pipeline.
3. **Application logs** at startup — missing configuration and failed dependency connections show up in the first seconds.
4. **Configuration difference** — an environment variable that exists in test and not in production is the classic cause.
5. **Dependencies** — database reachable from that environment? Network rules? Credentials for *that* environment?

**Prevention, and the bridge to Volume 4:** a deploy job that does not verify is not finished. Volume 4 adds a real verification step so "deployed" and "healthy" stop being two different facts nobody is checking.

---


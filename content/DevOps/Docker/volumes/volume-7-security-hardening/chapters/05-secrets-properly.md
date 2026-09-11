## Secrets, properly

### Why the usual approaches fail

**Baked into the image** — you proved this in Volume 2's exercise 2.2. The layer keeps it forever, whiteouts don't delete it, and anyone who pulls the image can `grep` it out.

**Build args** — recorded in image metadata:

```bash
mkdir -p /tmp/secret-demo && cd /tmp/secret-demo
printf 'FROM alpine\nARG API_KEY\nRUN echo "building with key" > /dev/null\n' > Dockerfile
docker build --build-arg API_KEY=supersecret123 -t argleak . > /dev/null
docker history --no-trunc argleak | grep -o "API_KEY=[a-z0-9]*" | head -2
```

**Expect:** the secret, printed out of the image history.

**Environment variables** — the most common approach and still weak:

```bash
docker run -d --name envleak --rm -e DB_PASSWORD=hunter2 alpine sleep 60
docker inspect envleak --format '{{json .Config.Env}}'
PID=$(docker inspect -f '{{.State.Pid}}' envleak)
sudo tr '\0' '\n' < /proc/$PID/environ | grep DB_
docker stop envleak
```

**Expect:** the password from `docker inspect`, and again from the host's `/proc`. It also leaks into child processes, crash dumps, error-reporting tools that helpfully attach the environment, and `docker compose config` output.

That said — honesty matters more than purity here — **environment variables are the de facto standard** and are acceptable when the values are injected at runtime by a secret manager rather than written in a file you commit. The unacceptable part is `POSTGRES_PASSWORD: localdev` sitting in git.

### What actually works

**Build-time: BuildKit secret mounts.** The secret is mounted into a single `RUN` and never becomes part of any layer:

```bash
cd /tmp/secret-demo
echo "supersecret123" > mysecret.txt
cat > Dockerfile.secret <<'EOF'
FROM alpine
RUN --mount=type=secret,id=apikey \
    cat /run/secrets/apikey > /dev/null && echo "used the secret at build time"
EOF
DOCKER_BUILDKIT=1 docker build -f Dockerfile.secret --secret id=apikey,src=mysecret.txt -t noleak . 2>&1 | tail -3
docker save noleak -o noleak.tar && mkdir -p x && tar -xf noleak.tar -C x
grep -r "supersecret123" x/ 2>/dev/null | head -2 || echo "secret NOT present in image — correct"
```

**Expect:** the build used the secret, and it is nowhere in the image.

**Run-time: file-based secrets.** Compose supports a `secrets` block that mounts files into `/run/secrets/` rather than setting environment variables:

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

Many official images support a `*_FILE` convention exactly for this — postgres, mysql, and others read the file rather than the variable. This keeps the value out of `docker inspect` and out of `/proc/PID/environ`.

**Run-time: tmpfs.** Volume 4's point — a decrypted credential written to tmpfs never touches a disk and can't end up in a backup or a forensic image.

**Beyond a single host:** HashiCorp Vault, AWS Secrets Manager, and equivalents, where the application fetches short-lived credentials at startup. The real prize there isn't secrecy but **rotation** — a credential that expires in an hour is worth more than one that's merely well-hidden.

```bash
cd ~ && rm -rf /tmp/secret-demo && docker rmi argleak noleak 2>/dev/null
```

---


## Lab: Prove Location Matching to Yourself

### Goal

See location matching in action by setting up multiple location blocks and testing requests against them.

### Setup

Update your `nginx.conf`:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    server {
        listen 80;
        server_name localhost;

        location = / {
            return 200 "EXACT: /\n";
            default_type text/plain;
        }

        location / {
            return 200 "PREFIX: /\n";
            default_type text/plain;
        }

        location /api/ {
            return 200 "PREFIX: /api/\n";
            default_type text/plain;
        }

        location ^~ /api/internal/ {
            return 200 "PREFERENTIAL: /api/internal/\n";
            default_type text/plain;
        }

        location ~ \.json$ {
            return 200 "REGEX: .json\n";
            default_type text/plain;
        }
    }
}
```

### Test and reload:

```bash
docker compose exec nginx nginx -t
docker compose exec nginx nginx -s reload
```

### Test each case:

```bash
curl http://localhost:8080/
# Expected: EXACT: /

curl http://localhost:8080/about
# Expected: PREFIX: /

curl http://localhost:8080/api/users
# Expected: PREFIX: /api/

curl http://localhost:8080/api/data.json
# Expected: REGEX: .json

curl http://localhost:8080/api/internal/status.json
# Expected: PREFERENTIAL: /api/internal/
```

### What to Observe

- `/` hits the exact match, not the prefix `/`.
- `/about` falls through to the generic prefix `/` because nothing more specific matches.
- `/api/users` hits the longer prefix `/api/`.
- `/api/data.json` would match the prefix `/api/`, but the regex `\.json$` overrides it.
- `/api/internal/status.json` would also match the regex, but `^~` on `/api/internal/` blocks regex checking.

Run each curl and verify your predictions match reality. If any result surprises you, re-read the matching algorithm and trace through it.

### Cleanup

After finishing this lab, we'll restore the static-serving config. Keep this matching knowledge — you will need it for every volume from here on.

---


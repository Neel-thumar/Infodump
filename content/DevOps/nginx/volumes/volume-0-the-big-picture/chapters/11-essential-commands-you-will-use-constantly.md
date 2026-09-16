## Essential Commands You Will Use Constantly

Before we dive into configuration in Volume 1, here are the nginx commands you will use over and over. Don't memorize them yet — just know they exist.

| Command | What it does |
|---|---|
| `nginx -t` | Tests the config for syntax errors without applying it |
| `nginx -s reload` | Gracefully reloads the config (no dropped connections) |
| `nginx -s stop` | Stops nginx immediately |
| `nginx -s quit` | Gracefully stops after finishing current requests |
| `nginx -V` | Shows the nginx version and compile-time options |

If you are using Docker:

```bash
docker compose exec nginx nginx -t        # test config
docker compose exec nginx nginx -s reload  # reload
docker compose restart nginx               # full restart (drops connections)
```

If you installed locally and use systemd:

```bash
sudo nginx -t                    # test config
sudo systemctl reload nginx      # graceful reload
sudo systemctl restart nginx     # full restart
```

**The most important habit to build right now:**

> **Always run `nginx -t` before reloading.** Every time. No exceptions.

A bad config that passes reload will take down your server. `nginx -t` catches the error before it does any damage.

---


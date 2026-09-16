## Lab Cleanup

If you want to stop the lab environment:

**Docker:**

```bash
docker compose down
```

**Local installation:**

```bash
# Stop the backends (Ctrl+C in their terminals)
sudo systemctl stop nginx
```

The project directory at `~/nginx-guide/` stays. We will use it throughout the entire guide.

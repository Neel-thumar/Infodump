## Interview Questions

### Level 1 — Fundamentals

**Q: How does nginx handle so many concurrent connections?**

nginx uses an event-driven, non-blocking architecture. Each worker process runs a single-threaded event loop that monitors thousands of connections and processes whichever one has data ready, instead of dedicating a thread to each connection. This avoids the memory and CPU overhead of thread-per-connection models.

**Q: What is the difference between the master process and a worker process?**

The master process reads the configuration, manages worker processes, handles signals (reload, stop), and opens log files and listening sockets. Worker processes handle actual client connections and request processing. There is one master and typically one worker per CPU core.

**Q: What does `nginx -t` do?**

It tests the configuration file for syntax errors without applying it. It checks that the config can be parsed correctly but does not verify that referenced files, directories, or upstream servers actually exist.

### Level 2 — Practical

**Q: What is the difference between a reload and a restart?**

A reload (`nginx -s reload`) is graceful: the master starts new workers with the new config while old workers finish serving existing connections. No connections are dropped. A restart kills all workers immediately and starts fresh, which drops in-flight connections.

**Q: How does nginx decide which `location` block handles a request?**

nginx first finds the longest matching prefix location. If it's an exact match (`=`) or preferential prefix (`^~`), it uses that immediately. Otherwise, it scans regex locations top-to-bottom and uses the first match. If no regex matches, it falls back to the longest prefix.

**Q: What is the difference between `root` and `alias`?**

`root` appends the full URI to the path: `root /var/www` + URI `/images/logo.png` = `/var/www/images/logo.png`. `alias` replaces the location prefix: `alias /var/www/img/` inside `location /images/` maps `/images/logo.png` to `/var/www/img/logo.png`.

### Level 3 — Scenario Based

**Q: You deployed a new `location /api/ {}` block but requests to `/api/data.json` are being handled by a different block. What's happening?**

How to think: a regex location like `location ~ \.json$` would match `.json` requests and override a standard prefix location. Prefix locations are overridden by regex locations unless the prefix uses `^~`. Check whether there's a regex location matching the URI. If so, either add `^~` to the prefix or move the logic into the regex block.

**Q: You changed `root` in one `location` block but files in other locations are now 404. What's wrong?**

How to think: if `root` was previously set at the `server` level and you moved it into a specific `location` block, other `location` blocks lose the `root` value. They fall back to the `http` context or default. Check where `root` is defined and ensure it's at the right level in the hierarchy.

### Level 4 — Senior Thinking

**Q: Why would you set up a `default_server` that returns 444 (connection close) for unknown hostnames?**

Without it, the first `server` block becomes the default, and scanners hitting your IP directly reach your actual site. Returning 444 drops connections from unknown hosts, reducing exposure of your application to bots and reconnaissance. It also prevents accidental exposure if DNS for another domain gets pointed to your IP.

**Q: What are the implications of a config reload for active long-lived connections like WebSocket connections?**

Old workers continue serving existing connections with the old config until those connections close. Long-lived connections (WebSockets, long polling) keep old workers alive. If you change proxy settings or upstream addresses, existing connections still follow the old config. You may need to wait for connections to drain or, in extreme cases, accept a short disruption.

---


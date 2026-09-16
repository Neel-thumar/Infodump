## Why This Matters

If you don't understand how nginx processes requests internally, every config change is guesswork. You won't know why `location /api/` matches differently than `location = /api/`, or why increasing `worker_connections` helps one problem and not another, or why a reload is safe mid-traffic but a restart isn't.

Architecture understanding is what separates "I copied this config from Stack Overflow" from "I know what this config does and I can fix it when it breaks."


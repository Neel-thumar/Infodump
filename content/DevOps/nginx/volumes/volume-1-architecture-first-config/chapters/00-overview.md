---
id: nginx-vol-1-architecture-first-config
title: "Volume 1 — Architecture and Your First Config"
order: 1
description: "nginx internals (master/worker, event loop), nginx.conf contexts, location matching, and serving static files."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 1 — Architecture and Your First Config

This volume opens up the nginx engine. Before writing real configuration, you need to understand what is happening on your machine when nginx runs — how it manages processes, how it handles thousands of connections without choking, and why a config reload doesn't drop active connections.

Then we write `nginx.conf` from scratch. Not by copying a production config and hoping for the best — by understanding contexts, directives, and how nginx decides which block handles which request. By the end, you will serve the static frontend of our project and confidently predict which `location` block matches any given URL.


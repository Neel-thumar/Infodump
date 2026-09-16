---
id: nginx-vol-2-reverse-proxy-load-balancing
title: "Volume 2 — Reverse Proxy and Load Balancing"
order: 2
description: "proxy_pass mechanics, proxy headers, upstream blocks, load-balancing methods, backend failure detection, and the trailing-slash trap."
draft: false
---

# Mastering nginx: Reverse Proxy, Load Balancer, and Web Server

## Volume 2 — Reverse Proxy and Load Balancing

In Volume 1, nginx served files from disk. That's useful, but it's not nginx's main job in most production setups. The main job is this: receive a request from a client, forward it to a backend application server, get the response, and send it back to the client.

This is **reverse proxying**, and when you have multiple backend instances, it becomes **load balancing**. Together, they are the reason nginx sits in front of almost every production application.

This volume teaches both. By the end, our project will have nginx proxying API requests to two backend servers and distributing traffic between them.


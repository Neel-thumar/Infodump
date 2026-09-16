## What's Next — Volume 2

In Volume 2, we put nginx to work as a reverse proxy and load balancer. We will:

- Configure `proxy_pass` to forward requests to our backend API.
- Understand the trailing-slash trap that silently changes forwarded URLs.
- Set proper proxy headers so the backend knows the real client IP and hostname.
- Configure `upstream` blocks with two backends.
- Set up round-robin, least connections, and weighted load balancing.
- Understand how nginx detects backend failures.
- Evolve the continuous project to Stages 2 and 3: reverse proxy to one backend, then load balance across both.

This is where nginx's most common production job begins.

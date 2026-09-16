## Your First Real Config — Step by Step

Let's build the Volume 1 configuration for our continuous project. We will configure nginx to serve the static frontend.

### Step 1: The Skeleton

Every `nginx.conf` needs at least `events` and `http`:

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {

}
```

- `worker_processes auto` — one worker per CPU core.
- `worker_connections 1024` — each worker handles up to 1024 connections.
- `http` — we will put our server config inside this.

### Step 2: Add a Server Block

```nginx
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name localhost;
    }
}
```

- `listen 80` — this server accepts connections on port 80.
- `server_name localhost` — this server responds to requests with `Host: localhost`. For local development, `localhost` is correct. In production, this would be your domain name.

### Step 3: Serve Static Files

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

        root /var/www/static;
        index index.html;

        location / {
            try_files $uri $uri/ =404;
        }
    }
}
```

Several new pieces. Let's understand each one.

---


## The Three Jobs of nginx

nginx is often described in three different ways, and people get confused about whether these are different tools. They are not. They are three jobs that the same nginx process performs.

### Job 1: Web Server — Serving Static Files

When a request comes in for a file that already exists on disk — an HTML page, a CSS stylesheet, a JavaScript bundle, an image — nginx serves it directly. It reads the file from the filesystem and sends it back to the client. No application server is involved.

This is nginx's simplest job, and it does it extremely efficiently.

```text
Client  ──GET /style.css──>  nginx  ──reads from disk──>  /var/www/style.css
Client  <──200 OK + file──   nginx
```

### Job 2: Reverse Proxy — Forwarding Requests to Backends

When a request needs application logic (an API call, a database query, a form submission), nginx forwards the request to an application server, waits for the response, and sends it back to the client.

The client never talks directly to the application server. It only knows about nginx.

```text
Client  ──GET /api/users──>  nginx  ──proxy──>  App Server (port 3000)
Client  <──200 OK + JSON──   nginx  <──JSON──   App Server
```

This is called a **reverse proxy** because the proxy works on behalf of the server, not the client. (A "forward proxy" works on behalf of the client — like a corporate proxy that your browser sends requests through. Different concept.)

### Job 3: Load Balancer — Distributing Requests Across Multiple Backends

When you have multiple instances of the same application running (for reliability, performance, or both), nginx decides which instance receives each request. This is load balancing.

```text
                                 ┌──>  App Server 1 (port 3001)
Client  ──GET /api/users──>  nginx ──┤
                                 └──>  App Server 2 (port 3002)
```

nginx picks one backend for each request based on a method you configure — round-robin (take turns), least connections (send to the least busy one), or other strategies.

### These three jobs work together

In a real production setup, nginx does all three at once:

- A request for `/index.html` → nginx serves the static file directly (web server).
- A request for `/api/orders` → nginx forwards it to one of the backend instances (reverse proxy + load balancer).

This is exactly the setup we will build across this guide.

---


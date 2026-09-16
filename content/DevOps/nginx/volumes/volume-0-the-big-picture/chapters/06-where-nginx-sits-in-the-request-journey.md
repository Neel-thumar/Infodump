## Where nginx Sits in the Request Journey

Let's trace what happens when a user's browser makes a request to your application, with nginx in the picture.

```text
1. User's browser sends:  GET https://myapp.example.com/api/orders

2. DNS resolves myapp.example.com to your server's IP address.

3. The request arrives at your server on port 443 (HTTPS).

4. nginx is listening on port 443.
   ├── nginx terminates TLS (decrypts the request).
   ├── nginx reads the Host header: myapp.example.com
   ├── nginx finds the matching server block for that hostname.
   ├── nginx matches the URI /api/orders against its location rules.
   ├── The matching location says: proxy to the upstream backend.
   ├── nginx picks one of the backend servers (load balancing).
   ├── nginx forwards the request to that backend (e.g., localhost:3001).
   │
   │   5. The backend processes the request, queries a database, etc.
   │   6. The backend sends the HTTP response back to nginx.
   │
   ├── nginx receives the response.
   ├── nginx may cache the response for future identical requests.
   ├── nginx adds/modifies response headers (security headers, compression).
   └── nginx sends the response back to the client over the TLS connection.

7. The browser receives the response and renders the page.
```

Every volume of this guide teaches a piece of this flow. By the end, you will understand every step.

---


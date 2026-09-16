## Protecting Against Slow Clients

Slow clients (or deliberate **slowloris**-style attacks) keep connections open for a long time, sending data as slowly as possible. This can exhaust nginx's connection slots.

nginx has built-in timeouts that protect against this:

```nginx
http {
    client_body_timeout   10s;
    client_header_timeout 10s;
    send_timeout          10s;
    keepalive_timeout     65s;
}
```

- **`client_header_timeout 10s`** — Close the connection if the client doesn't send the complete headers within 10 seconds.
- **`client_body_timeout 10s`** — Close the connection if the client stops sending the request body for 10 seconds.
- **`send_timeout 10s`** — Close the connection if the client stops reading the response for 10 seconds.
- **`keepalive_timeout 65s`** — Close idle keep-alive connections after 65 seconds.

These defaults are reasonable. Lowering them protects against slow clients but might affect legitimate users on very slow networks.

---


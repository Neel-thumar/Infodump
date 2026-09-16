## Why This Matters

Your application server — whether it's Node.js, Python, Go, Java, or .NET — is designed to run your business logic, not to handle the messy realities of internet-facing traffic: thousands of slow clients, TLS handshakes, keep-alive management, static file serving, and graceful failover when one instance crashes.

nginx handles all of that. Your application server only sees clean, fast, internal requests forwarded by nginx.

If you misconfigure the proxy, things break silently: the backend gets the wrong hostname, client IPs are lost, large requests fail, slow backends cause cascading timeouts. Understanding exactly what nginx does when it proxies a request prevents these problems.


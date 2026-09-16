## TLS Handshake Failures

### What It Means

The client cannot establish an HTTPS connection. This shows up as connection errors in the browser or curl, often before any HTTP request/response even happens.

### Common Causes

- Certificate file path is wrong or the file doesn't exist.
- Certificate and private key don't match (mismatched pair).
- Certificate has expired.
- Client doesn't support the TLS protocol version nginx offers (rare with modern clients, common with old ones).
- Certificate chain is incomplete (missing intermediate certificates).

### Investigation

**Step 1: Check the error log for TLS-specific errors.**

```text
2026/09/16 10:23:45 [emerg] 1#1: cannot load certificate
"/etc/nginx/certs/selfsigned.crt": PEM_read_bio_X509() failed
```

This means the certificate file is missing, corrupted, or the wrong format.

**Step 2: Verify the certificate and key match.**

```bash
openssl x509 -noout -modulus -in certs/selfsigned.crt | openssl md5
openssl rsa -noout -modulus -in certs/selfsigned.key | openssl md5
```

If the two MD5 hashes don't match, the certificate and key are not a pair — TLS handshakes will fail.

**Step 3: Check certificate expiry.**

```bash
openssl x509 -noout -enddate -in certs/selfsigned.crt
```

```text
notAfter=Sep 16 10:00:00 2027 GMT
```

If this date is in the past, the certificate has expired. Browsers will refuse the connection.

**Step 4: Test the handshake directly.**

```bash
openssl s_client -connect localhost:8443 -servername localhost
```

This shows the full handshake process and will report specific errors (expired cert, chain issues, unsupported protocol).

### Fix

- Correct the certificate file paths.
- Regenerate or replace mismatched certificate/key pairs.
- Renew expired certificates (and set up automated renewal — this is the most common cause of production TLS outages).
- Include the full certificate chain (`fullchain.pem` from Let's Encrypt includes intermediates).

### Prevention

- **Automate certificate renewal.** Manual renewal is forgotten until the certificate expires and the site goes down.
- **Monitor certificate expiry** with an alert 2–4 weeks before expiration.
- Test certificate changes with `openssl s_client` before relying on browser testing alone.

---


## What nginx Can and Cannot Protect

This is important to understand clearly.

### What nginx can do

- Rate limit by IP or other simple keys.
- Block requests by IP address.
- Add security headers.
- Terminate TLS.
- Hide backend details.
- Reject requests with oversized bodies.
- Time out slow clients.
- Block access to specific paths.

### What nginx cannot do

- **Validate application input.** nginx doesn't understand your API's data. SQL injection, XSS payloads, malformed JSON — these pass through nginx as normal request bodies.
- **Authenticate users.** nginx can check IP addresses and basic HTTP auth, but not application-level JWT tokens, OAuth flows, or session validation.
- **Detect application-layer attacks.** A web application firewall (WAF) like ModSecurity or a cloud WAF inspects request contents for attack patterns. nginx alone doesn't do this.
- **Prevent DDoS.** Rate limiting helps, but a serious distributed attack requires upstream mitigation (CDN, cloud DDoS protection).

nginx is the first gate. The application and specialised security tools are the inner gates. Don't assume "nginx is secure" means "the application is secure."

---


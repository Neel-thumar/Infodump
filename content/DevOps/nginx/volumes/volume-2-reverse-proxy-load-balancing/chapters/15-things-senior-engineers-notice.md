## Things Senior Engineers Notice

1. **The trailing-slash trap is the most common proxy misconfiguration.** Every team hits it at least once. When `/api/` requests suddenly return 404 from the backend, check the `proxy_pass` URI first.

2. **Proxy headers are not set by default.** If your backend logs show nginx's IP for every request instead of real client IPs, you forgot `proxy_set_header`. Check whether `proxy_params` is included in every proxied `location`.

3. **`proxy_read_timeout` is not the total request time.** It's the time between two successive reads. A response that sends data slowly but continuously will never trigger the timeout. A response that starts sending, then stalls completely for longer than the timeout, will.

4. **Passive health checks have a detection lag.** nginx only discovers a backend is down when a real user's request fails. The first few requests after a backend crash will fail (or get retried to a healthy backend). nginx Plus has active health checks that probe backends independently, but open-source nginx doesn't. This is a common interview topic.

5. **`keepalive` in the upstream is per-worker, not total.** `keepalive 32` means each worker keeps up to 32 idle connections. With 4 workers, you have up to 128 idle connections to that upstream. This is usually fine. Set it too high and you waste backend resources on idle connections; too low and you lose the keepalive benefit under load.

6. **`proxy_next_upstream` can cause duplicate requests.** If a POST request times out on backend-1 and nginx retries it on backend-2, you might create two orders/payments/records. For non-idempotent endpoints, either don't retry (`proxy_next_upstream off;` for that location) or make the backend idempotent.

7. **DNS resolution in upstream happens at startup.** If `server backend1:3001;` resolves to an IP at startup, nginx uses that IP until the next reload. If the IP changes (common with containers and cloud environments), nginx doesn't notice. In Docker Compose this is handled because Docker's DNS resolves service names. In other environments, you may need the `resolver` directive for dynamic DNS resolution.

8. **Buffering is your friend for most traffic.** Disabling it (`proxy_buffering off`) means the backend can't finish and move on — it's tied to the slow client's download speed. Only disable buffering for streaming endpoints where data needs to flow through immediately.

9. **502 vs 504 tells you different things.** 502 means nginx couldn't connect to the backend at all (it's down, wrong port, firewall). 504 means nginx connected but the backend didn't respond in time (it's slow, stuck, or overloaded). Different symptoms, different investigations.

10. **Connection reuse requires both sides to cooperate.** `keepalive` on the nginx side doesn't help if the backend closes connections after every request. Check your application server's keep-alive settings too.

---


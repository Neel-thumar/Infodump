## The Debugging Mindset

Before specific failures, internalize this question sequence. Apply it to almost any nginx problem.

```text
1. Did the config actually load?
       → nginx -t, check the error log for load-time errors

2. Which server/location block actually matched this request?
       → Trace the request through server_name and location matching

3. Is this an nginx problem or a backend problem?
       → Check $upstream_response_time vs $request_time in access log

4. Is this a network problem between nginx and the backend?
       → Check for connection refused / timeout errors in error log

5. Is this a client-side problem (headers, TLS, caching)?
       → Reproduce with curl -v, inspect request/response headers

6. Is this a resource-limit problem (connections, file descriptors, worker load)?
       → Check stub_status, system limits, error log for "too many" messages

7. What does the access log say happened? What does the error log say?
       → Cross-reference both logs by timestamp and client IP
```

This sequence works because it moves from cheapest-to-check to most-involved. Always start with `nginx -t` and the error log — they answer most questions in seconds. Only dig deeper when the obvious checks come up empty.

---


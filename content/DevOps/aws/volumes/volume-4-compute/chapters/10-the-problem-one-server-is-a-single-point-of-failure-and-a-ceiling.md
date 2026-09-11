## THE PROBLEM: One Server Is a Single Point of Failure and a Ceiling

Two servers, one hostname. Now what?

- How does a client know which one to use?
- What happens when one dies — and how do you know it died?
- How do you add a third at 9am and remove it at 6pm?
- How do you take one out of service without dropping the requests it's currently handling?

DNS round-robin was the historical answer and it's poor: clients cache, TTLs are ignored, and a dead server keeps receiving traffic until every resolver on earth forgets it. There's no health awareness at all.

You need something in the request path that knows which backends are alive.

---


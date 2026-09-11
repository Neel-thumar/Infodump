## The Question This Volume Answers

You upload a file to S3. AWS tells you it's designed for **eleven nines of durability** — 99.999999999%.

Stated differently: store ten million objects and you'd statistically expect to lose one every ten thousand years.

**How do you make a claim like that?** Not "how do you market it" — how do you engineer a storage system where losing data is that rare, while also serving it to the entire internet, at a price that started at fifteen cents per gigabyte per month and has fallen ever since?

And then the harder question. If S3 is that reliable, why did a large fraction of the internet go dark for four hours on a Tuesday in 2017? And why did tens of millions of people's personal records end up publicly readable in S3 buckets that same year?

Three things to take away:

1. **S3 has no folders**, and the consequences of that go much further than pedantry.
2. **Durability and availability are different properties**, engineered separately, and confusing them will mislead you.
3. **Permission systems that overlap produce holes**, which is the entire story of the open-bucket epidemic.

Then the edge: how a name becomes an address, and how bytes get close to people.

---


## THE MECHANISM: Durability vs. Availability

These get conflated constantly, and they're engineered by different means.

**Durability** — will the bytes still be there? S3 Standard is designed for **99.999999999%** annual durability. Achieved by redundancy: an object is stored across multiple devices in multiple facilities within the Region, with continuous integrity checking and automatic repair of detected corruption.

**Availability** — can you reach the bytes right now? S3 Standard targets **99.99%**, which permits roughly 53 minutes of unavailability per year. Achieved by having many front-end servers, many paths, and failover.

**The gap between those numbers is deliberate.** Eleven nines of durability and four nines of availability is a stated trade-off: your data is essentially never lost, but it may occasionally be unreachable. When forced to choose, S3 chooses "still exists" over "answering right now."

**And the gap is what February 2017 was.** The data was fine the entire time. Every byte was exactly where it should be. Nobody could get to it.

Hold that distinction. It's also why "S3 is 99.999999999% reliable" is a sentence that means nothing.

---


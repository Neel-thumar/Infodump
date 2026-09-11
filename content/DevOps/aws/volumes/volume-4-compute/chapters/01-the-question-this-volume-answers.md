## The Question This Volume Answers

You run one command and forty seconds later you have a computer in Virginia.

**Whose computer is it?** It's a slice of a physical machine you'll never see, shared with strangers, with a disk that isn't a disk and a network card that isn't a network card. And yet it performs, in many cases, within a few percent of bare metal.

That last part was not true ten years ago, and the story of how it became true is the story of AWS deciding that renting other people's hardware wasn't good enough — and buying a chip company.

Four things to take from this volume:

1. **Virtualization has a tax**, AWS spent a decade engineering it away, and the result is why a modern instance behaves the way it does.
2. **Your disk is on the network.** Almost everything surprising about EBS follows from that one fact.
3. **Bursting is a lie you can run out of.** Both EC2 and EBS have credit mechanisms that make a thing fast until suddenly it isn't.
4. **Scaling always lags demand**, structurally, and no configuration removes the lag — you can only account for it.

---


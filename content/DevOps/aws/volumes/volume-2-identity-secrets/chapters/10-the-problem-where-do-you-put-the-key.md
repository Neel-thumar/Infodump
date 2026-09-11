## THE PROBLEM: Where Do You Put the Key?

Encryption at rest sounds simple. Encrypt the data, store the ciphertext, done.

Then: where's the key?

Next to the data? Then anyone who steals the data steals the key. In the application config? Then every server has it, forever, and rotating it means re-encrypting everything. In a hardware security module you operate? Now you're running an HSM fleet, and if you lose it, every byte you own is gone permanently.

And underneath all of that, a scaling problem. Suppose you have one key for a petabyte of data. Rotating it means re-encrypting a petabyte. So you'd want many keys — but now you have a key management problem instead of a key storage problem, which is worse.

**The real problem isn't encryption. It's key custody and key lifecycle.**

---


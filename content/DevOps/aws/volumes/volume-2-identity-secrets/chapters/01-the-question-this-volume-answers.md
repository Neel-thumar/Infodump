## The Question This Volume Answers

In Volume 1 you learned that every AWS operation is a signed HTTP request. The signature proves *who sent it*.

But proving identity is the easy half. The hard half is the next question: **is this identity allowed to do this specific thing to this specific resource right now?**

That question gets answered several billion times a second, across millions of accounts, with policies written by people who mostly don't understand the evaluation rules. It has to be fast enough to not be a bottleneck and correct enough that a mistake doesn't leak a hundred million people's financial records.

Which it did, once. We'll get there.

Two ideas carry this volume:

1. **IAM is a deny-by-default evaluation engine**, and once you know its actual algorithm, policies stop being guesswork.
2. **KMS never encrypts your data.** It encrypts a key that encrypts your data, and that indirection is the entire product.

These belong in one volume because a KMS key policy *is* an IAM policy, evaluated by the same engine with one extra rule. Teaching them separately means teaching the same thing twice.

---


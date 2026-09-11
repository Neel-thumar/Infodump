## THE PROBLEM: Everything Is a Shared Machine

Go back to 2006. EC2 launches. There is no IAM.

Your account has one identity — the thing we now call root — and one credential pair. That's it. Every person on your team who needs to touch AWS shares the same secret. Every script uses it. When someone leaves, you rotate it and break everything simultaneously.

Now stack up what that can't express:

- "This intern can restart web servers but not touch the database."
- "This application can read from exactly one S3 bucket and nothing else."
- "Our auditor can look at everything and change nothing."
- "This build server can deploy, but only between 9am and 6pm, and only from our office IP."
- "This partner company's account can write to this one queue."

None of it. You have one key that does everything.

And there's a worse problem hiding underneath. Suppose your application needs to read from S3. You put a credential on the server. That credential is now a file on a machine. It sits there for months or years. Anyone who gets any kind of read access to that machine — a path traversal bug, a log that captured an environment variable, a misconfigured proxy, a stolen backup — gets a permanent key to your account.

**Long-lived credentials on machines is the structural flaw.** Almost everything IAM does is an attempt to eliminate it.

AWS launched IAM in 2011. It has grown steadily more capable and, honestly, steadily more complicated. Let's take it apart in the right order.

---


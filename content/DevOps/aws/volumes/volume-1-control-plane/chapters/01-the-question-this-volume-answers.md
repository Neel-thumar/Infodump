## The Question This Volume Answers

Open the AWS console. Click around. Launch something.

Now: **what did you actually just do?**

Not metaphorically. Mechanically. Did the browser talk to a server? Which one? In what format? How did it prove you were allowed to? And when AWS has a bad day — which it does — what exactly breaks, and what keeps running anyway?

Most people never ask. They learn the console as a set of gestures, the way you learn a videogame's controls. Then one day something fails in a way the gestures don't cover, and they have no model to reason with.

This volume gives you the model. There are three ideas in it, and all three will pay rent for the rest of your career:

1. **AWS is an API.** The console, the CLI, the SDKs, and Terraform are four clients for the same thing.
2. **Geography is a first-class concept**, and Region, Availability Zone, and edge location are three genuinely different things that people constantly conflate.
3. **Every service is split into a control plane and a data plane**, and knowing which is which tells you, in advance, what survives an outage.

We'll close with December 7, 2021, when a lot of companies learned idea #3 the expensive way.

---


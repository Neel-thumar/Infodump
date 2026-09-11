## THE PROBLEM: "It Works on My Machine"

Containers solve a packaging problem: bundle the application with its dependencies, its runtime, and its filesystem, so it runs identically everywhere.

Then a second problem appears immediately. You have a hundred containers and twenty machines. Something must decide what runs where, restart what dies, roll out new versions without dropping traffic, and route to the right instance as things move.

That's **orchestration**, and AWS's offerings here are genuinely three different things.

---


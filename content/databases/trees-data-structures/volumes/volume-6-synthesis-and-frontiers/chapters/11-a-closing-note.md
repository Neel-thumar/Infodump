# A Closing Note

Two papers, twelve years apart, contain most of this book.

In 1962, Adelson-Velsky and Landis observed that a binary search tree could be made to keep itself
balanced with a bounded amount of local work, and thereby turned a structure that was fast *on
average over inputs* into one that was fast *always*. In 1972, Bayer and McCreight observed that if
you make the node the size of the thing the disk hands you, the balance problem gets easier and the
tree gets a thousand times shorter — and that maintaining such a structure under continuous
modification, without ever taking it offline, was the actual problem worth solving.

Everything in these six volumes is an elaboration, a specialization, or a consequence of those two
observations, applied at a level of the memory hierarchy that did not exist when they were made.

And that, I think, is the reason the subject stays interesting rather than becoming settled. The
observations were about the relationship between a data structure and the machine underneath it — and
the machine keeps changing. Each new level in §36.1's table re-poses the same question with a new
constant, and each time the answer has the same shape and different arithmetic. The inter-core level
became dominant when core counts rose. Persistent memory appeared, prompted a genuinely new class of
crash-consistency algorithms, and then largely vanished. GPUs turned out to invert the central
assumption of Volume 3 for anyone with enough parallel work. CXL may add another row. Learned
indexes suggest the whole framing might be one implementation of something more general.

So the honest closing claim is not that this is a complete account of trees. It is that **the
question is stable even though the answers are not**, and that if you can look at a structure and
immediately ask *where does this data live, what is expensive there, and what summary does each node
need to carry* — you can derive most of what you need, including for the levels that have not been
invented yet.

That is a better thing to leave you with than a list of structures.

---


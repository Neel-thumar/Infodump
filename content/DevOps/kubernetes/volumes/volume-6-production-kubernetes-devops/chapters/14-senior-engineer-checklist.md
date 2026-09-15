## Senior Engineer Checklist

What experienced engineers actually think about before touching production:

1. What is the blast radius if this change goes wrong, and how do I undo it quickly?
2. Is this problem actually a Kubernetes problem, or an application problem Kubernetes is only exposing?
3. Which specific component is responsible for the behaviour I'm seeing, and what evidence proves it?
4. What does this configuration do under resource pressure or during a node failure, not just under normal conditions?
5. Is this a Kubernetes primitive or an ecosystem choice — and would swapping the ecosystem tool break anything that depends on it?
6. Have we actually tested the recovery path, or only ever tested the happy path?


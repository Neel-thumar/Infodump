## Common Mistakes to Actively Avoid

* Deploying without resource requests, "because it works in the lab"
* Treating a green rollout as proof the release is good, without a real readiness probe backing it
* Assuming namespaces provide network isolation
* Writing a default-deny NetworkPolicy without an explicit DNS allow rule
* Using a StatefulSet by reflex for anything that sounds "stateful," without checking whether a managed service would be simpler
* Leaving the `default` ServiceAccount auto-mounted everywhere
* Storing real Secret values in a Git-tracked manifest
* Skipping a practiced restore, and discovering the backup process was broken during an actual incident


## Things Senior Engineers Notice

1. **Kubernetes never stops.** Your intent is permanent until you change it. A bad manifest is not an error, it is a policy being enforced.
2. **Success from `kubectl` means the request was accepted, not that anything is running.** These are two different moments in time.
3. **Pod names are random on purpose.** If your process depends on a Pod name, your design is wrong.
4. **Kubernetes is only as good as your resource declarations.** It cannot pack what you did not measure.
5. **Most "Kubernetes problems" are application problems** that Kubernetes has made visible for the first time.
6. **Adding Kubernetes adds a team requirement, not just a tool.** Somebody now has to operate it.


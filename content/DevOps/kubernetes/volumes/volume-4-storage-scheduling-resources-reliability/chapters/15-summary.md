## Summary

| Concept | One line |
|---|---|
| Volume vs PV | A volume can be as temporary as the Pod; a PV outlives it |
| PVC | A request for storage; PV is what satisfies it |
| StorageClass | How to automatically create a PV for a PVC |
| Filtering | Removes nodes that cannot satisfy hard requirements |
| Scoring | Ranks the nodes that remain |
| Requests | Reserved and used for scheduling |
| Limits | Hard ceiling — memory kills, CPU throttles |
| QoS | Guaranteed > Burstable > BestEffort, in eviction priority |
| HPA | More Pods, based on metrics |
| Cluster Autoscaler | More nodes, based on Pending Pods |
| PDB | Protects availability during voluntary disruption |


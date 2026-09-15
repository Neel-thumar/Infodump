## Production Reality

| Topic | Local (`kind`) | Production |
|---|---|---|
| Storage | Local-path default StorageClass | Cloud block storage via a real CSI driver, snapshots configured |
| Scheduling | One node, little to decide | Affinity/anti-affinity and topology spread actively used across zones |
| Resources | Often skipped in labs | Always set; frequently enforced by LimitRange and ResourceQuota |
| Autoscaling | Cluster autoscaler irrelevant | HPA and cluster autoscaler working together routinely |
| PDBs | Rarely needed | Standard on anything user-facing before the first cluster upgrade |


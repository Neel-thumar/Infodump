## The Other Workload Types

You will meet these constantly. Know what each is for.

| Kind | Use it when | Key property |
|---|---|---|
| **Deployment** | Stateless apps — web, API, workers | Pods are interchangeable |
| **StatefulSet** | Databases, queues, anything needing stable identity | Stable names (`db-0`, `db-1`), own storage, ordered start/stop |
| **DaemonSet** | One Pod per node — log agents, monitoring, CNI | Automatically runs on every node, including new ones |
| **Job** | Run once until it succeeds | Tracks completions, retries on failure |
| **CronJob** | Run on a schedule | Creates a Job at each scheduled time |

The most common mistake is using a StatefulSet because something "sounds stateful". If your Pods do not need stable individual identity and per-Pod storage, a Deployment is simpler and better. We cover StatefulSet storage properly in Volume 4.


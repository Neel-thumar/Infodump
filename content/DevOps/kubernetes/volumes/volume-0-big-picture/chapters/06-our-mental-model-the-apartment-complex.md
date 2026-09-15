## Our Mental Model: The Apartment Complex

We will use one analogy for the whole guide. It is not perfect, but it is useful.

| Kubernetes thing | Apartment analogy |
|---|---|
| Cluster | The whole apartment complex |
| Node | One building in the complex |
| Namespace | One apartment (a separate area for one team or project) |
| Pod | One room |
| Container | The person or application living in that room |
| Deployment | The manager who makes sure 3 rooms are always occupied |
| Service | The reception desk / intercom people use to reach a room |
| ConfigMap | The notice board with general information |
| Secret | A locked document cabinet |
| Ingress | The main gate of the complex |
| Scheduler | The person who decides which building a new room goes into |
| Control plane | The management office |

The key insight from the analogy: **you do not book a specific room.** You tell the management office "I need 3 rooms for my team", and the office decides which building and which rooms. If a room becomes unusable, the office gives you another one. Visitors always go through reception, so they never need to know which room you are in today.

We will return to this whenever a concept is confusing. But remember — the analogy is only a bridge. The real explanation always follows.


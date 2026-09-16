## What Are We Learning?
Until now, our GitOps system has been operating in a single Kubernetes cluster. Argo CD lives in the cluster, reads Git, and deploys to the same cluster. 

In the real world, you do not install a separate Argo CD instance in every single cluster. You usually have one "Control Plane" cluster running Argo CD, which manages 10, 20, or 50 external "Workload" clusters across different regions. In this volume, we will spin up a second cluster, securely register it with Argo CD, and move our production web application to it. We will also discuss how Argo CD is scaled for high availability (HA) in true enterprise environments.


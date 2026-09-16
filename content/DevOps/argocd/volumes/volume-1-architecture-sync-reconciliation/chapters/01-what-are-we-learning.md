## What Are We Learning?
In Volume 0, we deployed an application manually by clicking "Sync" in the UI. While this is great for learning, it is not continuous delivery. 

In this volume, we will look under the hood. You will learn the internal architecture of Argo CD so you understand exactly how it talks to Git and Kubernetes. Then, we will configure full automation: Automated Sync, Self-Heal, and Prune. We will intentionally break our cluster using `kubectl` and watch Argo CD automatically fix the drift.


## Why Should a DevOps Engineer Care?

Because almost every Kubernetes problem you will ever debug is really the question: **which component stopped doing its job?**

Pod stuck in `Pending`? That is the scheduler. Pod created but nothing running on the node? That is the kubelet. `kubectl` timing out? That is the API server. If you do not know who does what, you are guessing.


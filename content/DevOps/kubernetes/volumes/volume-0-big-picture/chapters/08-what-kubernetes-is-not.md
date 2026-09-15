## What Kubernetes Is NOT

This list saves you from a lot of confusion later.

| Kubernetes is NOT | Reality |
|---|---|
| A container runtime | It does not run containers itself. It tells containerd or CRI-O to do it. |
| A replacement for Docker | Docker builds images. Kubernetes runs them. Different jobs. |
| A PaaS like Heroku | It will not build your code or guess what your app needs. |
| A networking solution | It defines networking *rules*, then requires you to install a plugin that implements them. |
| Automatic reliability | Kubernetes will happily keep a broken application running forever if that is what you asked for. |
| A way to avoid learning Linux | It is a way to describe Linux infrastructure precisely. When it breaks, you are debugging Linux. |

Write that last one on a sticky note. Most production Kubernetes problems end with a Linux answer.


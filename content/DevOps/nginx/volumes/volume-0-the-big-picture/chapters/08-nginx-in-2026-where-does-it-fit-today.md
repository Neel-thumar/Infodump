## nginx in 2026 — Where Does It Fit Today?

nginx is not a legacy tool. As of 2026, it remains one of the most widely deployed pieces of infrastructure software in the world.

Here is where you will commonly encounter it:

### Directly configured on servers or VMs

Small-to-medium deployments, on-premise setups, and many production environments still run nginx directly on Linux servers, configured by hand or through configuration management tools (Ansible, etc.). This is the primary mode this guide teaches.

### As a Docker container

`docker run nginx` is one of the most pulled images on Docker Hub. Running nginx in a container is extremely common for development, CI/CD, and production alike.

### As the engine inside Kubernetes Ingress

The **ingress-nginx** controller is one of the most popular Kubernetes ingress controllers. It runs nginx internally and generates `nginx.conf` from Kubernetes Ingress resources. If you understand nginx configuration, you will understand what ingress-nginx is doing under the hood — and you will be far better at debugging it.

### In front of API gateways and microservices

nginx often sits as the outermost proxy layer even when more specialized tools (Kong, which is itself built on nginx, or Envoy) handle internal routing.

Understanding nginx is not just about configuring one tool. It is about understanding the **traffic-handling layer** that sits in front of almost every production application.

---


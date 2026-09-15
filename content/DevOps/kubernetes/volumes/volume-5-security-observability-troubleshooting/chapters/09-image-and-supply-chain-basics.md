## Image and Supply-Chain Basics

Two practical habits, kept brief on purpose:

**Pin image versions, never `latest`.** An image tag is mutable — someone can push a different image under the same tag tomorrow. A specific tag, or better, an image **digest** (`image@sha256:...`), guarantees you are running exactly what you tested.

**Scan images before they run.** Vulnerability scanning of container images (Trivy, Grype, and cloud-provider registry scanning) is standard practice, and is ecosystem tooling that plugs into your CI pipeline before an image is ever pushed to a cluster.

Neither of these is a Kubernetes feature. They are practices that make everything Kubernetes runs trustworthy in the first place.


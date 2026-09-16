## Why Should a DevOps Engineer Care?
Security is not an afterthought in platform engineering. Argo CD has extremely high privileges in your Kubernetes cluster. If you do not lock it down, it becomes a massive attack vector. Furthermore, if you commit base64-encoded secrets (which is just encoding, not encryption) to Git, you are leaking credentials. Understanding AppProjects and external secrets separates junior engineers from senior platform architects.


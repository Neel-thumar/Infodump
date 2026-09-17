## Volume 3 checklist

- [ ] My application builds into an image inside the pipeline
- [ ] The image is tagged with the commit SHA and pushed to the GitLab Container Registry
- [ ] Test, staging, and production deployments use the **same** image reference
- [ ] `Operate → Environments` shows what is deployed where
- [ ] Production credentials are protected variables on a protected environment
- [ ] A manual approval job gates production
- [ ] I can explain why `:latest` breaks rollback
- [ ] I understand that my deploy job's success proves nothing about the application

**Next:** Volume 4 — Production Deployments and Release Engineering. Deployment strategies, verification that actually checks the application, and a rollback you have genuinely executed.

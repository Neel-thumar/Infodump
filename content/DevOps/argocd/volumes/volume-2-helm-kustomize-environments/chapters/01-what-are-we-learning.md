## What Are We Learning?
In Volume 1, we deployed raw, static YAML files. This is fine for a single application, but it fails in the real world. You do not want to copy-paste the exact same YAML into a `staging` folder and a `production` folder just to change the number of replicas or the image tag. 

In this volume, we will learn how Argo CD handles dynamic templates using tools like Helm and Kustomize. We will restructure our Git repository to support multiple environments and use Argo CD to deploy a `staging` and a `production` version of our web application from a single source of truth.


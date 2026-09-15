## When You Should NOT Use Kubernetes

A senior engineer knows this. A junior engineer assumes Kubernetes is always correct.

Kubernetes is probably the wrong choice when:

* You have one or two small applications and one server
* Your team has nobody who can operate it
* Your workload is a simple static website
* A managed service (App Runner, Cloud Run, App Service) already does the job
* You are adopting it because it is popular, not because you have the problem it solves

Kubernetes solves the problems of running **many** services across **many** machines with **changing** demand. If you do not have that problem, you are buying complexity for nothing.

Being able to say this in an interview makes you sound experienced, not negative.


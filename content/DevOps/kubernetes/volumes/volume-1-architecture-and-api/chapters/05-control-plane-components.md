## Control Plane Components

### kube-apiserver

The front door. Every request — from you, from `kubectl`, from any component — goes through it.

Its jobs:

* Authenticate (who are you?)
* Authorize (are you allowed to do this?)
* Validate (is this object even legal?)
* Store the object in etcd
* Notify anyone watching that something changed

If the API server is down, **nothing can be changed** in the cluster. Existing Pods keep running, but no new decisions get made.

### etcd

The cluster's memory. A key-value database holding every object — every Pod, Deployment, Secret, everything.

Two things to remember:

* Only the API server talks to etcd. Nothing else should.
* **If you lose etcd and have no backup, you have lost the cluster's entire configuration.** This is the number one backup priority in production.

### kube-scheduler

Decides which node a new Pod should run on. That is its entire job.

It does not start the Pod. It writes the chosen node name into the Pod object and stops. Something else picks it up from there.

### kube-controller-manager

One program containing many controllers. Each controller watches one type of object and enforces one rule:

* Deployment controller → makes sure ReplicaSets exist
* ReplicaSet controller → makes sure the right number of Pods exist
* Node controller → notices when a node stops reporting
* Job controller, endpoint controller, and many more

This is where reconciliation actually happens.

### cloud-controller-manager

Only present on cloud clusters. It talks to the cloud provider — creating load balancers, attaching disks, reading node metadata. This is the piece that knows about AWS, Azure or GCP, kept separate on purpose so the rest of Kubernetes stays cloud-neutral.


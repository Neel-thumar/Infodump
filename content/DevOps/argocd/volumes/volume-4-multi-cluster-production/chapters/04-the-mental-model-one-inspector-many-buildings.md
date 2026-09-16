## The Mental Model: One Inspector, Many Buildings

Let's return to our analogy. 
You still have one **Blueprint** (Git repository). 
You still have one **Inspector** (Argo CD). 
But now, you have **Multiple Buildings** (Kubernetes clusters).

The inspector sits in their office (the Control Plane cluster). When the blueprint updates, the inspector drives out to Building 1 (Staging Cluster) and updates it. Then, they drive out to Building 2 (Production Cluster) and update it. 

To enter Building 2, the inspector needs a key. In Kubernetes, this key is a **ServiceAccount Bearer Token**. Argo CD must be given a key to every external cluster it manages.

---


## 4. The analogy: a software factory

One analogy is used throughout this guide. Not a new one per chapter — one.

| Factory | CI/CD |
|---|---|
| Raw material | Source code in Git |
| Production line | The pipeline |
| Single machine step | A job |
| Section of the line | A stage |
| Worker / machine doing the step | A GitLab Runner |
| Finished, boxed product | An artifact / container image |
| Warehouse | Container registry / artifact storage |
| Shop where the product is installed | An environment |
| Delivery and installation | Deployment |
| Line stops, alarm sounds | Pipeline failure |
| Recalling a bad batch, shipping the previous one | Rollback |

The useful part of this analogy is what a factory refuses to do:

- A factory does not **rebuild the product differently for each shop.** It builds once and ships the same box everywhere. (This is "build once, promote many" — Volume 3.)
- A factory does not **ship a box that failed inspection.** (Quality gates.)
- A factory **knows which batch went to which shop.** (Versioning and traceability.)
- A factory can **stop the line instantly** when something is wrong. (Failing fast.)

Where the analogy stops: a factory's product is physical and its line is fixed. Software pipelines are themselves code — they change, they have bugs, and they need review. When the analogy and technical reality disagree, technical reality wins.

---


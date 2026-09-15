## Configuration: ConfigMaps

Never bake configuration into your image. If you do, every environment needs its own image, and changing a setting means a rebuild.

A **ConfigMap** holds non-secret configuration as key-value pairs. In the analogy, it is the **notice board** — information everyone can read.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: "info"
  APP_MODE: "production"
  app.properties: |
    timeout=30
    retries=3
```

There are two ways to use it, and the difference matters.

### As environment variables

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0
      envFrom:
        - configMapRef:
            name: app-config
```

Simple. But **environment variables are set once, at container start.** Change the ConfigMap and nothing happens until the Pod is recreated.

### As a mounted volume

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config
          mountPath: /etc/config
          readOnly: true
  volumes:
    - name: config
      configMap:
        name: app-config
```

Each key becomes a file. Mounted files **do** update when the ConfigMap changes, usually within about a minute — but your application must notice and reload them. Most applications do not.

### The practical rule

| You need | Use |
|---|---|
| Simple settings, restart on change is fine | Environment variables |
| Config files, or an app that watches for changes | Volume mount |
| Guaranteed rollout after a config change | Either, plus `kubectl rollout restart` |

That last row is what teams actually do: change the ConfigMap, then restart the Deployment. Explicit and predictable.


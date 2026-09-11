## Multi-stage builds

### The problem

Compilers, headers, package managers, and build tools are needed to *produce* an artifact and completely useless to *run* it. In a single-stage build they're all baked in forever — bigger downloads, slower deploys, and a much larger attack surface (Volume 7: a compiler in your production image is a gift to anyone who gets a shell in it).

The demonstration is most dramatic with a compiled language, so let's use Go. You don't need Go installed — that's rather the point.

```bash
mkdir -p ~/multistage && cd ~/multistage
cat > main.go <<'EOF'
package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintln(w, "hello from a very small image")
	})
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
EOF

cat > go.mod <<'EOF'
module hello

go 1.22
EOF
```

The naive single-stage build:

```dockerfile
FROM golang:1.22
WORKDIR /src
COPY . .
RUN go build -o /bin/hello .
EXPOSE 8080
CMD ["/bin/hello"]
```

```bash
cat > Dockerfile.single <<'EOF'
FROM golang:1.22
WORKDIR /src
COPY . .
RUN go build -o /bin/hello .
EXPOSE 8080
CMD ["/bin/hello"]
EOF

docker build -f Dockerfile.single -t hello:single .
```

Now the multi-stage version:

```bash
cat > Dockerfile.multi <<'EOF'
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/hello .

FROM scratch
COPY --from=builder /bin/hello /hello
EXPOSE 8080
ENTRYPOINT ["/hello"]
EOF

docker build -f Dockerfile.multi -t hello:multi .
```

Measure it yourself:

```bash
docker images hello --format "table {{.Tag}}\t{{.Size}}"
```

**Expect:** roughly **800–1000 MB** for `single` and **around 7–10 MB** for `multi` — the binary and nothing else. Two orders of magnitude. Verify it still works:

```bash
docker run -d --name hellomulti --rm -p 8080:8080 hello:multi
curl localhost:8080
docker stop hellomulti
```

**The mechanism:** each `FROM` starts a *new* image with a fresh layer chain. `COPY --from=builder` reaches into a previous stage's filesystem and takes only the named path. Everything else in the builder stage — the Go toolchain, the module cache, the source — is discarded, never committed to the final image, never pushed, never pulled.

`CGO_ENABLED=0` matters here: it produces a statically linked binary with no libc dependency, which is what lets `scratch` (an empty image) work at all. Without it the binary would need shared libraries that don't exist in an empty filesystem.

For most other languages the final stage is a runtime base rather than `scratch`:

```dockerfile
FROM node:20 AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/node_modules ./node_modules
USER node
CMD ["node", "dist/server.js"]
```

Two more capabilities worth knowing:

- **`--target`** builds only up to a named stage: `docker build --target builder -t myapp:build .` — useful for a test stage in CI.
- You can `COPY --from=` an **external image**, not just a stage: `COPY --from=alpine:3.20 /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/`. That line is how `scratch` images get working TLS.

Cleanup for this section:

```bash
docker rmi hello:single hello:multi
cd ~ && rm -rf ~/multistage
```

---


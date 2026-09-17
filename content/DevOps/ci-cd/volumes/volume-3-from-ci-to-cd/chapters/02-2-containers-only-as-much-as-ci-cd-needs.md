## 2. Containers — only as much as CI/CD needs

This is not a Docker course. You need four ideas.

**A Dockerfile is a build recipe.** It states a base image, copies your application in, and defines how it starts.

**An image is the immutable result** — application, runtime, dependencies, and OS libraries frozen together. This is what solves "works on my machine": the environment travels with the code.

**A container is a running instance of an image.** One image, many containers.

**A registry stores images.** Build pushes, deploy pulls.

```text
Application
   ↓
Dockerfile
   ↓
Container Image        ← the artifact, immutable
   ↓
Container Registry     ← the warehouse
   ↓
Deployment             ← pull and run
```

A reasonable Dockerfile for the project, using a multi-stage build:

```dockerfile
# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Two things worth noticing, because they are CI/CD concerns, not Docker trivia:

- **Multi-stage** means build tools stay out of the shipped image. Smaller image, faster pulls, smaller attack surface.
- **`USER node`** — do not run as root. A compromised container running as root is a much bigger problem.

---


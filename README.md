# WebJenga

WebJenga is a browser-based engineering visualizer built with C++, WebAssembly, and Three.js.

The current app is intentionally scoped as a clean first-order model:
- the concrete pillar uses axial vertical stress only
- self-weight increases stress linearly toward the base
- applied load contributes `P / A`
- the ground view uses geostatic stress plus a Boussinesq-style elastic spread estimate

It is not:
- a finite element model
- a full 3D stress tensor solver
- a full contact-mechanics solution
- a code-compliant structural design check

That narrower scope is deliberate. The goal is a physically honest, understandable engineering visualizer that works well in the browser and can be explained clearly to users and clients.

## Workspace

- `cpp/solver`: C++ solver compiled to WebAssembly
- `packages/wasm-bridge`: browser bridge for the Emscripten module
- `apps/web`: Vite web app
- `apps/web/src/viewer`: Three.js viewer

## Run

Install dependencies:

```bash
pnpm install
```

Build only the WebAssembly output:

```bash
pnpm run build:wasm
```

Run the app in development:

```bash
pnpm dev
```

Build the deployable site into `web/`:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

Build the native C++ solver directly:

```bash
g++ cpp/solver/main.cpp -o build/solver
./build/solver
```

## Model Summary

Inside the pillar:

```text
sigma_v(y) = P / A + rho g (depth below top)
```

So:
- stress is uniform across each horizontal slice
- stress varies only with height inside the pillar
- the base value is the maximum pillar stress

Inside the ground:
- geostatic stress is used as a background term
- the footing load is spread into the ground with a Boussinesq-style elastic half-space approximation

## Documentation

- [Solver model](/Users/nikos/WebstormProjects/WebJenga/docs/solver-model.md)
- [30-day plan](/Users/nikos/WebstormProjects/WebJenga/docs/30-day-plan.md)
- [Client positioning](/Users/nikos/WebstormProjects/WebJenga/docs/client-positioning.md)
- [Blog pack](/Users/nikos/WebstormProjects/WebJenga/docs/blog-pack.md)

## Live Demo

[https://quantuminformation.github.io/WebJenga/](https://quantuminformation.github.io/WebJenga/)

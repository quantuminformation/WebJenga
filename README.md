# C++ Concrete Stress Demo

This repo is now a small pnpm workspace:

- `cpp/solver`: C++ engineering logic compiled to WebAssembly
- `packages/viewer`: reusable 3D viewer package
- `packages/wasm-bridge`: browser bridge for the generated Emscripten module
- `apps/web`: Vite-based browser app

Install workspace dependencies:

```bash
pnpm install
```

Native solver build:

```bash
g++ cpp/solver/main.cpp -o build/hello
./build/hello
```

WebAssembly build only:

```bash
pnpm run build:wasm
```

Run the workspace web app in development:

```bash
pnpm dev
```

Build the deployable site into `web/`:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```

GitHub Pages deployment:

1. Push to `main`.
2. In the repository settings, set Pages source to `GitHub Actions`.
3. GitHub Actions will run the pnpm workspace build and deploy the generated `web/` folder.
4. Live demo: [https://quantuminformation.github.io/WebJenga/](https://quantuminformation.github.io/WebJenga/)

Notes:

- This step calculates combined axial stress from self-weight plus an applied top load.
- It uses a simple axial model: `sigma_total = W / A + P / A`, with `W = m g`.
- It is a demo for the browser visualiser, not a code-compliant structural design check.

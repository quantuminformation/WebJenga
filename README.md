# C++ Concrete Stress Demo

Native build:

```bash
g++ main.cpp -o hello
./hello
```

Browser build with Emscripten:

```bash
./scripts/build-wasm.sh
python3 -m http.server
```

Then open `http://localhost:8000/web/index.html`.

GitHub Pages deployment:

1. Push to `main`.
2. In the repository settings, set Pages source to `GitHub Actions`.
3. GitHub Actions will build the site and deploy the `web/` folder.
4. Live demo: [https://quantuminformation.github.io/WebJenga/](https://quantuminformation.github.io/WebJenga/)

Notes:

- This step calculates combined axial stress from self-weight plus an applied top load.
- It uses a simple axial model: `sigma_total = W / A + P / A`, with `W = m g`.
- It is a demo for the browser visualiser, not a code-compliant structural design check.

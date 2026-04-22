# C++ Hello World

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

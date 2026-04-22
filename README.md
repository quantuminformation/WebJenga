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

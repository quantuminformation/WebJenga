# Blog Pack

## Post 1

### Title

Why Stress Is Uniform Across a Column Section in the Simplest Model

### Angle

Explain the difference between:
- uniform stress across a slice
- changing stress with height

### Outline

1. Start with `stress = force / area`
2. Explain why every point on an ideal slice sees the same vertical stress
3. Add self-weight and show why stress rises toward the base
4. Show the WebJenga section screenshot
5. End with what this simple model leaves out

## Post 2

### Title

Self-Weight vs Applied Load in a Concrete Pillar

### Angle

Make the model intuitive.

### Outline

1. Applied load gives a uniform `P / A`
2. Self-weight accumulates with depth
3. The base carries everything above it
4. Show how the app visualizes this
5. Explain why that matters in real engineering communication

## Post 3

### Title

How Load Spreads Into the Ground Below a Footing

### Angle

Explain the ground side without overselling it.

### Outline

1. Surface load does not travel straight down as a perfect column
2. Stress spreads into the ground with depth
3. Geostatic stress already exists before the footing load
4. WebJenga uses a Boussinesq-style elastic estimate
5. Explain that this is first-order, not full soil FEM

## Post 4

### Title

Why I Built an Engineering Visualizer in C++ and WebAssembly

### Angle

Tie the technical stack to a business outcome.

### Outline

1. Many engineering tools still live in spreadsheets
2. Browser UX is better for communication and training
3. C++ and WebAssembly let you keep computational logic fast and portable
4. The UI layer can stay modern and interactive
5. Show how this approach could be reused for client tools

## Post 5

### Title

What This Engineering Demo Simulates and What It Does Not

### Angle

Build trust by being explicit.

### Outline

1. What is included
2. What is intentionally simplified
3. What would require FEM or a fuller mechanics model
4. Why first-order models are still useful
5. Why honest scope is better than fake complexity

## Publishing Notes

- keep each post short
- use one screenshot or diagram per post
- include one equation at most unless the post is specifically educational
- always link back to the live demo
- end with a sentence about custom engineering tools or explainers

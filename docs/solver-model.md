# Solver Model

## Purpose

This app is a first-order engineering visualizer, not a full continuum mechanics solver.

The current model is designed to be:
- physically defensible at first order
- easy to explain
- fast enough for real-time browser interaction

## Pillar Model

The concrete pillar is treated as a prismatic member under:
- its own self-weight
- a fixed applied top load

Cross-sectional area:

```text
A = width x depth
```

Self-weight:

```text
W = rho x A x height x g
```

Applied stress:

```text
sigma_applied = P / A
```

Self-weight stress at a point depends only on depth below the top:

```text
sigma_self(y) = rho g (depth below top)
```

Total pillar vertical stress:

```text
sigma_v(y) = sigma_applied + sigma_self(y)
```

Implications:
- every horizontal slice of the pillar is uniform across its width and depth
- stress increases linearly from top to base
- the base value is the maximum pillar stress

## Ground Model

The ground uses two pieces:

### 1. Geostatic stress

The ground carries its own weight:

```text
sigma_geo = rho g z
```

where `z` is depth below the ground surface.

### 2. Footing load spread

The footing load is spread into the ground using a Boussinesq-style elastic half-space approximation.

In practice the code:
- subdivides the footing area into small patches
- applies a vertical stress contribution from each patch
- sums the vertical stress contributions at the sampled point

Implications:
- stress is highest under the footing
- stress spreads outward with depth
- stress decays away from the footing

## What Is Not Included

The current solver does not do:
- finite element analysis
- full displacement solving
- full stress tensor solving
- nonlinear soil behaviour
- real contact mechanics
- reinforcement effects
- cracking or plasticity

## Why The Scope Matters

This app is strongest when described honestly:
- pillar: axial vertical stress visualizer
- ground: first-order elastic spread estimate

That is enough to make the demo useful for:
- teaching
- communication
- early-stage explanation tools
- custom browser engineering software pitches

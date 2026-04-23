# 30-Day Plan

## Goal

Turn WebJenga into a polished, honest engineering demo that is good enough to:
- explain the model clearly
- publish technical blog posts around it
- use as a lead-generation asset for client work

## Week 1: Lock The App Scope

- finish UI cleanup so the app reads as a vertical-stress visualizer
- remove or hide any controls that imply unsupported physics
- tighten the section interaction until it is obvious on first use
- rewrite all labels from generic `stress` to `vertical stress` where appropriate
- verify there is no accidental physics mismatch between solver and UI

Deliverables:
- stable demo build
- screenshots for desktop
- clean README

## Week 2: Learn The Solver Completely

- walk through every function in `cpp/solver/main.cpp`
- write plain-English notes for:
  - area
  - volume
  - mass
  - self-weight
  - `P / A`
  - geostatic stress
  - Boussinesq-style spread
- make sure you can explain each assumption without jargon

Deliverables:
- solver notes
- diagrams or sketches for each concept
- clear list of “what this app does not simulate”

## Week 3: Publish Blog Content

- write 3 to 5 short technical posts
- turn screenshots and diagrams into visual explainers
- post them on your site and LinkedIn
- keep every post tied back to the live demo

Best initial topics:
- why stress is uniform across a pillar section in the simple model
- self-weight vs applied load
- how load spreads into the ground
- what WebAssembly is useful for in engineering software
- what this demo simulates and what it does not

Deliverables:
- 3 published posts minimum
- one landing page tying the posts and demo together

## Week 4: Use It To Get Clients

- make a short outreach list of engineering firms, consultants, and education/training businesses
- pitch the demo as proof you can build interactive browser engineering tools
- focus on custom tools, explainers, calculators, and internal training software
- collect feedback from real conversations and tighten the message

Deliverables:
- outreach message
- portfolio case study
- shortlist of target client types

## Success Criteria

By the end of 30 days you should have:
- one clean demo
- one honest physics story
- one understandable C++ solver
- several pieces of content
- a repeatable client pitch

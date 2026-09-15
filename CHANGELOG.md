# Changelog

## 2.0.0 — 2026-09-15

Rebuilt the stylized first-edition handset as an editable, reference-based 3310 front-face reconstruction. All game controls remain semantic buttons; painted keycaps and mobile hit targets are separate.

Replaced the flat display with an anisotropic reflective LCD projection: 84×48 binary logical pixels, unequal physical pixel pitch, electrode gaps, displaced shadows, asymmetric response, static polarizer texture, lens reflection, ambient illumination, green backlighting, and viewing-angle contrast. Daylight, backlit and dark-room presets also affect handset illumination.

Added opt-in WebGPU texture export for deterministic pixel testing without requiring a browser compositor. Interactive rendering remains direct-to-swap-chain; Canvas fallback uses matching equations, cached projection tables, and no per-pixel frame allocations. Rendering settles to zero scheduled frames after the response tail.

Preserved touch/keypad/swipe/keyboard gameplay, optional thumb controls, landscape focus mode, local scores and paused saves, nine speeds, maze variants, audio, haptics, and hosted offline support.

Added native shader-output comparisons, real-origin touch/storage/offline tests, visual evidence, integrity-checked Pages publication, content-versioned offline caches, and complete source bundles. See docs/VALIDATION.md for executed coverage and physical verification boundaries.

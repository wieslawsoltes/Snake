# Snake · 3310 Edition

A complete, dependency-free HTML/JavaScript Snake II recreation with a reference-reconstructed Nokia 3310 handset, an 84 × 48 one-bit framebuffer, and a WebGPU reflective-LCD renderer. The same game also runs through a matching Canvas 2D renderer.

**[Play on GitHub Pages](https://wieslawsoltes.github.io/Snake/)** · **[Visual-fidelity notes](docs/FIDELITY.md)** · **[Validation](docs/VALIDATION.md)**

![Reference-reconstructed handset in daylight](docs/fidelity/desktop-daylight.png)

## What changed in version 2

The original stylized shell has been replaced by a single 480 × 1130 vector coordinate system: a narrow navy housing, silver horseshoe surround, six vertically arranged receiver apertures, inset display lens, Nokia plaque, cyan Navi-key stripe, C key, curved diagonal scroll rocker, and individually bowed numeric-key rows. The faceplate and physical controls retain their shapes when the optional touch pad is enabled.

The LCD is no longer a stretched flat green bitmap. Its 84 × 48 logical elements project through an approximately 30:22 display aperture, producing rectangular physical pixel cells. The optical model includes electrode gaps, asymmetric liquid-crystal response, a displaced pixel shadow, reflective olive-gray substrate, deterministic polarizer grain, lens reflection, uneven green edge illumination, and viewing-angle-dependent contrast. Lighting presets adjust both the LCD and the handset legends.

This is **a clean-room visual reconstruction**, not a ROM emulator, scanned production CAD model, or laboratory-calibrated reproduction of a particular panel. Artwork, typography, maze layouts, audio, and response constants are independently reconstructed. See the explicit measured/unmeasured boundary in [FIDELITY.md](docs/FIDELITY.md). Nokia trademarks identify the device being recreated; this project is not affiliated with Nokia.

## Run

Requires Node.js 22 or newer for the development tools; the shipped game has no runtime dependencies and needs no dependency installation.

```sh
npm start
# Open http://localhost:8080
```

```sh
npm test
npm run build
# dist/ is the complete static site.
# snake-3310.html is the complete single-file edition.
```

Open the standalone HTML directly on a desktop, or host `dist/` on any HTTPS static server. A secure context and an available browser adapter are required for WebGPU. Canvas 2D is selected automatically when those conditions are not met, when GPU initialization fails, or when the device is lost. HTTPS hosting is also the practical way to use the game on a phone and install/cache the application.

GitHub Pages deployment is defined in `.github/workflows/pages.yml`; relative paths support the `/Snake/` project-site prefix. `dist/build-info.json` records the version, source commit and build timestamp.

## Play

Press **Enter** or the physical Navi key to start. Steer with **arrow keys**, **WASD**, **2 / 4 / 6 / 8**, the physical keypad, or swipes on the screen. **Space / 0** pauses or resumes. Hold **5** for the optional boost. **C / Escape** navigates back. The two arrow regions on the physical rocker navigate the LCD menu. The top power key toggles the backlight.

Touch inputs are handled on pointer-down, not after a delayed click. The turn queue preserves two rapid corners without allowing an immediate reverse. Pointer capture and cancellation release held controls. Every numeric-key touch target is at least 44 × 44 CSS pixels in the tested mobile handset layout, without enlarging the painted key cap. A separate thumb pad and a landscape-friendly focus layout provide larger targets.

Nine speed levels, a wraparound field, five alternative wall layouts, food, timed bonus items, growth, wall/self collision, pause/continue, restart confirmation, high scores, saved runs and a full-board win are implemented. Saves restore paused. Visibility changes, losing focus and page lifecycle transitions pause gameplay instead of letting it continue unseen. Sound, haptics, backlight, contrast, LCD response, matrix gaps, surface reflection and lighting are configurable.

## LCD appearance controls

Open the top-right settings button:

| Control | Behavior |
| --- | --- |
| Daylight | Reflective gray-green LCD with the backlight off |
| Backlit | Green edge illumination and illuminated key legends |
| Dark room | Reduced ambient illumination on both display and case |
| Ambient light | Continuous 5–100% illumination adjustment |
| Viewing angle | Panel contrast changes from −45° to +45°; does not rotate the phone |
| Contrast | Black-state absorption strength |
| LCD response | Independent turn-on and turn-off exponential persistence |
| Pixel matrix | Electrode aperture gaps, not CRT scanlines |
| Glass reflections | Static lens reflection and polarizer texture |

## Architecture

`src/engine.js` is independent of rendering and DOM. It uses a bounded typed-array body ring and occupancy map, deterministic seeded random state, explicit collision/growth semantics, and serializable snapshots. Simulation uses a fixed timestep; rendering never controls movement speed.

`src/lcd.js`, `src/font.js`, and `src/artwork.js` rasterize the interface, independently drawn glyphs and title art into exactly 4,032 binary cells. Anti-aliasing is applied only when projecting the physical screen, not to the game framebuffer.

`src/renderer.js` uploads the binary targets to a WebGPU storage buffer. A compute shader evolves 4,032 floating-point charge values; a fragment shader projects the rectangular matrix through the optical model. GPU and CPU implementations share the same constants and equations in `src/optics.js`. Actual shader/canvas parity is checked by `tests/hosted.py`.

The Canvas renderer bakes static surface, aperture and pixel-index tables only when size or optical settings change. Ordinary frames reuse all buffers and run a charge loop followed by a linear RGBA loop. Display rendering stops after the liquid-crystal response has settled. No animated noise, CSS filter per logical pixel, giant DOM pixel grid, framework, font download, remote asset fetch, or per-frame texture allocation is required.

`src/app.js` coordinates explicit UI states, lifecycle, controls, accessibility announcements, focus, settings and render invalidation. `src/storage.js` validates persisted input and preserves version-1 save compatibility. `src/audio.js` synthesizes tones after a user gesture. `sw.js` supplies an origin-local versioned application-shell cache for hosted offline use.

`assets/handset.svg` is the editable vector master; the same paths are inlined in `index.html` so physical-control hit areas align with the model and standalone export needs no assets.

## Test and package

```sh
npm test
npm run build
python -m pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
npm start
# In another terminal:
python tests/browser.py --require-webgpu
python tests/fidelity.py
python tests/hosted.py
python tools/package.py
```

Headless CI explicitly selects Chromium's SwiftShader WebGPU adapter. This executes the actual WebGPU API and WGSL shaders, but is **not a physical GPU performance measurement**. The fixture-only commands below test the standalone game and real browser input/layout APIs with an explicit storage adapter; they do not establish real-origin WebGPU, service-worker or persistence support:

```sh
python tests/browser.py --fixture
python tests/fidelity.py --fixture
```

The full package contains editable source, the standalone edition, deployable `dist/`, tests, reports, vector master, screenshots and the CI workflow. It excludes Git metadata, dependencies and caches.

For diagnostics, append `?debug&nosw` to the URL. `window.__snake.inspect()` is a read-only state snapshot; it is not enabled for normal visitors. Append `?renderer=canvas` to force the CPU projection.

## License and references

Code and independently authored graphics are distributed under the [MIT license](LICENSE), subject to the trademark clarification above. No Nokia firmware, extracted ROM bitmap, photographed product texture or third-party font is bundled. Primary device and technical references are documented in [FIDELITY.md](docs/FIDELITY.md).

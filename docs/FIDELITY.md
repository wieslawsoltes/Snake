# Visual-fidelity and calibration record

## Target

The reference is the original navy/silver Nokia 3310, not the later reissued device. The implementation is a front-view reconstruction intended to preserve its recognizable physical proportions while remaining a functional mobile game.

The handset is independently drawn SVG, not a product photograph with an interactive rectangle placed over it. There are no external image dependencies. The receiver, surround, lens, wordmark, key wells and controls share one coordinate system. The painted caps are distinct from larger semantic HTML-button hit areas.

## Reference-derived geometry

The shell's 480 × 1130 coordinate space retains the approximate 48:113 width/height ratio. Receiver openings are a vertical line of six dark apertures. The silver surround encloses the upper face and terminates around the central Navi key. The C key is left of the Navi key, while a curved two-region diagonal rocker occupies the right. Numeric rows are bowed and the right-column legends are laid out in the opposite order to the left column.

The logical panel contains 84 columns and 48 rows. The physical display opening is projected at approximately 30:22. **The latter is a reconstruction parameter, not an asserted measurement of every production panel.** Its consequence is important: a logical cell is visibly taller than it is wide, rather than being a square CSS pixel. Scaling therefore uses the actual display rectangle's width and height independently.

## Optical model

The image remains monochrome binary game data. Continuous values represent liquid-crystal charge and light response, not additional gameplay colors.

1. Target RAM: one logical on/off value for each of 4,032 elements.
2. Charge response: `q += (target - q) * (1 - exp(-dt/tau))`, using a 32 ms rise constant and an 85 ms fall constant. Near-settled values snap to the exact target. These are selected visual-model constants, **not oscilloscope measurements from Nokia hardware**.
3. Electrode aperture: independent horizontal and vertical gaps, with output-footprint anti-aliasing. No CRT scanline or RGB subpixel effect is added.
4. Substrate: diffuse gray-green reflectance, slight vignette and fixed microscopic grain. Grain is deterministic in panel coordinates; it does not shimmer from frame to frame.
5. Backlight: green side-light contribution with an edge falloff. Handset legends and the Navi stripe respond to the same backlight setting.
6. Reflection: a weak angled lens reflection and a small offset shadow behind activated elements approximate the cover/layer separation.
7. Viewing angle: modifies black-state density and polarizer tint without deforming the framebuffer or turning it into a perspective-filtered screenshot.

RGB constants are display-referred sRGB. This is deliberately a compact perceptual model, not a spectral, polarization-resolved ray tracer. Browser color management, monitor calibration, ambient light and the user's viewing angle influence the final impression.

## Fidelity boundary

| Aspect | What is implemented | What is not claimed |
| --- | --- | --- |
| Screen resolution | Exact 84 × 48 logical matrix | Original controller bus timing or electrical emulation |
| Handset | Reference-based SVG geometry and materials | Scanned CAD, production-tolerance geometry or identical wear |
| Lens and LCD | Rectangular cells, gaps, response, reflection, side illumination and angle dependence | Measured spectral reflectance, polarizer transfer function or exact unit-to-unit calibration |
| Game graphics | Independently drawn title, bitmap glyphs, menus and sprites | Extracted Nokia ROM art or pixel-for-pixel firmware screenshots |
| Game rules | Working Snake II-style simulation | Certified identity of original bonus, speed and maze tables |
| Sound | Synthesized monophonic feedback | Original waveform/driver/speaker impulse response |
| Input | Physical-layout keys, swipe and accessible large hit targets | An electrically emulated keypad matrix |

A static screenshot cannot establish “100% the same as an original physical phone.” That would require a specified reference unit, controlled illuminants and camera, a color-managed display, measured LCD response at a defined temperature, and side-by-side geometric/photometric comparison. This release improves the reconstruction substantially and exposes calibration controls; it does not replace those measurements with an unsupported percentage.

## Reproducible visual review

`tests/fidelity.py` checks the shell ratio, LCD projection, six-aperture receiver, settled render suspension, lighting controls, keypad hit areas and touch-pad separation, and captures daylight/backlit/dark-room/oblique/gameplay/mobile views. These tests establish implementation consistency, **not comparison against a golden original-phone photograph**.

`tests/hosted.py` compares the actual WebGPU projection with the CPU implementation for four lighting/view-angle cases. It also tests a real WebGPU device-loss transition and service-worker offline reload. SwiftShader proves execution of the WGSL path, not physical GPU throughput or real-phone appearance.

## References

- Mobile Phone Museum, original Nokia 3310 record and device photographs: <https://www.mobilephonemuseum.com/phone-detail/nokia-3310>.
- Additional original-device front-view reference used during visual review: <https://touchtheworld.hu/images/elado/166/nokia_3310_kartyafuggetlen-2.jpg>. The photograph is not redistributed or used as a runtime texture.
- W3C/GPUWeb WebGPU Shading Language: <https://gpuweb.github.io/gpuweb/wgsl/>.
- Chromium/Dawn CTS adapter selection, including SwiftShader: <https://dawn.googlesource.com/dawn/+/HEAD/webgpu-cts/>.
- Chrome headless WebGPU setup: <https://developer.chrome.com/blog/supercharge-web-ai-testing>.
- GitHub Pages custom-workflow documentation: <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>.

References guide the reconstruction; they do not endorse its fidelity or constitute a measurement dataset.

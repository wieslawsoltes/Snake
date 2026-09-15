# Validation

## Executed suites

The version-2 reconstruction was checked on 2026-09-15:

| Suite | Passed | Boundary |
| --- | ---: | --- |
| Node unit/build/renderer contracts | 75 | Engine, snapshots, collision, storage, bitmap graphics, optical math, uniform layout, fallback, cache/resize, build integrity and content-versioned worker |
| Browser gameplay acceptance | 21 | Real-origin Chromium DOM, input, layout and localStorage |
| Handset/LCD checks | 11 | Shell ratio, rectangular projection, receiver geometry, lighting/angle settings, render settling, mobile target size and thumb-pad separation |
| Hosted WebGPU/offline integration | 8 | Native WGSL pixel output, four optical comparisons, actual device loss, service worker and offline reload |

The initial real-origin shader/input/offline run was [34997304938](https://github.com/wieslawsoltes/Snake/actions/runs/34997304938). That run had 74 Node tests; the public-build/cache regression was subsequently added as test 75. Generated `CI-VALIDATION.md`, TAP output and machine-readable reports identify subsequent release executions.

Native GPU/CPU mean RGB-channel errors were 0.0683 (daylight), 0.0676 (backlit), 0.0683 (dark room), and 0.0725 (oblique), in 8-bit channel units. The maximum individual channel error was 4/255. These compare implementations of the reconstructed optical model, not the model against a physically measured original screen.

## Native GPU versus presentation

The hosted suite requires genuine WebGPU shader execution. Production compute and fragment pipelines render to an `rgba8unorm` texture, copied to a mapped buffer with 256-byte row alignment. Exported pixels are compared with Canvas output. This gate cannot pass by falling back to Canvas.

UI and touch acceptance run separately and accept the production Canvas fallback. The Linux software-rendering CI compositor rejects the WebGPU swap-chain SharedImage configuration, so a passing native texture readback must not be described as physical-GPU presentation validation. `tests/browser.py --headed --require-webgpu` retains a stricter presentation gate for representative hardware.

Hosted tests do not mock GPU devices, shader compilation, origin storage, caches or service workers. SwiftShader is used for repeatability, not hardware benchmarking. Actual device destruction is exercised, followed by canvas replacement and continued CPU rendering.

## Build and publication

The Pages workflow rebuilds and serves the exact `dist/` tree, runs every suite, and publishes only after success. It records provenance and commits generated delivery evidence on main. The live-site verifier checks the expected source commit and every public asset's SHA-256 and byte length.

Initial publication succeeded but verification exposed a control-file assumption: `.nojekyll` is not a public runtime asset. The builder now excludes Pages control metadata from the public manifest, covered by a regression test. Offline cache identity is derived from runtime content; rebuilding identical assets leaves it stable, while changed assets produce a new worker/cache.

Reports are `unit-test-results.txt`, `browser-test-results.json`, `fidelity-results.json`, `hosted-test-results.json`, and generated `CI-VALIDATION.md`. Deployment verification produces `published-test-results.json` as a separate workflow artifact. Presence of a script alone is not passing execution evidence.

## Local fixtures and physical boundary

The local authoring browser blocks navigation, including localhost. Earlier local runs used `page.set_content()` and an explicitly labeled fixture storage adapter: 21 gameplay and 11 fidelity checks passed. Those fixture runs do not establish WebGPU, real-origin storage, service workers or offline reload. Real-origin GitHub Actions runs are recorded separately.

Physical iOS/Android touch/haptics, VoiceOver/TalkBack behavior, hardware-GPU performance, and color-managed comparison with a specified original Nokia panel remain unmeasured. LCD rise/decay constants, lens response, colors and artwork are reconstruction parameters. See [FIDELITY.md](FIDELITY.md).

## Repeat

```sh
npm test
npm run build
python -m pip install -r requirements-dev.txt
python -m playwright install --with-deps chromium
node tools/serve.mjs dist 8080
# Separate terminal:
python tests/browser.py
python tests/fidelity.py
python tests/hosted.py
# Linux virtual-display form:
# xvfb-run -a python tests/hosted.py --headed
# Additional hardware presentation validation:
# python tests/browser.py --headed --require-webgpu
```

Use `--fixture` for the first two Python suites only when navigation is restricted. The hosted suite intentionally has no fixture mode.

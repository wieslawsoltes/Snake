/** Fast regression guard, complementary to native WGSL compilation in hosted.py. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('embedded WGSL never uses the reserved target identifier', () => {
  const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const shaders = [...source.matchAll(/\/\* wgsl \*\/`([\s\S]*?)`/g)];
  assert.equal(shaders.length, 3);
  for (const [, shader] of shaders) assert.doesNotMatch(shader, /\btarget\b/);
});

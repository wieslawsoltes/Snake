/** Verify the deployed commit and every published byte against its build manifest. */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
const base = new URL(process.argv[2] || 'https://wieslawsoltes.github.io/Snake/');
const expected = process.argv[3];
if (!expected || !/^[0-9a-f]{40}$/.test(expected)) throw new Error('Pass the expected 40-character source commit SHA.');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function get(path) {
  const url = new URL(path, base); url.searchParams.set('verify', Date.now().toString());
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
let manifest, lastError;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    manifest = JSON.parse(new TextDecoder().decode(await get('asset-manifest.json')));
    if (manifest.source_commit === expected) break;
    throw new Error(`Waiting for ${expected}, currently ${manifest.source_commit}`);
  } catch (error) { lastError = error; }
  await sleep(5000);
}
if (!manifest || manifest.source_commit !== expected) throw lastError || new Error('Deployed commit mismatch.');
const checks = [];
for (const file of manifest.files) {
  const bytes = await get(file.path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== file.sha256 || bytes.length !== file.bytes) throw new Error(`Published integrity mismatch: ${file.path}`);
  checks.push({ path: file.path, bytes: bytes.length, sha256 });
  console.log(`PASS ${file.path} (${bytes.length} bytes)`);
}
await mkdir('docs', { recursive: true });
await writeFile('docs/published-test-results.json', JSON.stringify({ url: base.href, source_commit: expected, verified_at: new Date().toISOString(), passed: checks.length, files: checks }, null, 2) + '\n');
console.log(`Published commit ${expected}: all ${checks.length} files verified at ${base.href}`);

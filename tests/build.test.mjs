import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('static build excludes Pages control metadata and content-versions the offline cache', async () => {
  const source=fileURLToPath(new URL('..',import.meta.url));
  const root=await mkdtemp(join(tmpdir(),'snake-build-'));
  try {
    for(const name of ['index.html','styles.css','handset.css','manifest.webmanifest','sw.js','assets','src','package.json'])
      await cp(join(source,name),join(root,name),{recursive:true});
    await mkdir(join(root,'tools'));
    await cp(join(source,'tools/build.mjs'),join(root,'tools/build.mjs'));
    const build=()=>execFileSync(process.execPath,[join(root,'tools/build.mjs')],{env:{...process.env,SOURCE_COMMIT:'1'.repeat(40)},stdio:'pipe',timeout:10000});
    build();
    const manifest=JSON.parse(await readFile(join(root,'dist/asset-manifest.json'),'utf8'));
    assert(manifest.files.length>=17);
    assert(!manifest.files.some(f=>f.path.split('/').some(p=>p.startsWith('.'))));
    for(const file of manifest.files){
      const bytes=await readFile(join(root,'dist',file.path));
      assert.equal(bytes.length,file.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
    }
    const original=await readFile(join(root,'dist/sw.js'),'utf8');
    assert.match(original,/snake3310-shell-v2-[a-f0-9]{16}/);
    build();
    assert.equal(await readFile(join(root,'dist/sw.js'),'utf8'),original);
    await appendFile(join(root,'styles.css'),'\n/* changed runtime asset */\n');
    build();
    assert.notEqual(await readFile(join(root,'dist/sw.js'),'utf8'),original);
  } finally { await rm(root,{recursive:true,force:true}); }
});

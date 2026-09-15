import { mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url)),dist=resolve(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const path of ['index.html','styles.css','handset.css','manifest.webmanifest','sw.js','assets','src'])await cp(resolve(root,path),resolve(dist,path),{recursive:true});
let code='';
for(const module of ['engine','artwork','font','lcd','optics','renderer','storage','audio','app']){
  let part=await readFile(resolve(root,`src/${module}.js`),'utf8');
  part=part.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
  if(module==='renderer')part='const W=LCD_WIDTH,H=LCD_HEIGHT;\n'+part;
  code+=`\n// ---- ${module}.js ----\n${part}\n`;
}
let html=await readFile(resolve(root,'index.html'),'utf8');
const css=await readFile(resolve(root,'styles.css'),'utf8');
const handsetCss=await readFile(resolve(root,'handset.css'),'utf8');
const icon=await readFile(resolve(root,'assets/icon.svg'),'utf8');
html=html.replace('<link rel="stylesheet" href="./styles.css">',`<style>\n${css}\n</style>`)
  .replace('<link rel="stylesheet" href="./handset.css">',`<style>\n${handsetCss}\n</style>`)
  .replace(/\s*<link rel="(?:apple-touch-icon|manifest)"[^>]*>/g,'')
  .replace('<link rel="icon" href="./assets/icon.svg" type="image/svg+xml">',`<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(icon)}" type="image/svg+xml">`)
  .replace('<script type="module" src="./src/app.js"></script>',`<script>\n(()=>{'use strict';\n${code.replace(/<\/script/gi,'<\\/script')}\n})();\n</script>`)
  .replace("if('serviceWorker'in navigator&&isSecureContext", "if(false&&'serviceWorker'in navigator&&isSecureContext");
await writeFile(resolve(root,'snake-3310.html'),html);
await writeFile(resolve(dist,'.nojekyll'),'');
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
let commit=process.env.SOURCE_COMMIT||'uncommitted-local';
if(commit==='uncommitted-local'){try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}}
await writeFile(resolve(dist,'build-info.json'),JSON.stringify({version:pkg.version,source_commit:commit,build_time:new Date().toISOString()},null,2)+'\n');
const files=[];
async function fingerprint(dir,prefix=''){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=prefix+entry.name;
  if(entry.isDirectory())await fingerprint(resolve(dir,entry.name),path+'/');
  else{const data=await readFile(resolve(dir,entry.name));files.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
 }
}
await fingerprint(dist);
await writeFile(resolve(dist,'asset-manifest.json'),JSON.stringify({version:pkg.version,source_commit:commit,files},null,2)+'\n');
console.log(`Built deployable dist/ and standalone snake-3310.html (${(Buffer.byteLength(html)/1024).toFixed(1)} KiB)`);

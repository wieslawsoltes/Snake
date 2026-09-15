"""Create a portable source/build/test ZIP. Never includes Git internals or dependencies."""
from pathlib import Path
import argparse, hashlib, zipfile
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output',default=str(ROOT.parent/'Snake-3310-Physical-LCD-Full-Source.zip'));a=p.parse_args()
target=Path(a.output).resolve();target.parent.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(ROOT.rglob('*')):
        rel=f.relative_to(ROOT)
        if not f.is_file() or f.resolve()==target or any(part in {'.git','node_modules','__pycache__','.source-import'} for part in rel.parts):continue
        if f.suffix in {'.pyc','.log','.zip'} or f.name=='.DS_Store':continue
        z.write(f,Path('Snake-3310')/rel)
print(f'{target} ({target.stat().st_size:,} bytes)')
print('SHA256 '+hashlib.sha256(target.read_bytes()).hexdigest())

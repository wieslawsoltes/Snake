"""Real-origin integration: WGSL/CPU image parity, device loss and offline reload.

No fixture mode: these checks must execute through HTTP(S) in a real browser.
SwiftShader runs the actual WebGPU API/WGSL, but is not a hardware benchmark.
"""
from pathlib import Path
import argparse, io, json, os, shutil
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:8080/')
parser.add_argument('--browser', default=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
args = parser.parse_args()
OUT = ROOT / 'docs' / 'gpu'; OUT.mkdir(parents=True, exist_ok=True)
results = []
def passed(name, detail=None):
    results.append({'name': name, 'passed': True, 'detail': detail}); print('PASS', name, detail or '')

with sync_playwright() as p:
    options = {'headless': True, 'args': ['--no-sandbox', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface']}
    if args.browser: options['executable_path'] = args.browser
    browser = p.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=1)
    page.goto(args.url + '?debug&nosw', wait_until='networkidle')
    page.wait_for_function('!!window.__snake')
    assert page.evaluate('window.__snake.inspect().renderer') == 'WebGPU', page.evaluate('window.__snake.inspect().reason')
    passed('Actual WGSL compute and fragment pipelines initialize over a secure origin')
    info = page.evaluate('async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info?.vendor,architecture:a.info?.architecture,device:a.info?.device,description:a.info?.description};}')
    page.evaluate('''async()=>{
      const {LCDRenderer}=await import('./src/renderer.js');
      window.opticsTest={};
      for(const [name,left] of [['gpu',20],['cpu',400]]){
        const canvas=document.createElement('canvas'); canvas.id='parity-'+name;
        canvas.style.cssText=`position:fixed;left:${left}px;top:20px;width:336px;height:246px;z-index:999999;`;
        document.body.append(canvas);
        const renderer=await new LCDRenderer(canvas).init(name==='cpu');
        const pixels=new Uint32Array(84*48);
        for(let y=0;y<48;y++)for(let x=0;x<84;x++)pixels[y*84+x]=((x*17+y*29)%23<9 || x===y || y===47)?1:0;
        renderer.upload(pixels);window.opticsTest[name]=renderer;
      }
    }''')
    presets = [
        {'name':'daylight','ambient':1,'backlight':False,'angle':0},
        {'name':'backlit','ambient':.7,'backlight':True,'angle':0},
        {'name':'darkroom','ambient':.08,'backlight':True,'angle':0},
        {'name':'oblique','ambient':1,'backlight':False,'angle':35},
    ]
    for preset in presets:
        settings = {**preset,'ghosting':False,'contrast':.94,'grid':True,'reflection':True}
        page.evaluate('''async settings=>{
          for(const r of Object.values(window.opticsTest))r.draw(.1,settings);
          await window.opticsTest.gpu.backend.device.queue.onSubmittedWorkDone();
        }''',settings)
        images = []
        for backend in ['gpu','cpu']:
            image_bytes = page.locator('#parity-'+backend).screenshot()
            (OUT / (preset['name']+'-'+backend+'.png')).write_bytes(image_bytes)
            images.append(Image.open(io.BytesIO(image_bytes)).convert('RGB'))
        difference = ImageChops.difference(*images)
        mean = sum(ImageStat.Stat(difference).mean)/3
        maximum = max(v[1] for v in difference.getextrema())
        # Float32 shader quantization, noise-cell boundary rounding, and compositor
        # color conversion are allowed; gross projection/palette differences are not.
        assert mean < 2.0 and maximum <= 24, (preset['name'],mean,maximum)
        passed('WebGPU/Canvas optical projection agrees: '+preset['name'], {'mean_channel_error':mean,'max_channel_error':maximum})
    page.evaluate('window.opticsTest.gpu.backend.device.destroy()')
    page.wait_for_function('window.opticsTest.gpu.name==="Canvas 2D"')
    page.evaluate('window.opticsTest.gpu.draw(.1,{ghosting:false})')
    assert page.locator('#parity-gpu').is_visible()
    passed('Actual GPU device loss replaces the canvas and restores the CPU renderer')
    page.close()

    context = browser.new_context()
    offline = context.new_page()
    offline.goto(args.url+'?debug',wait_until='networkidle')
    offline.wait_for_function('!!window.__snake')
    offline.evaluate('async()=>{await navigator.serviceWorker.ready;}')
    offline.wait_for_function('!!navigator.serviceWorker.controller')
    cache_info=offline.evaluate('async()=>{const names=await caches.keys();const c=await caches.open(names.find(x=>x.startsWith("snake3310-shell-")));return {names,count:(await c.keys()).length};}')
    assert cache_info['count']>=17,cache_info
    passed('Versioned service worker installs and controls the hosted application',cache_info)
    context.set_offline(True)
    offline.reload(wait_until='domcontentloaded')
    offline.wait_for_function('!!window.__snake',timeout=20000)
    offline.keyboard.press('Enter')
    offline.wait_for_function('window.__snake.inspect().game?.ticks>=2')
    offline.keyboard.press('Space')
    passed('App-shell, module imports and gameplay work after an offline reload')
    context.set_offline(False)
    context.close();browser.close()
    report={'browser':'Chromium','adapter':info,'real_origin':True,'software_adapter':True,'passed':len(results),'results':results}
    (ROOT/'docs'/'hosted-test-results.json').write_text(json.dumps(report,indent=2))
    print(f'{len(results)} hosted checks passed')

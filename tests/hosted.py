"""Real-origin integration: native WGSL texture readback/CPU parity, loss, offline.
SwiftShader executes production compute/fragment shaders on a private texture.
This does not claim to validate hardware swap-chain presentation on the CI host.
"""
from pathlib import Path
import argparse, json, os, shutil
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--url', default='http://localhost:8080/')
parser.add_argument('--browser', default=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
parser.add_argument('--headed', action='store_true')
args = parser.parse_args()
OUT = ROOT / 'docs' / 'gpu'; OUT.mkdir(parents=True, exist_ok=True)
results = []
def passed(name, detail=None):
    results.append({'name': name, 'passed': True, 'detail': detail}); print('PASS', name, detail or '')

with sync_playwright() as p:
    options = {'headless': not args.headed, 'args': ['--no-sandbox','--disable-gpu-watchdog','--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}
    if args.browser: options['executable_path'] = args.browser
    browser = p.chromium.launch(**options)
    page = browser.new_page(viewport={'width': 1200, 'height': 900}, device_scale_factor=1)
    page.goto(args.url + '?debug&nosw&renderer=canvas', wait_until='networkidle')
    page.wait_for_function('!!window.__snake')
    info = page.evaluate('async()=>{const a=await navigator.gpu.requestAdapter();return {vendor:a.info?.vendor,architecture:a.info?.architecture,device:a.info?.device,description:a.info?.description};}')
    page.evaluate('''async()=>{
      const {LCDRenderer}=await import('./src/renderer.js');
      window.opticsTest={};
      for(const [name,left] of [['gpu',20],['cpu',400]]){
        const canvas=document.createElement('canvas'); canvas.id='parity-'+name;
        canvas.style.cssText=`position:fixed;left:${left}px;top:20px;width:336px;height:246px;z-index:999999;`;
        document.body.append(canvas);
        const renderer=await new LCDRenderer(canvas,()=>{},{readback:name==='gpu'}).init(name==='cpu');
        const pixels=new Uint32Array(84*48);
        for(let y=0;y<48;y++)for(let x=0;x<84;x++)pixels[y*84+x]=((x*17+y*29)%23<9 || x===y || y===47)?1:0;
        renderer.upload(pixels);window.opticsTest[name]=renderer;
      }
    }''')
    assert page.evaluate('window.opticsTest.gpu.name') == 'WebGPU', page.evaluate('window.opticsTest.gpu.reason')
    passed('Actual WGSL compute and fragment pipelines initialize over a secure origin')
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
            raw = page.evaluate('''async name=>{
              const r=window.opticsTest[name];
              if(name==='gpu'){const v=await r.backend.readPixels();return {width:v.width,height:v.height,rgba:Array.from(v.rgba)};}
              const c=r.canvas;return {width:c.width,height:c.height,rgba:Array.from(r.backend.ctx.getImageData(0,0,c.width,c.height).data)};
            }''', backend)
            image = Image.frombytes('RGBA',(raw['width'],raw['height']),bytes(raw['rgba'])).convert('RGB')
            image.save(OUT / (preset['name']+'-'+backend+'.png'))
            images.append(image)
        difference = ImageChops.difference(*images)
        mean = sum(ImageStat.Stat(difference).mean)/3
        maximum = max(v[1] for v in difference.getextrema())
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
    offline.goto(args.url+'?debug&renderer=canvas',wait_until='networkidle')
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
    report={'browser':'Chromium','adapter':info,'real_origin':True,'software_adapter':True,'gpu_validation':'native compute + fragment texture readback; swap-chain presentation not covered','passed':len(results),'results':results}
    (ROOT/'docs'/'hosted-test-results.json').write_text(json.dumps(report,indent=2))
    print(f'{len(results)} hosted checks passed')

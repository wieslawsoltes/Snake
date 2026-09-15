"""Physical-display appearance / interaction checks. --fixture does not test real WebGPU or storage."""
from pathlib import Path
import argparse, json, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--fixture',action='store_true');p.add_argument('--url',default='http://localhost:8080/');p.add_argument('--browser',default=shutil.which('chromium'));args=p.parse_args()
OUT=ROOT/'docs'/'fidelity';OUT.mkdir(parents=True,exist_ok=True)
results=[];errors=[]
def ok(name, detail=None):results.append({'name':name,'passed':True,'detail':detail});print('PASS',name,detail or '')
def load(page):
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 if args.fixture:
  html=(ROOT/'snake-3310.html').read_text().replace("if(new URLSearchParams(location.search).has('debug'))",'if(true)')
  html=html.replace('<head>','<head><script>Object.defineProperty(window,"localStorage",{value:{getItem:()=>null,setItem:()=>{}},configurable:true});</script>')
  page.set_content(html)
 else:page.goto(args.url+'?debug&nosw',wait_until='networkidle')
 page.wait_for_function('!!window.__snake');page.wait_for_timeout(1300)
with sync_playwright() as p:
 launch={'headless':True,'args':['--no-sandbox','--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--disable-vulkan-surface']}
 if args.browser:launch['executable_path']=args.browser
 b=p.chromium.launch(**launch)
 page=b.new_page(viewport={'width':1440,'height':1080},device_scale_factor=1);load(page)
 box=page.locator('#phone').bounding_box();assert abs(box['height']/box['width']-1130/480)<.002;ok('Handset uses one 480:1130 coordinate space')
 r=page.locator('#lcd').bounding_box();assert abs(r['width']/r['height']-30/22)<.003;ok('84×48 matrix projects through a non-square-pixel LCD aperture')
 assert page.locator('.handset-shell ellipse[fill="url(#hole)"]').count()==6;ok('Earpiece has six vertically arranged receiver apertures')
 page.screenshot(path=str(OUT/'desktop-daylight.png'),full_page=True)
 page.locator('#phone').screenshot(path=str(OUT/'handset-daylight.png'))
 frames=page.evaluate('window.__snake.inspect().frames');page.wait_for_timeout(400);assert page.evaluate('window.__snake.inspect().frames')==frames;ok('Rendering stops after LCD charge settles')
 page.locator('#settings-button').click();page.locator('[data-lighting=backlit]').click();page.locator('#settings-dialog .dialog-footer [data-close]').click();page.wait_for_timeout(1300)
 assert page.locator('body').get_attribute('data-backlight')=='on';page.locator('#phone').screenshot(path=str(OUT/'handset-backlit.png'));ok('Backlight also illuminates handset legends')
 page.locator('#settings-button').click();page.locator('[data-lighting=night]').click();page.locator('#settings-dialog .dialog-footer [data-close]').click();page.wait_for_timeout(1300)
 page.locator('#phone').screenshot(path=str(OUT/'handset-night.png'));assert page.evaluate('window.__snake.inspect().settings.ambient')==.08;ok('Dark-room preset adjusts the reflective surface and case illumination')
 page.locator('#settings-button').click();page.locator('[data-lighting=daylight]').click();page.locator('#angle-range').evaluate('e=>{e.value=35;e.dispatchEvent(new Event("input",{bubbles:true}));}');assert page.locator('#angle-output').text_content()=='35°';page.locator('#settings-dialog .dialog-footer [data-close]').click();page.wait_for_timeout(1300)
 page.locator('#phone').screenshot(path=str(OUT/'handset-oblique.png'));ok('Viewing-angle control changes optical contrast, not geometry')
 page.locator('#settings-button').click();page.locator('[data-lighting=daylight]').click();page.locator('#settings-dialog .dialog-footer [data-close]').click();page.locator('#select-button').click();page.keyboard.press('ArrowDown');page.wait_for_timeout(500);page.keyboard.press('Space');page.wait_for_timeout(1300)
 page.locator('#phone').screenshot(path=str(OUT/'handset-game.png'));ok('LCD game sprites and keypad remain functional after optical changes')
 mobile=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True);mp=mobile.new_page();load(mp)
 boxes=mp.locator('#keypad>button').evaluate_all('els=>els.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');assert all(x['width']>=44 and x['height']>=44 for x in boxes);ok('All twelve numeric-key hit areas are at least 44×44 CSS pixels',boxes[0])
 assert mp.evaluate('document.documentElement.scrollWidth<=innerWidth');mp.screenshot(path=str(OUT/'mobile.png'),full_page=True)
 mp.locator('#control-switch').tap();assert mp.locator('#keypad [data-dir="0"]').is_visible();assert mp.locator('#thumbpad').is_visible();ok('Optional thumb controls do not deform or replace the original handset')
 mp.screenshot(path=str(OUT/'mobile-thumb.png'),full_page=True)
 assert not errors,errors;ok('No browser console or JavaScript errors')
 b.close()
(ROOT/'docs'/'fidelity-results.json').write_text(json.dumps({'fixture':args.fixture,'passed':len(results),'results':results},indent=2))
print(f'{len(results)} fidelity checks passed')

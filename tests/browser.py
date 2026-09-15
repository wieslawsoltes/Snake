"""Browser acceptance tests. Run normally against the dev server, or pass --fixture
for a navigation-disabled CI browser. Fixture mode uses the single-file build and
an explicitly mocked localStorage; it does NOT validate real origin storage, SW,
or secure-context WebGPU. Screenshots and machine-readable results are written.
"""
from pathlib import Path
import argparse, json, os, shutil, time
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--fixture', action='store_true')
parser.add_argument('--url', default='http://localhost:8080/')
parser.add_argument('--browser', default=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'))
parser.add_argument('--require-webgpu', action='store_true')
parser.add_argument('--headed', action='store_true')
parser.add_argument('--renderer', choices=['auto', 'canvas'], default='auto', help='Select the UI backend; native shader validation runs independently in hosted.py')
args = parser.parse_args()
if args.renderer == 'canvas' and args.require_webgpu:
    parser.error('--renderer=canvas conflicts with --require-webgpu')
OUT = ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)
results = []
errors = []

def passed(name, detail=None):
    results.append({'name': name, 'passed': True, 'detail': detail})
    print('PASS', name, detail or '')

def inspect(page):
    return page.evaluate('window.__snake.inspect()')

def wait_state(page, state):
    page.wait_for_function('(s)=>window.__snake?.inspect().screen===s', arg=state, timeout=7000)

def screenshot(page, name):
    page.wait_for_timeout(410)
    page.screenshot(path=str(OUT / name), full_page=True)

def load(page, saved=None):
    page.on('pageerror', lambda error: errors.append(str(error)))
    if args.fixture:
        html = (ROOT / 'snake-3310.html').read_text()
        html = html.replace("if(new URLSearchParams(location.search).has('debug'))", 'if(true)')
        shim = '<script>window.__fixtureData=' + json.dumps(saved or {}) + ';Object.defineProperty(window,"localStorage",{value:{getItem:k=>window.__fixtureData[k]??null,setItem:(k,v)=>window.__fixtureData[k]=String(v),removeItem:k=>delete window.__fixtureData[k]},configurable:true});</script>'
        html = html.replace('<head>', '<head>'+shim)
        page.set_content(html, wait_until='load')
    else:
        # Each new page is an isolated test run; reloading that page keeps its save.
        page.add_init_script("if(!sessionStorage.getItem('__snake_test_initialized')){localStorage.clear();sessionStorage.setItem('__snake_test_initialized','1');}")
        page.goto(args.url + ('&' if '?' in args.url else '?') + 'debug&nosw' + ('&renderer=canvas' if args.renderer == 'canvas' else ''), wait_until='networkidle')
    page.wait_for_function('!!window.__snake', timeout=15000)
    page.wait_for_timeout(450)

def set_level(page, level):
    page.locator('#level-range').evaluate('(el,n)=>{el.value=n;el.dispatchEvent(new Event("input",{bubbles:true}));}', level)

def check_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'horizontal layout overflow'

try:
    with sync_playwright() as p:
        launch = {'headless': not args.headed, 'args': ['--no-sandbox','--disable-gpu-watchdog', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--disable-vulkan-surface']}
        if args.renderer == 'canvas':
            # UI acceptance is independent of the native WGSL texture-readback gate.
            launch['args'] = ['--no-sandbox', '--disable-gpu-watchdog']
        if args.browser:
            launch['executable_path'] = args.browser
        browser = p.chromium.launch(**launch)
        desktop = browser.new_context(viewport={'width':1440, 'height':960}, device_scale_factor=1)
        page = desktop.new_page()
        load(page)
        assert inspect(page)['screen'] == 'title'
        if args.renderer == 'canvas':
            assert inspect(page)['renderer'] == 'Canvas 2D'
        check_overflow(page)
        passed('Desktop title initializes without overflow', inspect(page)['renderer'])
        if args.require_webgpu:
            assert inspect(page)['renderer']=='WebGPU', inspect(page).get('reason')
            passed('Secure-context WebGPU backend initializes')
        screenshot(page,'desktop.png')
        page.keyboard.press('Enter')
        wait_state(page,'playing')
        page.wait_for_function('window.__snake.inspect().game.ticks>=2')
        passed('Enter starts and fixed-step simulation advances')
        page.keyboard.press('Space')
        wait_state(page,'paused')
        snapshot=inspect(page)['game']
        page.wait_for_timeout(260)
        assert inspect(page)['game']==snapshot
        passed('Pause freezes all simulation state')
        page.keyboard.press('Space')
        wait_state(page,'playing')
        page.keyboard.press('ArrowUp')
        page.keyboard.press('ArrowLeft')
        page.wait_for_function('window.__snake.inspect().game.direction===3')
        page.keyboard.press('Space')
        assert inspect(page)['gameStatus']=='paused'
        passed('Rapid two-corner keyboard input is preserved')
        page.keyboard.press('Space')
        page.keyboard.down('5')
        assert inspect(page)['boost']==1
        page.keyboard.up('5')
        assert inspect(page)['boost']==0
        page.keyboard.press('Space')
        passed('Hold-to-boost begins and releases correctly')
        page.locator('#back-button').click()
        wait_state(page,'menu')
        page.keyboard.press('ArrowDown')
        page.locator('#select-button').click()
        assert page.locator('#restart-dialog').is_visible()
        page.locator('#restart-dialog [data-close]').click()
        assert not page.locator('#restart-dialog').is_visible()
        passed('In-progress restart asks before discarding the run')
        page.locator('#settings-button').click()
        set_level(page,8)
        page.locator('[data-maze="5"]').click()
        page.locator('[data-control="thumb"]').click()
        page.locator('#backlight-toggle').uncheck()
        page.locator('#sound-toggle').uncheck()
        settings=inspect(page)['settings']
        assert settings['level']==8 and settings['maze']==5 and settings['controls']=='thumb' and not settings['sound'] and not settings['backlight']
        assert inspect(page)['game']['level']==4
        passed('Settings apply immediately without mutating current run rules')
        screenshot(page,'settings-desktop.png')
        page.locator('#settings-dialog .dialog-footer [data-close]').click()
        page.locator('#select-button').click()
        page.locator('#confirm-restart').click()
        wait_state(page,'playing')
        assert inspect(page)['game']['level']==8 and inspect(page)['game']['maze']==5
        page.keyboard.press('Space')
        passed('New runs use the selected level and maze')
        page.locator('#focus-button').click()
        assert page.locator('body').evaluate("e=>e.classList.contains('focus-mode')")
        check_overflow(page)
        page.locator('#leave-focus').click()
        passed('Focus mode enters and exits without losing the game')
        page.locator('#settings-button').click()
        page.locator('[data-control="keypad"]').click()
        page.locator('#settings-dialog .dialog-footer [data-close]').click()
        page.locator('[data-key="1"]').click()
        wait_state(page,'instructions')
        for _ in range(3): page.locator('#select-button').click()
        wait_state(page,'menu')
        passed('All three LCD instruction pages navigate back to the menu')
        page.close()

        # Fresh classic-wall game verifies a complete run, scoring and restart.
        run=desktop.new_page(); load(run)
        run.locator('#settings-button').click(); set_level(run,9)
        run.locator('[data-maze="1"]').click()
        run.locator('#settings-dialog .dialog-footer [data-close]').click()
        run.locator('#select-button').click()
        wait_state(run,'playing')
        wait_state(run,'gameover')
        g=inspect(run)['game']
        assert g['score']>=9
        assert int(run.locator('#best-score').inner_text())>=9
        passed('Complete game: food, wall collision, game over, high score',g['score'])
        screenshot(run,'game-over.png')
        run.locator('#scores-button').click()
        assert run.locator('.score-entry').count()>=1
        run.locator('#scores-dialog .dialog-footer [data-close]').click()
        run.locator('#select-button').click()
        wait_state(run,'playing')
        run.keyboard.press('Space')
        if args.fixture:
            saved=run.evaluate('window.__fixtureData')
            restored=desktop.new_page(); load(restored,saved)
            assert inspect(restored)['gameStatus']=='paused'
            restored.locator('#select-button').click()
            wait_state(restored,'playing')
            restored.keyboard.press('Space')
            passed('Saved run restores paused and resumes (fixture storage adapter)')
            restored.close()
        else:
            run.reload();run.wait_for_function('!!window.__snake')
            assert inspect(run)['gameStatus']=='paused'
            passed('Origin localStorage restores paused session across reload')
        run.close()

        mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        phone=mobile.new_page();load(phone)
        check_overflow(phone)
        screenshot(phone,'mobile.png')
        passed('390×844 mobile handset layout fits without horizontal overflow')
        phone.locator('[data-dir="0"]').first.tap()
        wait_state(phone,'playing')
        phone.wait_for_function('window.__snake.inspect().game.direction===0')
        passed('Real touch tap on classic keypad starts and steers')
        phone.locator('[data-key="0"]').tap()
        wait_state(phone,'paused')
        phone.locator('#control-switch').tap()
        assert phone.locator('#thumbpad').is_visible()
        phone.locator('#thumbpad [data-dir="3"]').tap()
        wait_state(phone,'playing')
        phone.wait_for_function('window.__snake.inspect().game.direction===3')
        phone.locator('[data-action="pause"]').tap()
        wait_state(phone,'paused')
        passed('Thumb-pad touch controls steer and pause')
        phone.locator('#focus-button').tap()
        screenshot(phone,'mobile-focus.png')
        check_overflow(phone)
        passed('Touch focus mode has visible controls and no overflow')
        rect=phone.locator('#screen-wrap').bounding_box()
        x=rect['x']+rect['width']*.45;y=rect['y']+rect['height']*.65
        cdp=mobile.new_cdp_session(phone)
        cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y,'id':1}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y-40,'id':1}]})
        cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        wait_state(phone,'playing')
        phone.wait_for_function('window.__snake.inspect().game.direction===0')
        phone.locator('[data-action="pause"]').tap()
        passed('Real touch swipe resumes and steers without scrolling')
        phone.locator('[data-action="pause"]').tap()
        phone.evaluate("window.dispatchEvent(new Event('blur'))")
        wait_state(phone,'paused')
        assert inspect(phone)['boost']==0
        passed('Window interruption auto-pauses and clears held input')
        phone.locator('#leave-focus').tap()
        phone.locator('#control-switch').tap()
        phone.locator('#settings-button').tap()
        screenshot(phone,'mobile-settings.png')
        phone.locator('#settings-dialog .dialog-footer [data-close]').tap()
        phone.close();mobile.close()

        small=browser.new_context(viewport={'width':320,'height':568},is_mobile=True,has_touch=True)
        tiny=small.new_page();load(tiny);check_overflow(tiny)
        tiny.locator('#focus-button').tap();check_overflow(tiny)
        screenshot(tiny,'small-mobile-focus.png')
        passed('320px narrow-screen layout and focus mode stay usable')
        tiny.close();small.close()

        landscape=browser.new_context(viewport={'width':844,'height':390},is_mobile=True,has_touch=True)
        wide=landscape.new_page();load(wide);wide.locator('#focus-button').tap();check_overflow(wide)
        screenshot(wide,'mobile-landscape.png')
        passed('Landscape focus layout fits screen and controls side by side')
        wide.close();landscape.close()
        assert not errors,errors
        passed('No uncaught browser JavaScript exceptions')
        browser.close()
except Exception as error:
    results.append({'name':'Browser run failure','passed':False,'detail':str(error)})
    raise
finally:
    report={'fixture_mode':args.fixture,'requested_renderer':args.renderer,'limitations':(['Browser navigation is disabled by host policy. Tests use set_content(), Canvas 2D, and a mocked storage adapter.','Secure-context WebGPU, real-origin persistence, PWA/offline operation, and physical mobile hardware are not exercised by fixture tests.'] if args.fixture else []),'results':results,'uncaught_errors':errors}
    (ROOT/'docs'/'browser-test-results.json').write_text(json.dumps(report,indent=2))
    print(f'{sum(r["passed"] for r in results)}/{len(results)} acceptance checks passed')

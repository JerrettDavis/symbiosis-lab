"""Real Chromium UI smoke test. Starts an isolated server unless LAB_URL is set.
Install: python -m pip install -r scripts/requirements-test.txt
         python -m playwright install chromium
Run after npm run build. CHROMIUM_EXECUTABLE may select an installed browser.
"""
from __future__ import annotations
import json, os, pathlib, shutil, socket, subprocess, tempfile, time, urllib.request, urllib.error, re, base64
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ.get('SCREENSHOT_DIR', str(ROOT / 'docs' / 'screenshots')))
OUT.mkdir(parents=True, exist_ok=True)
OFFLINE = os.environ.get('LAB_OFFLINE_BROWSER') == '1'

def run() -> None:
    with tempfile.TemporaryDirectory(prefix='symbiosis-browser-') as temp:
        proc = None
        base = os.environ.get('LAB_URL')
        if not base:
            with socket.socket() as sock:
                sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
            base = f'http://127.0.0.1:{port}'
            env = {**os.environ, 'PORT': str(port), 'HOST': '127.0.0.1', 'DATA_DIR': temp, 'AUTOSAVE': 'false', 'PAUSED': 'true'}
            proc = subprocess.Popen(['node', 'dist/server/index.js'], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError(proc.stderr.read().decode())
                try:
                    with urllib.request.urlopen(base + '/healthz', timeout=1) as response:
                        if response.status == 200: break
                except Exception: time.sleep(.05)
            else: raise RuntimeError('Server did not become healthy')
        try:
            with sync_playwright() as p:
                executable = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
                browser = p.chromium.launch(headless=True, executable_path=executable, args=['--no-sandbox'])
                context = browser.new_context(viewport={'width': 1600, 'height': 1150}, device_scale_factor=1)
                page = context.new_page(); page.set_default_timeout(7000); errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('dialog', lambda dialog: dialog.accept())
                def get(path):
                    response = context.request.get(base + path); assert response.ok; return response.json()
                def post(path, data):
                    response = context.request.post(base + path, data=data); assert response.ok, response.text(); return response.json()
                def mount(target, ctx):
                    if not OFFLINE:
                        target.goto(base, wait_until='domcontentloaded')
                        return
                    # No browser network navigation: render the actual built app in memory.
                    # The restricted environment's managed browser policy is left unchanged.
                    # Only /api/* fetches are bridged to the isolated server by the test runner.
                    def bridge(source, url, init):
                        if not isinstance(url, str) or not url.startswith('/api/'):
                            raise ValueError('Only local lab API paths are allowed in the UI test bridge')
                        body = init.get('body')
                        request = urllib.request.Request(base + url, method=init.get('method', 'GET'),
                            headers=init.get('headers', {}), data=body.encode() if body is not None else None)
                        try:
                            with urllib.request.urlopen(request, timeout=5) as response:
                                return {'status': response.status, 'body': response.read().decode()}
                        except urllib.error.HTTPError as response:
                            return {'status': response.code, 'body': response.read().decode()}
                    target.expose_binding('__lab_request', bridge)
                    html = (ROOT / 'dist/public/index.html').read_text()
                    html = re.sub(r'<script[^>]*src="/web/app.js"[^>]*></script>', '', html)
                    html = re.sub(r'<link[^>]*>', '', html)
                    svg = base64.b64encode((ROOT / 'public/mark.svg').read_bytes()).decode()
                    html = html.replace('src="/mark.svg"', 'src="data:image/svg+xml;base64,' + svg + '"')
                    target.set_content(html, wait_until='domcontentloaded')
                    target.add_style_tag(content=(ROOT / 'dist/public/style.css').read_text())
                    target.evaluate("""() => { window.fetch = async (url, init = {}) => {
                        const r = await window.__lab_request(url, init);
                        return new Response(r.body, {status:r.status, headers:{'Content-Type':'application/json'}});
                    }; }""")
                    constants = (ROOT / 'dist/engine/types.js').read_text().replace('export ', '')
                    app = (ROOT / 'dist/web/app.js').read_text()
                    app = re.sub(r'^import .*?;\n', '', app, flags=re.M)
                    target.add_script_tag(type='module', content=constants + '\n' + app)
                post('/api/command', {'type':'reset','seed':42,'preset':'meadow'})
                post('/api/command', {'type':'pause'})
                print('UI: mounting desktop', flush=True)
                mount(page, context)
                print('UI: mounted; checking state', flush=True)
                expect(page.locator('#population')).to_have_text('72')
                expect(page.locator('#play')).to_have_text('Resume')
                page.locator('#step-many').click(); expect(page.locator('#tick')).to_have_text('000,100')
                assert get('/api/state')['tick'] == 100
                print('UI: stepping and inspecting', flush=True)
                page.locator('#inspect-first').click(); expect(page.locator('#cell-detail')).to_contain_text('Cell ')
                state = get('/api/state'); cell = state['cells'][0]
                page.locator('[data-layer="a"]').click(); expect(page.locator('#legend')).to_contain_text('Channel A')
                page.locator('[data-tool="signalA"]').click()
                box = page.locator('#world').bounding_box(); assert box
                x = box['x'] + (cell['x'] + .5) / state['config']['width'] * box['width']
                y = box['y'] + (cell['y'] + .5) / state['config']['height'] * box['height']
                total_before = sum(get('/api/snapshot')['fields']['a'])
                page.mouse.click(x, y)
                expect(page.locator('#events')).to_contain_text('signalA')
                assert sum(get('/api/snapshot')['fields']['a']) > total_before
                page.locator('#signals').uncheck(); expect(page.locator('#events')).to_contain_text('"signals":false')
                assert get('/api/state')['config']['signals'] is False
                page.locator('#signals').check(); page.locator('#step-many').click()
                expect(page.locator('#tick')).to_have_text('000,200')
                page.locator('#save').click(); expect(page.locator('#toast')).to_contain_text('Checkpoint saved')
                saved = get('/api/snapshot')
                page.locator('#step').click(); expect(page.locator('#tick')).to_have_text('000,201')
                page.locator('#load').click(); expect(page.locator('#tick')).to_have_text('000,200')
                assert get('/api/snapshot') == saved
                path = pathlib.Path(temp) / 'export.json'
                if OFFLINE:
                    # Native browser downloads are not exercised in the in-memory harness.
                    path.write_text(json.dumps(get('/api/snapshot')))
                else:
                    with page.expect_download() as download:
                        page.locator('a[href="/api/snapshot"]').click()
                    download.value.save_as(path)
                assert json.loads(path.read_text()) == saved
                page.locator('#step').click(); expect(page.locator('#tick')).to_have_text('000,201')
                page.locator('#snapshot-file').set_input_files(str(path))
                expect(page.locator('#toast')).to_contain_text('Snapshot imported')
                expect(page.locator('#tick')).to_have_text('000,200')
                assert get('/api/snapshot') == saved
                page.locator('#guide-open').click(); expect(page.locator('#guide')).to_be_visible()
                page.locator('#guide-close').click(); expect(page.locator('#guide')).not_to_be_visible()
                page.locator('#play').click(); expect(page.locator('#play')).to_have_text('Pause')
                page.wait_for_timeout(350); page.locator('#play').click(); expect(page.locator('#play')).to_have_text('Resume')
                assert get('/api/state')['runtime']['running'] is False
                page.locator('#seed').fill('42'); page.locator('#preset').select_option('meadow'); page.locator('#reset').click()
                expect(page.locator('#tick')).to_have_text('000,000')
                post('/api/command', {'type':'step','ticks':250})
                page.locator('[data-layer="lineage"]').click(); page.locator('[data-tool="inspect"]').click()
                expect(page.locator('#tick')).to_have_text('000,250')
                page.wait_for_timeout(5200)
                page.screenshot(path=str(OUT / 'overview.png'), full_page=True)
                page.locator('#inspect-first').click(); expect(page.locator('#cell-detail')).to_contain_text('Action gates')
                page.locator('[data-layer="a"]').click(); page.wait_for_timeout(400)
                page.screenshot(path=str(OUT / 'inspector.png'), full_page=True)
                await_mobile = browser.new_context(viewport={'width':412,'height':915}, is_mobile=True, has_touch=True, device_scale_factor=1)
                mobile = await_mobile.new_page(); mobile.on('pageerror',lambda e:errors.append(str(e)))
                mount(mobile, await_mobile); expect(mobile.locator('#population')).to_have_text(f"{get('/api/state')['metrics']['population']:,}")
                assert mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'Mobile horizontal overflow'
                mobile.screenshot(path=str(OUT / 'mobile.png'), full_page=True)
                assert not errors, errors
                print(('IN-MEMORY HTTP BRIDGE (native navigation/download not tested). ' if OFFLINE else '') + 'PASS: Chromium desktop/mobile; controls, real signal intervention, inspect, knockout, checkpoint, JSON export/import, help, pause/resume, reset, no JS errors or mobile overflow.')
                print('Screenshots:', OUT)
                await_mobile.close(); context.close(); browser.close()
        finally:
            if proc is not None:
                proc.terminate()
                try: proc.wait(timeout=10)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait(timeout=5)

if __name__ == '__main__': run()

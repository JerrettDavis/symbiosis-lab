"""Exercise the real static Pages artifact at a project subpath, or PAGES_URL."""
import functools
import http.server
import json
import os
import pathlib
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect

ROOT = pathlib.Path(__file__).resolve().parents[1]


def exercise(base):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1600, 'height': 1150})
        page = context.new_page()
        page.set_default_timeout(15000)
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.on('dialog', lambda dialog: dialog.accept())
        page.goto(base, wait_until='networkidle')
        expect(page.locator('#connection')).to_have_text('Running')
        expect(page.locator('#runtime-note')).to_contain_text('Runs in your browser')
        page.locator('#play').click()
        expect(page.locator('#play')).to_have_text('Resume')
        page.locator('#reset').click()
        expect(page.locator('#tick')).to_have_text('000,000')
        expect(page.locator('#population')).to_have_text('72')

        def snapshot():
            with page.expect_download() as download:
                page.locator('#export').click()
            return json.loads(pathlib.Path(download.value.path()).read_text())

        # Once loaded, simulation and checkpoint controls need no server or network.
        context.set_offline(True)
        page.locator('#step-many').click()
        expect(page.locator('#tick')).to_have_text('000,100')
        page.locator('#inspect-first').click()
        expect(page.locator('#cell-detail')).to_contain_text('Cell ')
        for layer in ['energy', 'food', 'a', 'b', 'waste', 'lineage']:
            page.locator(f'[data-layer="{layer}"]').click()
            expect(page.locator(f'[data-layer="{layer}"]')).to_have_class('active')
        page.locator('#signals').uncheck()
        expect(page.locator('#events')).to_contain_text('"signals":false')
        for tool in ['food', 'damage', 'toxin', 'erase', 'wall', 'clear', 'signalA', 'signalB']:
            page.locator(f'[data-tool="{tool}"]').click()
            page.locator('#world').click(position={'x': 40, 'y': 40})
            expect(page.locator('#events')).to_contain_text(tool)
        saved = snapshot()
        page.locator('#save').click()
        expect(page.locator('#toast')).to_have_text('Checkpoint saved.')
        page.locator('#step-many').click()
        expect(page.locator('#tick')).to_have_text('000,200')
        future = snapshot()
        page.locator('#load').click()
        expect(page.locator('#tick')).to_have_text('000,100')
        assert snapshot() == saved
        page.locator('#step-many').click()
        expect(page.locator('#tick')).to_have_text('000,200')
        assert snapshot() == future, 'Checkpoint replay must be exact'
        page.locator('#snapshot-file').set_input_files({'name': 'world.json', 'mimeType': 'application/json', 'buffer': json.dumps(saved).encode()})
        expect(page.locator('#tick')).to_have_text('000,100')
        assert snapshot() == saved
        page.locator('#snapshot-file').set_input_files({'name': 'invalid.json', 'mimeType': 'application/json', 'buffer': b'{}'})
        expect(page.locator('#toast')).to_have_class('error')
        assert snapshot() == saved
        context.set_offline(False)
        page.reload(wait_until='networkidle')
        expect(page.locator('#tick')).to_have_text('000,100')
        expect(page.locator('#play')).to_have_text('Resume')
        assert snapshot() == saved, 'IndexedDB must restore after reload'
        second = context.new_page()
        second.goto(base, wait_until='networkidle')
        expect(second.locator('#tick')).to_have_text('000,100')
        second.locator('#step').click()
        expect(second.locator('#tick')).to_have_text('000,101')
        assert snapshot() == saved, 'Each tab must own an independent world'
        second.close()
        page.locator('#preset').select_option('scarcity')
        page.locator('#seed').fill('7')
        page.locator('#reset').click()
        expect(page.locator('#session-seed')).to_have_text('SEED 7')
        page.locator('#speed').select_option('120')
        page.locator('#play').click()
        expect(page.locator('#connection')).to_have_text('Running')
        page.wait_for_function("document.querySelector('#tick').textContent !== '000,000'")
        page.locator('#play').click()
        expect(page.locator('#play')).to_have_text('Resume')
        page.locator('#guide-open').click()
        expect(page.locator('#guide')).to_be_visible()
        page.locator('#guide-close').click()
        out = ROOT / 'dist' / 'pages-screenshots'
        out.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(out / 'desktop.png'), full_page=True)
        page.set_viewport_size({'width': 412, 'height': 915})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile horizontal overflow'
        page.locator('#step').click()
        page.screenshot(path=str(out / 'mobile.png'), full_page=True)
        assert not errors, errors
        assert not any('/api/' in url for url in requests), requests
        print(f'PASS: {base} — live worker, all brushes/layers, controls, offline operation, exact replay, import/export, IndexedDB reload, independent tabs, mobile; no API requests or page errors.')
        browser.close()


if os.environ.get('PAGES_URL'):
    exercise(os.environ['PAGES_URL'])
else:
    with tempfile.TemporaryDirectory(prefix='symbiosis-pages-') as temp:
        shutil.copytree(ROOT / 'dist' / 'pages', pathlib.Path(temp) / 'symbiosis-lab')
        class Handler(http.server.SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=temp))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            exercise(f'http://127.0.0.1:{server.server_port}/symbiosis-lab/')
        finally:
            server.shutdown()

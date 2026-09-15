"""Exercise release contents and checksums in an isolated source copy."""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile

source = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='symbiosis-package-') as temp:
    root = pathlib.Path(temp) / 'symbiosis-lab'
    (root / 'scripts').mkdir(parents=True)
    shutil.copy2(source / 'scripts/package.py', root / 'scripts/package.py')
    (root / 'package.json').write_text('{"version":"0.1.0-alpha.1"}')
    for name in ['dist/server/index.js', 'README.md', '.env.example', 'data/.gitkeep',
                 '.remember/notes.md', '.env', '.env.production', 'data/latest.json',
                 'private-notes.txt', 'docs/.env.local']:
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('fixture')
    output = root / 'release.zip'
    subprocess.run([sys.executable, str(root / 'scripts/package.py'), str(output)], check=True)
    with zipfile.ZipFile(output) as archive:
        names = {name.removeprefix('symbiosis-lab/') for name in archive.namelist()}
        assert not names & {'.remember/notes.md', '.env', '.env.production',
                            'data/latest.json', 'private-notes.txt', 'docs/.env.local'}, names
        assert {'dist/server/index.js', 'README.md', '.env.example', 'data/.gitkeep',
                'SHA256SUMS', 'BUILDINFO.json'} <= names, names
        for line in archive.read('symbiosis-lab/SHA256SUMS').decode().splitlines():
            digest, name = line.split('  ', 1)
            assert hashlib.sha256(archive.read('symbiosis-lab/' + name)).hexdigest() == digest
        assert json.loads(archive.read('symbiosis-lab/BUILDINFO.json'))['version'] == '0.1.0-alpha.1'
print('PASS: release excludes local/private files; includes built output and valid checksums.')

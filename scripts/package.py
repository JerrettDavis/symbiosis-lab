"""Package a built release using only the Python standard library.
Run npm run verify first. Usage: python scripts/package.py [output.zip]
Includes prebuilt dist/ for dependency-free startup; excludes local data/secrets/dependencies.
"""
from __future__ import annotations
import hashlib, json, pathlib, sys, zipfile, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
output = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / f'{root.name}-v{version}.zip'
if not (root / 'dist/server/index.js').exists():
    raise SystemExit('Build first: npm run build')
allowed_dirs = {'.github', 'dist', 'docs', 'examples', 'public', 'scripts', 'src', 'tests'}
allowed_files = {'.dockerignore', '.env.example', '.gitignore', '.gitattributes',
    'compose.yaml', 'Dockerfile', 'LICENSE', 'package.json', 'package-lock.json',
    'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md',
    'CHANGELOG.md', 'tsconfig.json'}
files = []
for path in root.rglob('*'):
    rel = path.relative_to(root)
    if not path.is_file() or path.is_symlink(): continue
    if not (rel.parts[0] in allowed_dirs or rel.as_posix() in allowed_files or rel.as_posix() == 'data/.gitkeep'): continue
    if any(p in {'node_modules', '.git', '__pycache__', '.remember'} for p in rel.parts): continue
    if rel.name.startswith('.env') and rel.as_posix() != '.env.example': continue
    if rel.name in {'.DS_Store', 'SHA256SUMS', 'BUILDINFO.json'} or path.suffix in {'.zip', '.log', '.pem', '.key'}: continue
    if path.resolve() == output: continue
    files.append(path)
commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=root, capture_output=True, text=True)
buildinfo = root / 'BUILDINFO.json'
buildinfo.write_text(json.dumps({'version': version, 'commit': commit.stdout.strip() or None,
    'runtimeDependencies': 0, 'prebuiltOutputIncluded': True}, indent=2) + '\n', encoding='utf-8')
files.append(buildinfo)
files.sort(key=lambda p: p.relative_to(root).as_posix())
manifest = root / 'SHA256SUMS'
manifest.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root).as_posix()}\n' for p in files), encoding='utf-8')
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files + [manifest]: archive.write(path, pathlib.Path(root.name) / path.relative_to(root))
with zipfile.ZipFile(output) as archive:
    bad = archive.testzip()
    if bad: raise RuntimeError(f'ZIP integrity failure: {bad}')
print(f'{output}: {output.stat().st_size:,} bytes; {len(files)+1} files')
print('SHA256:', hashlib.sha256(output.read_bytes()).hexdigest())

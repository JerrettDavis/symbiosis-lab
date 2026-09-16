import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Publish only the UI and portable engine, never server code or saved user worlds.
const output = new URL('../dist/pages/', import.meta.url);
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync('public', output, { recursive: true });
for (const directory of ['web', 'engine']) cpSync(`dist/${directory}`, new URL(directory, output), { recursive: true, filter: path => !/\.(map|ts)$/.test(path) });
const index = new URL('index.html', output);
writeFileSync(index, readFileSync(index, 'utf8').replace('<html lang="en">', '<html lang="en" data-runtime="browser">').replace('href="./api/snapshot"', 'href="#export"'));
writeFileSync(new URL('.nojekyll', output), '');
console.log('GitHub Pages artifact: dist/pages');

import { cpSync, mkdirSync } from 'node:fs';
mkdirSync('dist/public', { recursive: true });
cpSync('public', 'dist/public', { recursive: true });
cpSync('dist/web', 'dist/public/web', { recursive: true });

mkdirSync('dist/public/engine', { recursive: true });
cpSync('dist/engine/types.js', 'dist/public/engine/types.js');

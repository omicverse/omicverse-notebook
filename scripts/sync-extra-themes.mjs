import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const darkFontsSourceDir = path.join(root, 'theme', 'fonts');
const darkFontsTargetDir = path.join(
  root,
  'omicverse_notebook',
  'labextension',
  'themes',
  'omicverse-notebook',
  'fonts'
);
const lightSourceDir = path.join(root, 'theme-light');
const lightTargetDir = path.join(
  root,
  'omicverse_notebook',
  'labextension',
  'themes',
  'omicverse-notebook',
  'light'
);

if (existsSync(darkFontsSourceDir)) {
  mkdirSync(path.dirname(darkFontsTargetDir), { recursive: true });
  cpSync(darkFontsSourceDir, darkFontsTargetDir, { recursive: true });
}

if (existsSync(lightSourceDir)) {
  rmSync(path.join(lightTargetDir, 'fonts'), { force: true, recursive: true });
  rmSync(path.join(lightTargetDir, 'fonts.css'), { force: true });
  mkdirSync(path.dirname(lightTargetDir), { recursive: true });
  cpSync(lightSourceDir, lightTargetDir, { recursive: true });
}

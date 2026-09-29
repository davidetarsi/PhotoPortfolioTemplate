// @vitest-environment node
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoot = new URL('../', import.meta.url);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:js|jsx|ts|tsx)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

function importedSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:\bimport\s+(?:[^'";]*?\s+from\s*)?|\bexport\s+[^'";]*?\s+from\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

const isLegacySpecifier = specifier => /(?:^|\/)admin\/|(?:^|\/)pages\/admin\.js$|(?:^|\/)styles\/admin\.css$/.test(specifier);

describe('dashboard source imports', () => {
  it('does not import removed legacy admin UI modules', async () => {
    const files = await sourceFiles(sourceRoot.pathname);
    const imports = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedSpecifiers(source)) {
        if (isLegacySpecifier(specifier)) imports.push(`${file}: ${specifier}`);
      }
    }
    expect(imports).toEqual([]);

    const adminHtml = await readFile(new URL('../../admin.html', import.meta.url), 'utf8');
    expect(adminHtml).toContain('/src/dashboard/main.jsx');
    expect(adminHtml).not.toContain('/src/pages/admin.js');
  });
});

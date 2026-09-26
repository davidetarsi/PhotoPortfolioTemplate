// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

describe('HTML templates', () => {
  it('never assign a raw template literal to innerHTML: use the html tag', () => {
    const offenders = sources('src').flatMap(file =>
      readFileSync(file, 'utf8').split('\n')
        .map((line, i) => (/innerHTML\s*=\s*`/.test(line) ? `${file}:${i + 1}` : null))
        .filter(Boolean));
    expect(offenders).toEqual([]);
  });
});

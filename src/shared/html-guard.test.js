// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.jsx?$/.test(entry.name) && !/\.test\.jsx?$/.test(entry.name) ? [path] : [];
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

  it('never use dangerouslySetInnerHTML in React code: JSX escapes text by itself', () => {
    const offenders = sources('src').filter(file => readFileSync(file, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders).toEqual([]);
  });
});

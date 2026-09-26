import { describe, expect, it } from 'vitest';
import { publicOutputs, setupProblems } from './setup.js';

describe('setupProblems', () => {
  const ready = { env: { CLOUDFLARE_API_TOKEN: 't' }, exists: () => true, hasCommand: () => true };

  it('finds nothing when everything is in place', () => {
    expect(setupProblems(ready)).toEqual([]);
  });

  it('names each missing prerequisite with what to do', () => {
    const problems = setupProblems({ env: {}, exists: () => false, hasCommand: () => false });
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/Terraform is not installed/);
    expect(problems[1]).toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(problems[2]).toMatch(/cp infra\/terraform\.tfvars\.example infra\/terraform\.tfvars/);
  });
});

describe('publicOutputs', () => {
  it('unwraps terraform output -json and drops sensitive values', () => {
    expect(publicOutputs({
      project_name: { value: 'mario', type: 'string', sensitive: false },
      turnstile_secret: { value: 'shh', type: 'string', sensitive: true },
    })).toEqual({ project_name: 'mario' });
  });

  it('accepts plain values too', () => {
    expect(publicOutputs({ project_name: 'mario' })).toEqual({ project_name: 'mario' });
  });
});

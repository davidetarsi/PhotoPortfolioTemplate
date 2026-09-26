/**
 * What `npm run setup` needs before it runs Terraform. Each problem says how to fix it.
 * @param {{ env: object, exists: (path: string) => boolean, hasCommand: (cmd: string) => boolean }} deps
 * @returns {string[]} Problems; empty when setup can run.
 */
export function setupProblems({ env, exists, hasCommand }) {
  const problems = [];
  if (!hasCommand('terraform')) {
    problems.push('Terraform is not installed: https://developer.hashicorp.com/terraform/install (1.9 or later).');
  }
  if (!env.CLOUDFLARE_API_TOKEN) {
    problems.push('CLOUDFLARE_API_TOKEN is not set: export it in this shell, never in a file (docs/runbook-cloudflare.md, section 2).');
  }
  if (!exists('infra/terraform.tfvars')) {
    problems.push('infra/terraform.tfvars is missing: cp infra/terraform.tfvars.example infra/terraform.tfvars, then fill it in.');
  }
  return problems;
}

/**
 * `terraform output -json` wraps each value in { value, type, sensitive }. Unwraps them and
 * drops sensitive outputs, so a secret never reaches a generated file.
 * @param {Record<string, unknown>} raw - Parsed `terraform output -json`.
 * @returns {Record<string, unknown>} Plain values of the non-sensitive outputs.
 */
export function publicOutputs(raw) {
  return Object.fromEntries(
    Object.entries(raw)
      .filter(([, output]) => !output?.sensitive)
      .map(([name, output]) => [name, output?.value ?? output]),
  );
}

/**
 * Build warnings that are expected by design and would only alarm a fork.
 *
 * src/api/index.js loads the slot registry with a dynamic import so that importing
 * the public API never evaluates custom/slots.js (which may import the API itself).
 * The pages import the registry statically, so the bundler reports the dynamic import
 * as ineffective: true for chunking, irrelevant for evaluation order.
 *
 * @param {{ code?: string, id?: string }} warning - Rolldown/Rollup warning.
 * @returns {boolean} True when the warning should not be shown.
 */
export function isExpectedBuildWarning(warning) {
  return warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT'
    && typeof warning.id === 'string'
    && warning.id.replaceAll('\\', '/').endsWith('/src/core/custom-slots.js');
}

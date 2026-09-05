import { buildDistribution } from '../node_modules/@iroha/iroha-js/scripts/build-dist.mjs';
import { resolve } from 'node:path';

/**
 * Build the installable Iroha JavaScript package distributions used by Vite.
 * The injected builder keeps postinstall behavior independently testable.
 *
 * @param {{ build?: () => Promise<unknown> | unknown }} [options]
 */
export async function prepareIrohaSdk({ build = buildDistribution } = {}) {
  if (typeof build !== 'function') {
    throw new TypeError('prepareIrohaSdk build must be a function');
  }
  await build();
}

function isDirectExecution(moduleUrl, argv = process.argv) {
  const entrypoint = argv[1];
  if (typeof entrypoint !== 'string') return false;
  const modulePath = decodeURIComponent(new URL(moduleUrl).pathname);
  return resolve(entrypoint) === resolve(modulePath);
}

if (isDirectExecution(import.meta.url)) {
  await prepareIrohaSdk();
}

export const REQUIRED_NODE_VERSION = '24.19.0';

export function assertRequiredNodeVersion(version = process.versions.node) {
  const normalized = String(version).replace(/^v/u, '');
  if (normalized !== REQUIRED_NODE_VERSION) {
    throw new Error(`Node ${REQUIRED_NODE_VERSION} is required, found ${normalized || 'unknown'}`);
  }
  return normalized;
}

async function main() {
  try {
    const version = assertRequiredNodeVersion();
    console.log(`NODE VERSION: ${version}`);
  } catch (error) {
    console.error(`NODE VERSION: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-node-version.mjs')) {
  await main();
}

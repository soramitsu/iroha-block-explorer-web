import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLAYWRIGHT_RUNTIME_CONFIG = Object.freeze({
  networkId: 'hash:32C903E5B3497E34C2B844EBFE8A39C19E6CF8F95D44C1FFB8BA9DCB42F91149#A2F0',
  toriiBaseUrl: 'http://127.0.0.1:4175',
  toriiForceBaseUrl: false,
  toriiFailoverEnabled: false,
});

export async function stagePlaywrightRuntimeConfig(outputDirectory = path.resolve('dist')) {
  const resolvedOutput = path.resolve(outputDirectory);
  await access(path.join(resolvedOutput, 'index.html'));

  const configPath = path.join(resolvedOutput, 'config.json');
  await writeFile(configPath, `${JSON.stringify(PLAYWRIGHT_RUNTIME_CONFIG, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  });
  return configPath;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  stagePlaywrightRuntimeConfig().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

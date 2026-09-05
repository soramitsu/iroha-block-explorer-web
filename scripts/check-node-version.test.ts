import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REQUIRED_NODE_VERSION,
  assertRequiredNodeVersion,
} from './check-node-version.mjs';

describe('exact Node release runtime', () => {
  it('accepts only Node 24.19.0', () => {
    expect(REQUIRED_NODE_VERSION).toBe('24.19.0');
    expect(assertRequiredNodeVersion('24.19.0')).toBe('24.19.0');
    expect(assertRequiredNodeVersion('v24.19.0')).toBe('24.19.0');
    expect(() => assertRequiredNodeVersion('24.18.0')).toThrow('Node 24.19.0 is required');
    expect(() => assertRequiredNodeVersion('24.19.1')).toThrow('Node 24.19.0 is required');
    expect(() => assertRequiredNodeVersion('25.0.0')).toThrow('Node 24.19.0 is required');
  });

  it('bootstraps the exact toolchain inside the digest-pinned Playwright image', () => {
    const jenkinsfile = readFileSync(path.resolve('Jenkinsfile'), 'utf8');
    expect(jenkinsfile).toContain(
      'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright sh scripts/bootstrap-exact-toolchain.sh node scripts/run-ci-gates.mjs'
    );
    expect(jenkinsfile).toContain(
      'mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d'
    );
    expect(jenkinsfile).not.toContain("buildDockerImage:   'node:");
    expect(jenkinsfile).not.toContain(
      'node scripts/run-exact-toolchain.mjs -- node scripts/run-ci-gates.mjs'
    );
  });
});

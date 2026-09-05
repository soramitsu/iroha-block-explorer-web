import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const INSTALLED_IROHA_JS_ROOT = path.resolve(
  process.cwd(),
  'node_modules/@iroha/iroha-js'
);

describe('canonical Rust Kotodama parity boundary', () => {
  it('keeps fixture refresh rooted in the exact sibling Iroha Rust compiler', () => {
    const refreshScript = readFileSync(
      path.resolve(process.cwd(), 'scripts/refresh-kotodama-parity.mjs'),
      'utf8'
    );

    expect(refreshScript).toContain("path.resolve(repoRoot, '../iroha')");
    expect(refreshScript).toContain("baseArgs: ['run', '-q', '-p', 'ivm', '--bin', 'koto_compile', '--']");
    expect(refreshScript).toContain("path.resolve(irohaRoot, 'crates/kotodama_lang/src/samples')");
    expect(refreshScript).toContain("path.resolve(irohaRoot, 'examples')");
    expect(refreshScript).not.toContain('compileKotodamaStudioProgram');
  });

  it('binds the installed Node adapter to its native compiler seam', () => {
    const packageIndex = readFileSync(
      path.join(INSTALLED_IROHA_JS_ROOT, 'dist/kotodamaCompiler/index.js'),
      'utf8'
    );
    const nativeBridge = readFileSync(
      path.join(INSTALLED_IROHA_JS_ROOT, 'dist/kotodamaCompiler/nativeBridge.js'),
      'utf8'
    );

    expect(packageIndex).toContain('compileKotodamaWithNativeBinding');
    expect(nativeBridge).toContain('native.compileKotodama(request)');
  });

  it('keeps Explorer production code as a package facade with no compiler implementation', () => {
    const explorerFacade = readFileSync(
      path.resolve(process.cwd(), 'src/shared/lib/kotodama-studio-compiler.ts'),
      'utf8'
    );

    expect(explorerFacade.trim()).toBe(
      "export * from '@iroha/iroha-js/kotodama-compiler';"
    );
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compileKotodamaProgram } from './kotodama-studio-compiler';

const INSTALLED_IROHA_JS_ROOT = path.resolve(
  process.cwd(),
  'node_modules/@iroha/iroha-js'
);
const SOURCE = 'seiyaku Demo { view fn ping() -> int { return 1; } }';

function compilerFailureResponse() {
  return new Response(JSON.stringify({
    ok: false,
    output: null,
    diagnosticsJson: JSON.stringify([{
      code: 'EK_PARSE',
      severity: 'error',
      phase: 'parse',
      message: 'expected an entrypoint declaration',
      primary_span: null,
      labels: [],
      notes: [],
      help: null,
      fix: null,
    }]),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('current Iroha Kotodama compiler package boundary', () => {
  it('installs the package boundary selected by the exact commit/subdirectory pin', () => {
    const explorerPackage = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
    ) as { dependencies: Record<string, string> };
    const profile = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'tests/mochi/explorer-profile.json'), 'utf8')
    ) as { iroha_revision: string };
    const installedPackage = JSON.parse(
      readFileSync(path.join(INSTALLED_IROHA_JS_ROOT, 'package.json'), 'utf8')
    ) as { name: string, dependencies: Record<string, string> };
    const installedDeclaration = readFileSync(
      path.join(INSTALLED_IROHA_JS_ROOT, 'kotodama-compiler.d.ts'),
      'utf8'
    );

    expect(explorerPackage.dependencies['@iroha/iroha-js'])
      .toBe(
        `github:hyperledger-iroha/iroha#${profile.iroha_revision}&path:javascript/iroha_js`
      );
    expect(installedPackage.name).toBe('@iroha/iroha-js');
    expect(installedPackage.dependencies['@scure/bip39']).toBe('^2.2.0');
    expect(installedDeclaration).toContain('compileKotodamaProgram');
  });

  it('uses the current browser export with no independent compiler or retired aliases', () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(INSTALLED_IROHA_JS_ROOT, 'package.json'), 'utf8')
    ) as { exports: Record<string, Record<string, string>> };
    const declaration = readFileSync(
      path.join(INSTALLED_IROHA_JS_ROOT, 'kotodama-compiler.d.ts'),
      'utf8'
    );
    const browserSource = readFileSync(
      path.join(INSTALLED_IROHA_JS_ROOT, 'dist/kotodamaCompiler/browser.js'),
      'utf8'
    );

    expect(packageJson.exports['./kotodama-compiler']?.browser)
      .toBe('./dist/kotodamaCompiler/browser.js');
    expect(declaration).toContain('compileKotodamaProgram');
    expect(declaration).toContain('Promise<KotodamaCompilerResult>');
    expect(declaration).toContain('KotodamaCompiledManifestMetadata');
    expect(declaration).not.toContain('compileKotodamaStudioProgram');
    expect(declaration).not.toContain('KotodamaStudioCompiled');
    expect(browserSource).toContain('browser Kotodama compilation requires compilerUrl');
    expect(browserSource).not.toContain('nativeBridge');
  });

  it('forwards an explicit trusted service request and returns Rust diagnostics as values', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => compilerFailureResponse());

    const result = await compileKotodamaProgram(SOURCE, {
      compilerUrl: 'https://compiler.example/base',
      fetchImpl,
      sourceName: 'studio.ko',
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: 'EK_PARSE',
        severity: 'error',
        phase: 'parse',
      })],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://compiler.example/base/v1/kotodama/compile');
    expect(init).toEqual(expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    }));
    expect(JSON.parse(String(init?.body))).toEqual({
      source: SOURCE,
      sourceName: 'studio.ko',
      zk: false,
    });
  });

  it('rejects compiler-service transport failures instead of fabricating diagnostics', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('compiler unavailable', { status: 503 }));

    await expect(compileKotodamaProgram(SOURCE, {
      compilerUrl: 'https://compiler.example',
      fetchImpl,
    })).rejects.toThrow('Kotodama compiler service failed (503): compiler unavailable');
  });

  it('rejects an untrusted non-loopback HTTP compiler URL before dispatch', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => compilerFailureResponse());

    await expect(compileKotodamaProgram(SOURCE, {
      compilerUrl: 'http://compiler.example',
      fetchImpl,
    })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

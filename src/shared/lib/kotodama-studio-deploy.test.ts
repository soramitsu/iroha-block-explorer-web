import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KotodamaCompilerDiagnostic } from './kotodama-studio-compiler';
import {
  compileKotodamaStudioSource,
} from './kotodama-studio-deploy';

const compilerMocks = vi.hoisted(() => ({
  compileKotodamaProgram: vi.fn(),
}));

vi.mock('./kotodama-studio-compiler', () => ({
  compileKotodamaProgram: compilerMocks.compileKotodamaProgram,
}));

const HASH_LITERAL_PATTERN = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const PUBLIC_MANIFEST_KIND = { kind: 'Kotoage', value: null } as const;
const summary = {
  states: [],
  entrypoints: [{ name: 'main', kind: 'kotoage' as const, permission: null }],
  triggers: [],
};
const manifest = {
  seiyaku_name: 'Demo',
  code_hash: `hash:${'A'.repeat(64)}#D495`,
  abi_hash: `hash:${'B'.repeat(64)}#ED48`,
  compiler_fingerprint: 'kotodama_lang/current-rust',
  features_bitmap: 0,
  access_set_hints: null,
  entrypoints: [{
    name: 'main',
    kind: PUBLIC_MANIFEST_KIND,
    params: [],
    argument_schema: null,
    return_type: null,
    return_schema: null,
    permission: null,
    read_keys: [],
    write_keys: [],
    access_hints_complete: true,
    access_hints_skipped: [],
    triggers: [],
  }],
  states: [],
  error_codes: null,
  kotoba: null,
  provenance: null,
};
const compilerDiagnostic = {
  code: 'EK_PARSE',
  severity: 'error',
  phase: 'parse',
  message: 'Unexpected character',
  primary_span: {
    source: 'studio.ko',
    start: { line: 2, column: 3 },
    end: { line: 2, column: 4 },
    byte_range: { start: 18, end: 19 },
  },
  labels: [],
  notes: [],
  help: null,
  fix: null,
} satisfies KotodamaCompilerDiagnostic;

describe('kotodama studio compiler-service helper', () => {
  beforeEach(() => {
    compilerMocks.compileKotodamaProgram.mockReset();
  });

  it('requires an explicitly configured trusted compiler service URL', async () => {
    await expect(compileKotodamaStudioSource({
      source: 'seiyaku Demo {}',
      summary,
      compilerUrl: '   ',
    })).rejects.toThrow('compiler service URL is not configured');
    expect(compilerMocks.compileKotodamaProgram).not.toHaveBeenCalled();
  });

  it('maps a successful canonical Rust service result into a compiled artifact', async () => {
    compilerMocks.compileKotodamaProgram.mockResolvedValue({
      ok: true,
      output: {
        artifactBytes: Uint8Array.from([1, 2, 3, 4]),
        codeHashHex: 'aa'.repeat(32),
        abiHashHex: 'bb'.repeat(32),
        compilerFingerprint: 'kotodama_lang/current-rust',
        manifest,
        sourceMap: [{
          function_name: 'main',
          pc_start: 0,
          pc_end: 4,
          source_path: 'studio.ko',
          source_id: 0,
          byte_start: 0,
          byte_end: 4,
          line: 1,
          column: 1,
        }],
        budgetReport: [{
          function_name: 'main',
          pc_start: 0,
          pc_end: 4,
          bytecode_bytes: 4,
          bytecode_words: 1,
          frame_bytes: 0,
          jump_span_words: 0,
          jump_range_risk: false,
          source_path: 'studio.ko',
          source_id: 0,
          byte_start: 0,
          byte_end: 4,
          line: 1,
          column: 1,
        }],
      },
    });

    const result = await compileKotodamaStudioSource({
      source: 'seiyaku Demo { kotoage fn main() {} }',
      summary,
      compilerUrl: ' https://compiler.example/base ',
    });

    expect(compilerMocks.compileKotodamaProgram).toHaveBeenCalledWith(
      'seiyaku Demo { kotoage fn main() {} }',
      {
        compilerUrl: 'https://compiler.example/base',
        sourceName: 'studio.ko',
      }
    );
    expect(result).toEqual(expect.objectContaining({
      artifactLabel: '.to bundle',
      artifactB64: 'AQIDBA==',
      codeHashHex: 'aa'.repeat(32),
      abiHashHex: 'bb'.repeat(32),
      compilerFingerprint: 'kotodama_lang/current-rust',
      diagnostics: [],
      warnings: [],
      manifest,
    }));
    expect(result.manifest?.code_hash).toMatch(HASH_LITERAL_PATTERN);
    expect(result.sourceMap[0]).toEqual(expect.objectContaining({
      function_name: 'main',
      source_path: 'studio.ko',
    }));
  });

  it('keeps canonical compiler diagnostics as values and separates warnings', async () => {
    compilerMocks.compileKotodamaProgram.mockResolvedValue({
      ok: false,
      diagnostics: [
        compilerDiagnostic,
        { ...compilerDiagnostic, code: 'K_UNUSED', severity: 'warning', message: 'Unused binding' },
      ],
    });

    const result = await compileKotodamaStudioSource({
      source: 'seiyaku Demo { @ }',
      summary,
      compilerUrl: 'https://compiler.example',
    });

    expect(result.artifactB64).toBe('');
    expect(result.manifest).toBeNull();
    expect(result.diagnostics).toEqual([compilerDiagnostic]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'K_UNUSED', severity: 'warning' }),
    ]);
  });

  it('does not turn compiler-service transport failures into source diagnostics', async () => {
    compilerMocks.compileKotodamaProgram.mockRejectedValue(
      new Error('Kotodama compiler service failed (503): unavailable')
    );

    await expect(compileKotodamaStudioSource({
      source: 'seiyaku Demo {}',
      summary,
      compilerUrl: 'https://compiler.example',
    })).rejects.toThrow('compiler service failed (503)');
  });

  it('has no browser signing credential or retired server-deploy route surface', () => {
    const productionSources = [
      'src/pages/KotodamaStudio.vue',
      'src/shared/api/index.ts',
      'src/shared/api/schemas.ts',
      'src/shared/lib/kotodama-studio-deploy.ts',
    ].map((file) => readFileSync(path.resolve(process.cwd(), file), 'utf8')).join('\n');

    expect(productionSources).not.toContain('private_key');
    expect(productionSources).not.toContain('/v1/contracts/deploy');
    expect(productionSources).not.toContain('submitContractDeployRequest');
  });
});

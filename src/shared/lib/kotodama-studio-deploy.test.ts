import { describe, expect, it } from 'vitest';
import {
  buildKotodamaStudioDeployDraft,
  compileKotodamaStudioSource,
  type KotodamaStudioCompileResult,
} from './kotodama-studio-deploy';

const HASH_LITERAL_PATTERN = /^hash:[0-9A-F]{64}#[0-9A-F]{4}$/u;
const PUBLIC_MANIFEST_KIND = { kind: 'Public', value: null } as const;
const deployCompileResultFixture = {
  artifactLabel: '.to bundle',
  artifactB64: 'YmluYXJ5',
  codeHashHex: 'aa'.repeat(32),
  abiHashHex: 'bb'.repeat(32),
  compilerFingerprint: 'kotodama-worker-1.0',
  diagnostics: [],
  warnings: [],
  manifest: {
    code_hash: 'hash:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA#D495',
    abi_hash: 'hash:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB#ED48',
    compiler_fingerprint: 'kotodama_lang/2.0.0-rc.2.0',
    features_bitmap: 0,
    access_set_hints: {
      read_keys: ['*'],
      write_keys: ['*'],
      dynamic_reads: [],
      dynamic_writes: [],
    },
    entrypoints: [{
      name: 'celebrate',
      kind: PUBLIC_MANIFEST_KIND,
      params: [{ name: 'pool', type_name: 'Name' }],
      return_type: null,
      permission: 'Admin',
      read_keys: ['*'],
      write_keys: ['*'],
      access_hints_complete: true,
      access_hints_skipped: [],
      triggers: [{
        id: 'sparkle',
        callback: {
          namespace: null,
          entrypoint: 'celebrate',
        },
      }],
    }],
    states: [],
    kotoba: null,
    provenance: null,
  },
  sourceMap: [],
  budgetReport: [],
  summary: {
    states: ['counter'],
    entrypoints: [{ name: 'celebrate', kind: 'kotoage', permission: 'Admin' }],
    triggers: [{ id: 'sparkle', entrypoint: 'celebrate', mode: 'schedule' }],
  },
} satisfies KotodamaStudioCompileResult;

describe('kotodama studio deploy helpers', () => {
  it('compiles the Studio source locally into a real artifact bundle', async () => {
    const result = await compileKotodamaStudioSource({
      source: 'seiyaku Demo { kotoage fn main() { info("hi"); } }',
      summary: {
        states: [],
        entrypoints: [{ name: 'main', kind: 'kotoage', permission: null }],
        triggers: [],
      },
    });

    expect(result.artifactLabel).toBe('.to bundle');
    expect(result.artifactB64.length).toBeGreaterThan(0);
    expect(result.codeHashHex).toHaveLength(64);
    expect(result.abiHashHex).toHaveLength(64);
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest?.code_hash).toMatch(HASH_LITERAL_PATTERN);
    expect(result.manifest?.abi_hash).toMatch(HASH_LITERAL_PATTERN);
    expect(result.sourceMap).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'main',
        source_path: 'studio.ko',
      }),
    ]));
    expect(result.budgetReport).toEqual(expect.arrayContaining([
      expect.objectContaining({
        function_name: 'main',
        source_path: 'studio.ko',
      }),
    ]));
    expect(result.manifest?.entrypoints[0]).toEqual(
      expect.objectContaining({
        name: 'main',
        kind: PUBLIC_MANIFEST_KIND,
      })
    );
  });

  it('surfaces local parser diagnostics instead of falling back to preview mode', async () => {
    const result = await compileKotodamaStudioSource({
      source: 'seiyaku Demo { @ }',
      summary: {
        states: [],
        entrypoints: [{ name: 'main', kind: 'kotoage', permission: null }],
        triggers: [],
      },
    });

    expect(result.codeHashHex).toBe('');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Unexpected character'),
        line: 1,
      }),
    ]);
  });

  it('builds a torii contracts deploy draft from compile output', () => {
    const draft = buildKotodamaStudioDeployDraft({
      authority: 'alice@play.main',
      chainId: 'wonderland',
      dataspace: 'party-lane',
      compileResult: deployCompileResultFixture,
    });

    expect(draft).toEqual(expect.objectContaining({
      authority: 'alice@play.main',
      chainId: 'wonderland',
      dataspace: 'party-lane',
      codeHashHex: 'aa'.repeat(32),
      abiHashHex: 'bb'.repeat(32),
      deployMode: 'torii_contracts_deploy_v1',
      toriiRequest: {
        endpoint: '/v1/contracts/deploy',
        authority: 'alice@play.main',
        code_b64: 'YmluYXJ5',
        dataspace: 'party-lane',
      },
    }));
    expect(draft).not.toHaveProperty('namespace');
    expect(draft).not.toHaveProperty('contractId');
  });

  it('omits the dataspace payload when Studio stays on the default universal deploy lane', () => {
    const draft = buildKotodamaStudioDeployDraft({
      authority: 'alice@play.main',
      chainId: 'wonderland',
      dataspace: ' universal ',
      compileResult: deployCompileResultFixture,
    });

    expect(draft.dataspace).toBe('universal');
    expect(draft.toriiRequest).toEqual({
      endpoint: '/v1/contracts/deploy',
      authority: 'alice@play.main',
      code_b64: 'YmluYXJ5',
    });
  });

  it('rejects deploy drafts when the compiler manifest is missing', () => {
    expect(() => buildKotodamaStudioDeployDraft({
      authority: 'alice@play.main',
      chainId: 'wonderland',
      dataspace: 'universal',
      compileResult: {
        artifactLabel: '.to bundle',
        artifactB64: '',
        codeHashHex: '',
        abiHashHex: '',
        compilerFingerprint: 'kotodama-worker-1.0',
        diagnostics: [{ severity: 'error', message: 'bad source' }],
        warnings: [],
        manifest: null,
        sourceMap: [],
        budgetReport: [],
        summary: {
          states: [],
          entrypoints: [],
          triggers: [],
        },
      },
    })).toThrow('Cannot build a deploy draft without a successful local compiler manifest.');
  });
});

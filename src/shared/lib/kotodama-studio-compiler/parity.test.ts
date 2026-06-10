import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  compileKotodamaStudioProgram,
  normalizeKotodamaParityCompilerStderr,
  normalizeKotodamaParityDiagnostic,
  normalizeKotodamaParitySource,
  normalizeKotodamaParitySourcePath,
  type KotodamaParityFixtureV1,
  type KotodamaParitySuccessExpectationV1,
  type KotodamaStudioCompiledBudgetEntry,
  type KotodamaStudioCompiledSourceMapEntry,
} from '@iroha/iroha-js/kotodama-compiler';
import { buildLocalContractCodeView } from '../contract-view';
import type { Instruction } from '@/shared/api/schemas';

type NormalizedKotodamaParityDiagnostic = ReturnType<typeof normalizeKotodamaParityDiagnostic>;

function readParityFixtures(): KotodamaParityFixtureV1[] {
  const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/kotodama-parity');

  return readdirSync(fixturesDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => JSON.parse(
      readFileSync(path.join(fixturesDir, entry), 'utf8')
    ) as KotodamaParityFixtureV1);
}

function findParityFixture(fixtures: KotodamaParityFixtureV1[], id: string): KotodamaParityFixtureV1 {
  const fixture = fixtures.find((entry) => entry.id === id);
  if (fixture === undefined) {
    throw new Error(`Missing Kotodama parity fixture: ${id}`);
  }

  return fixture;
}

function expectRustSuccess(fixture: KotodamaParityFixtureV1): KotodamaParitySuccessExpectationV1 {
  expect(fixture.rust.kind).toBe('success');
  if (fixture.rust.kind !== 'success') {
    throw new Error(`${fixture.id} fixture unexpectedly stopped compiling under Rust.`);
  }

  return fixture.rust;
}

function expectSourceMapRowBasics(
  browserEntry: KotodamaStudioCompiledSourceMapEntry | undefined,
  rustEntry: KotodamaStudioCompiledSourceMapEntry | undefined,
  fixtureId: string
): void {
  expect(browserEntry, fixtureId).toEqual(expect.objectContaining({
    function_name: rustEntry?.function_name,
    pc_start: rustEntry?.pc_start,
    source_path: rustEntry?.source_path,
    line: rustEntry?.line,
    column: rustEntry?.column,
  }));
}

function expectBudgetRowBasics(
  browserBudget: KotodamaStudioCompiledBudgetEntry | undefined,
  rustBudget: KotodamaStudioCompiledBudgetEntry | undefined,
  fixtureId: string
): void {
  expect(browserBudget, fixtureId).toEqual(expect.objectContaining({
    function_name: rustBudget?.function_name,
    pc_start: rustBudget?.pc_start,
    pc_end: rustBudget?.pc_end,
    bytecode_bytes: rustBudget?.bytecode_bytes,
    bytecode_words: rustBudget?.bytecode_words,
    frame_bytes: rustBudget?.frame_bytes,
    jump_span_words: rustBudget?.jump_span_words,
    source_path: rustBudget?.source_path,
    line: rustBudget?.line,
    column: rustBudget?.column,
  }));
}

function expectSmallDirectFixtureRowsToMatchRust(fixture: KotodamaParityFixtureV1): void {
  const rust = expectRustSuccess(fixture);
  const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
  const artifactCompiled = compileKotodamaStudioProgram(fixture.source, {
    sourceName: fixture.compiler_source_path ?? fixture.source_name,
  });
  const implName = rust.source_map[0]?.function_name;

  expect(compiled.diagnostics, fixture.id).toEqual([]);
  expect(artifactCompiled.diagnostics, fixture.id).toEqual([]);
  expectSourceMapRowBasics(
    compiled.sourceMap.find((entry) => entry.function_name === implName),
    rust.source_map.find((entry) => entry.function_name === implName),
    fixture.id
  );
  expectBudgetRowBasics(
    compiled.budgetReport.find((entry) => entry.function_name === implName),
    rust.budget_report.find((entry) => entry.function_name === implName),
    fixture.id
  );
  expect(compiled.sourceMap, fixture.id).toEqual(rust.source_map);
  expect(compiled.budgetReport, fixture.id).toEqual(rust.budget_report);
  expect(artifactCompiled.manifest?.entrypoints.map((entry) => entry.name), fixture.id).toEqual(
    rust.manifest?.entrypoints.map((entry) => entry.name)
  );
}

function expectFixtureDebugRowsToMatchRust(fixture: KotodamaParityFixtureV1): void {
  const rust = expectRustSuccess(fixture);
  const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });

  expect(compiled.diagnostics, fixture.id).toEqual([]);
  expect(compiled.sourceMap, fixture.id).toEqual(rust.source_map);
  expect(compiled.budgetReport, fixture.id).toEqual(rust.budget_report);
}

function manifestWithoutArtifactHashes(manifest: unknown): unknown {
  if (manifest === null || typeof manifest !== 'object') {
    return manifest;
  }

  const rest = { ...(manifest as Record<string, unknown>) };
  delete rest.code_hash;
  delete rest.abi_hash;

  return rest;
}

function alignBrowserDiagnosticLocationToRust(
  browserDiagnostic: NormalizedKotodamaParityDiagnostic,
  rustDiagnostic: NormalizedKotodamaParityDiagnostic,
): NormalizedKotodamaParityDiagnostic {
  return {
    ...browserDiagnostic,
    line: rustDiagnostic.line === undefined ? undefined : browserDiagnostic.line,
    column: rustDiagnostic.column === undefined ? undefined : browserDiagnostic.column,
  };
}

function normalizeBrowserDiagnosticsForRust(
  browserDiagnostics: NormalizedKotodamaParityDiagnostic[],
  rustDiagnostics: NormalizedKotodamaParityDiagnostic[]
): NormalizedKotodamaParityDiagnostic[] {
  return browserDiagnostics.map((diagnostic, index) => (
    alignBrowserDiagnosticLocationToRust(diagnostic, rustDiagnostics[index]!)
  ));
}

const EXPECTED_KIND_DRIFT: string[] = [];

const EXPECTED_DIAGNOSTIC_DRIFT: string[] = [];

const EXPECTED_DEBUG_DRIFT: string[] = [];

const EXPECTED_MANIFEST_DRIFT: string[] = [];

const EXPECTED_CNTR_DRIFT: string[] = [];

const EXPECTED_LTLB_DRIFT: string[] = [];

function makeInstruction(overrides: Partial<Instruction>): Instruction {
  return {
    authority: 'sample@authority.main',
    created_at: new Date('2026-03-28T00:00:00Z'),
    kind: 'RegisterSmartContractBytes',
    index: 0,
    transaction_hash: '0xstudio',
    transaction_status: 'Committed',
    block: 1,
    box: {
      encoded: '0x01',
      json: {
        kind: 'RegisterSmartContractBytes',
        payload: {},
      },
    },
    ...overrides,
  };
}

function buildContractViewFromArtifact(artifactBytes: Uint8Array, codeHash: string, manifest: unknown) {
  return buildLocalContractCodeView({
    instruction: makeInstruction({
      kind: 'RegisterSmartContractBytes',
      box: {
        encoded: '0xbytes',
        json: {
          kind: 'RegisterSmartContractBytes',
          payload: {
            code_hash: codeHash,
            code: Buffer.from(artifactBytes).toString('base64'),
          },
        },
      },
    }),
    relatedInstructions: [makeInstruction({
      kind: 'RegisterSmartContractCode',
      index: 1,
      box: {
        encoded: '0xmanifest',
        json: {
          kind: 'RegisterSmartContractCode',
          payload: {
            manifest,
          },
        },
      },
    })],
  });
}

function readArtifactSection(artifactBytes: Uint8Array, offset: number): { tag: string, bytes: Buffer, end: number } {
  const artifact = Buffer.from(artifactBytes);
  const length = artifact.readUInt32LE(offset + 4);
  const end = offset + 8 + length;

  return {
    tag: artifact.subarray(offset, offset + 4).toString('ascii'),
    bytes: artifact.subarray(offset, end),
    end,
  };
}

function readArtifactSectionByTag(artifactBytes: Uint8Array, expectedTag: string): Buffer | null {
  const artifact = Buffer.from(artifactBytes);
  let offset = 17;

  while (offset < artifact.length) {
    const tag = artifact.subarray(offset, offset + 4).toString('ascii');

    if (tag === 'CNTR' || tag === 'DBG1') {
      const length = artifact.readUInt32LE(offset + 4);
      const end = offset + 8 + length;
      if (tag === expectedTag) {
        return artifact.subarray(offset, end);
      }
      offset = end;
      continue;
    }

    if (tag === 'LTLB') {
      const count = artifact.readUInt32LE(offset + 4);
      const postPad = artifact.readUInt32LE(offset + 8);
      const dataLength = artifact.readUInt32LE(offset + 12);
      const end = offset + 16 + count * 8 + dataLength + postPad;
      if (tag === expectedTag) {
        return artifact.subarray(offset, end);
      }
      offset = end;
      continue;
    }

    return null;
  }

  return null;
}

function extractAuthorityProbeMeaningfulInstructions(renderedSourceText: string): string[] {
  return renderedSourceText
    .split('\n')
    .filter((line) => (
      line.includes('store64 [r31]')
      || line.includes('GET_AUTHORITY')
      || line.includes('INPUT_PUBLISH_TLV')
      || line.includes('TLV_EQ')
      || line.includes('SET_ACCOUNT_DETAIL')
      || line.includes('addi r8, r0, 0')
      || line.includes('load64 r8')
      || line.includes('load64 r9')
      || line.includes('load64 r23')
      || line.includes('load64 r24')
      || line.includes('load64 r1')
      || line.includes('jalr r0, r1, 0')
    ))
    .map((line) => line.trim());
}

describe('kotodama parity fixtures', () => {
  it('normalizes source and stderr deterministically', () => {
    expect(normalizeKotodamaParitySource('a\r\nb\r\n')).toBe('a\nb\n');
    expect(normalizeKotodamaParityCompilerStderr('\n first \r\n\r\n second \n')).toEqual(['first', 'second']);
    expect(normalizeKotodamaParitySourcePath('/tmp/work/iroha/demo/example.ko')).toBe('demo/example.ko');
    expect(normalizeKotodamaParityDiagnostic({
      severity: 'error',
      message: 'compile error: parser error: Unexpected character `@`. at 2:3',
    })).toEqual({
      severity: 'error',
      message: 'Unexpected character \'@\'',
      line: 2,
      column: 3,
      code: null,
      phase: null,
    });
  });

  it('loads the checked-in fixture corpus', () => {
    const fixtures = readParityFixtures();

    expect(fixtures.length).toBeGreaterThan(10);
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(fixtures.length);

    for (const fixture of fixtures) {
      expect(fixture.version).toBe(1);
      expect(fixture.source_name).toBeTruthy();
      expect(fixture.compiler_source_path ?? fixture.source_name).toBeTruthy();
      expect(normalizeKotodamaParitySource(fixture.source)).toBe(fixture.source);

      if (fixture.rust.kind === 'success') {
        expect(fixture.rust.artifact_b64).toBeTruthy();
        expect(Array.isArray(fixture.rust.source_map)).toBe(true);
        expect(Array.isArray(fixture.rust.budget_report)).toBe(true);
        expect(Array.isArray(fixture.rust.diagnostics)).toBe(true);
        continue;
      }

      expect(Array.isArray(fixture.rust.diagnostics)).toBe(true);
      expect(Array.isArray(fixture.rust.compiler_stderr)).toBe(true);
    }
  });

  it('reports browser success or failure kind drift across the checked-in rust corpus', () => {
    const drifting = readParityFixtures()
      .flatMap((fixture) => {
        const compiled = compileKotodamaStudioProgram(fixture.source);
        const browserKind = compiled.diagnostics.length > 0 ? 'failure' : 'success';

        return browserKind === fixture.rust.kind
          ? []
          : [`${fixture.id}: ${browserKind} vs ${fixture.rust.kind}`];
      });

    expect(drifting).toEqual(EXPECTED_KIND_DRIFT);
  });

  it('matches normalized failure diagnostics for the curated rust corpus', () => {
    const drifting = readParityFixtures()
      .filter((fixture) => fixture.rust.kind === 'failure')
      .flatMap((fixture) => {
        const compiled = compileKotodamaStudioProgram(fixture.source);
        const rustDiagnostics = fixture.rust.diagnostics.map(normalizeKotodamaParityDiagnostic);
        const browserDiagnostics = normalizeBrowserDiagnosticsForRust(
          compiled.diagnostics.map(normalizeKotodamaParityDiagnostic),
          rustDiagnostics
        );

        return isDeepStrictEqual(browserDiagnostics, rustDiagnostics)
          ? []
          : [fixture.id];
      });

    expect(drifting).toEqual(EXPECTED_DIAGNOSTIC_DRIFT);
  });

  it('matches rust aggregate access hints for the static ivm-smoke transfer fixture', () => {
    const fixture = findParityFixture(readParityFixtures(), 'ivm-smoke');
    expect(fixture.rust.kind).toBe('success');
    if (fixture.rust.kind !== 'success') {
      throw new Error('ivm-smoke fixture unexpectedly stopped compiling under Rust.');
    }
    if (fixture.rust.manifest === null) {
      throw new Error('ivm-smoke fixture is missing Rust manifest metadata.');
    }

    const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.manifest?.access_set_hints).toEqual(fixture.rust.manifest.access_set_hints);
  });

  it('keeps asset-ops on the current direct-entrypoint debug shape', () => {
    const fixture = readParityFixtures().find((entry) => entry.id === 'asset-ops');
    expect(fixture).toBeTruthy();
    expect(fixture?.rust.kind).toBe('success');

    const compiled = compileKotodamaStudioProgram(fixture!.source, { sourceName: fixture!.source_name });
    const artifactCompiled = compileKotodamaStudioProgram(fixture!.source, {
      sourceName: fixture!.compiler_source_path ?? fixture!.source_name,
    });
    expect(compiled.diagnostics).toEqual([]);
    expect(artifactCompiled.diagnostics).toEqual([]);

    const browserEntry = compiled.sourceMap.find((entry) => entry.function_name === 'execute');
    const rustEntry = fixture!.rust.kind === 'success'
      ? fixture!.rust.source_map.find((entry) => entry.function_name === 'execute')
      : null;
    const browserEntryBudget = compiled.budgetReport.find((entry) => entry.function_name === 'execute');
    const rustEntryBudget = fixture!.rust.kind === 'success'
      ? fixture!.rust.budget_report.find((entry) => entry.function_name === 'execute')
      : null;

    expect(browserEntry).toEqual(expect.objectContaining({
      function_name: rustEntry?.function_name,
      pc_start: rustEntry?.pc_start,
      source_path: rustEntry?.source_path,
      line: rustEntry?.line,
      column: rustEntry?.column,
    }));
    expect(browserEntryBudget).toEqual(expect.objectContaining({
      function_name: rustEntryBudget?.function_name,
      pc_start: rustEntryBudget?.pc_start,
      source_path: rustEntryBudget?.source_path,
      line: rustEntryBudget?.line,
      column: rustEntryBudget?.column,
    }));
    expect(artifactCompiled.manifest?.entrypoints[0]?.name).toBe('execute');
  });

  it('keeps mint-rose-trigger compiling against the refreshed rust corpus', () => {
    const fixture = readParityFixtures().find((entry) => entry.id === 'mint-rose-trigger');
    expect(fixture).toBeTruthy();
    expect(fixture?.rust.kind).toBe('success');

    const compiled = compileKotodamaStudioProgram(fixture!.source, {
      sourceName: fixture!.compiler_source_path ?? fixture!.source_name,
    });

    expect(compiled.diagnostics).toEqual([]);
    if (fixture?.rust.kind === 'success') {
      expect(compiled.sourceMap.map((entry) => entry.function_name)).toEqual(
        fixture.rust.source_map.map((entry) => entry.function_name)
      );
      expect(compiled.manifest?.entrypoints.map((entry) => entry.name)).toEqual(
        (fixture.rust.manifest as { entrypoints?: Array<{ name: string }> }).entrypoints?.map((entry) => entry.name)
      );
    }
  });

  it('keeps the smallest trigger fixtures on the current direct-entrypoint shape', () => {
    const allFixtures = readParityFixtures();
    const fixtures = ['create-nft-for-every-user-trigger', 'trigger-cat-and-mouse']
      .map((id) => findParityFixture(allFixtures, id));

    expect(fixtures).toHaveLength(2);

    for (const fixture of fixtures) {
      expectSmallDirectFixtureRowsToMatchRust(fixture);
    }
  });

  it('matches rust debug rows for direct literal and account-detail fixtures', () => {
    const allFixtures = readParityFixtures();
    const fixtures = [
      'asset-ops',
      'authority-probe',
      'domain-ops',
      'ivm-smoke',
      'query-assets-and-save-cursor',
      'smart-contract-can-filter-queries',
    ]
      .map((id) => findParityFixture(allFixtures, id));

    for (const fixture of fixtures) {
      expectFixtureDebugRowsToMatchRust(fixture);
    }
  });

  it('keeps standalone helper-call fixtures compiling with rust function ordering', () => {
    const allFixtures = readParityFixtures();
    const fixtures = [
      'dex-contract',
      'dex-simple',
      'irohaswap',
      'kotodama-jp',
      'lending-simple',
      'perp-funding',
      'stablecoin-simple',
      'tuple-return-demo',
      'zk-vote-and-unshield',
    ]
      .map((id) => findParityFixture(allFixtures, id));

    for (const fixture of fixtures) {
      const rust = expectRustSuccess(fixture);
      const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });

      expect(compiled.diagnostics, fixture.id).toEqual([]);
      expect(compiled.sourceMap.map((entry) => entry.function_name), fixture.id).toEqual(
        rust.source_map.map((entry) => entry.function_name)
      );
    }
  });

  it('reports remaining success fixtures whose rust debug rows still drift', () => {
    const drifting = readParityFixtures()
      .filter((fixture) => fixture.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
        if (compiled.diagnostics.length > 0) return [`${fixture.id}: browser compile failed`];
        if (isDeepStrictEqual(compiled.sourceMap, rust.source_map) && isDeepStrictEqual(compiled.budgetReport, rust.budget_report)) {
          return [];
        }
        return [fixture.id];
      });

    expect(drifting).toEqual(EXPECTED_DEBUG_DRIFT);
  });

  it('reports remaining success fixtures whose non-hash manifest metadata still drifts', () => {
    const drifting = readParityFixtures()
      .filter((entry) => entry.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });

        if (compiled.diagnostics.length > 0) return [`${fixture.id}: browser compile failed`];
        expect(compiled.manifest, fixture.id).not.toBeNull();
        expect(rust.manifest, fixture.id).not.toBeNull();
        if (isDeepStrictEqual(manifestWithoutArtifactHashes(compiled.manifest), manifestWithoutArtifactHashes(rust.manifest))) {
          return [];
        }

        return [fixture.id];
      });

    expect(drifting).toEqual(EXPECTED_MANIFEST_DRIFT);
  });

  it('matches rust manifest code and ABI hashes for every successful rust fixture', () => {
    const drifting = readParityFixtures()
      .filter((entry) => entry.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });

        if (compiled.diagnostics.length > 0) return [`${fixture.id}: browser compile failed`];
        expect(compiled.manifest, fixture.id).not.toBeNull();
        expect(rust.manifest, fixture.id).not.toBeNull();
        if (
          compiled.manifest?.code_hash === rust.manifest?.code_hash
          && compiled.manifest?.abi_hash === rust.manifest?.abi_hash
        ) {
          return [];
        }

        return [`${fixture.id}: manifest hash drift`];
      });

    expect(drifting).toEqual([]);
  });

  it('matches the rust IVM artifact header and first section tag for success fixtures', () => {
    const drifting = readParityFixtures()
      .filter((entry) => entry.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
        const rustArtifact = Buffer.from(rust.artifact_b64, 'base64');

        if (compiled.diagnostics.length > 0) return [`${fixture.id}: browser compile failed`];
        return Buffer.from(compiled.artifactBytes.slice(0, 21)).equals(rustArtifact.subarray(0, 21))
          ? []
          : [fixture.id];
      });

    expect(drifting).toEqual([]);
  });

  it('matches exact rust artifacts for every successful rust fixture', () => {
    const fixtures = readParityFixtures().filter((fixture) => fixture.rust.kind === 'success');

    for (const fixture of fixtures) {
      const rust = expectRustSuccess(fixture);
      const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
      const rustArtifact = Buffer.from(rust.artifact_b64, 'base64');

      expect(compiled.diagnostics, fixture.id).toEqual([]);
      expect(Buffer.from(compiled.artifactBytes), fixture.id).toEqual(rustArtifact);
      expect(compiled.codeHashHex.toUpperCase(), fixture.id).toBe(
        (rust.manifest?.code_hash ?? '').replace(/^hash:/u, '').replace(/#.*/u, '')
      );
    }
  });

  it('reports remaining success fixtures whose CNTR metadata bytes still drift', () => {
    const drifting = readParityFixtures()
      .filter((entry) => entry.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
        const browserCntr = readArtifactSection(compiled.artifactBytes, 17);
        const rustCntr = readArtifactSection(Buffer.from(rust.artifact_b64, 'base64'), 17);

        expect(compiled.diagnostics, fixture.id).toEqual([]);
        expect(browserCntr.tag, fixture.id).toBe('CNTR');
        expect(rustCntr.tag, fixture.id).toBe('CNTR');

        return browserCntr.bytes.equals(rustCntr.bytes) ? [] : [fixture.id];
      });

    expect(drifting).toEqual(EXPECTED_CNTR_DRIFT);
  });

  it('reports remaining success fixtures whose LTLB literal table bytes still drift', () => {
    const drifting = readParityFixtures()
      .filter((entry) => entry.rust.kind === 'success')
      .flatMap((fixture) => {
        const rust = expectRustSuccess(fixture);
        const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
        const browserLtlb = readArtifactSectionByTag(compiled.artifactBytes, 'LTLB');
        const rustLtlb = readArtifactSectionByTag(Buffer.from(rust.artifact_b64, 'base64'), 'LTLB');

        expect(compiled.diagnostics, fixture.id).toEqual([]);

        return Buffer.from(browserLtlb ?? []).equals(Buffer.from(rustLtlb ?? []))
          ? []
          : [fixture.id];
      });

    expect(drifting).toEqual(EXPECTED_LTLB_DRIFT);
  });

  it('matches exact rust CNTR metadata for fixtures with compact-only interfaces', () => {
    const fixtureIds = [
      'create-nft-for-every-user-trigger',
      'trigger-cat-and-mouse',
      'tuple-return-demo',
    ];
    const fixtures = fixtureIds.map((id) => findParityFixture(readParityFixtures(), id));

    for (const fixture of fixtures) {
      const rust = expectRustSuccess(fixture);
      const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
      const rustArtifact = Buffer.from(rust.artifact_b64, 'base64');
      const browserCntr = readArtifactSection(compiled.artifactBytes, 17);
      const rustCntr = readArtifactSection(rustArtifact, 17);

      expect(compiled.diagnostics, fixture.id).toEqual([]);
      expect(browserCntr.tag, fixture.id).toBe('CNTR');
      expect(browserCntr.bytes, fixture.id).toEqual(rustCntr.bytes);
    }
  });

  it('matches the rust impl debug rows for authority-probe', () => {
    const fixture = readParityFixtures().find((entry) => entry.id === 'authority-probe');
    expect(fixture).toBeTruthy();
    expect(fixture?.rust.kind).toBe('success');

    const compiled = compileKotodamaStudioProgram(fixture!.source, {
      sourceName: fixture!.source_name,
    });

    expect(compiled.diagnostics).toEqual([]);

    const browserImpl = compiled.sourceMap.find((entry) => entry.function_name === 'main');
    const rustImpl = fixture!.rust.kind === 'success'
      ? fixture!.rust.source_map.find((entry) => entry.function_name === 'main')
      : null;
    const browserBudget = compiled.budgetReport.find((entry) => entry.function_name === 'main');
    const rustBudget = fixture!.rust.kind === 'success'
      ? fixture!.rust.budget_report.find((entry) => entry.function_name === 'main')
      : null;

    expect(browserImpl).toEqual(expect.objectContaining({
      function_name: rustImpl?.function_name,
      pc_start: rustImpl?.pc_start,
      source_path: rustImpl?.source_path,
      line: rustImpl?.line,
      column: rustImpl?.column,
    }));
    expect(browserBudget).toEqual(expect.objectContaining({
      function_name: rustBudget?.function_name,
      pc_start: rustBudget?.pc_start,
      source_path: rustBudget?.source_path,
      line: rustBudget?.line,
      column: rustBudget?.column,
    }));
  });

  it('matches the rust impl debug rows for authority-probe on the raw compiler source path too', () => {
    const fixture = findParityFixture(readParityFixtures(), 'authority-probe');
    expect(fixture.rust.kind).toBe('success');
    if (fixture.rust.kind !== 'success') {
      throw new Error('authority-probe fixture unexpectedly stopped compiling under Rust.');
    }

    const compilerSourcePath = fixture.compiler_source_path ?? fixture.source_name;

    const compiled = compileKotodamaStudioProgram(fixture.source, {
      sourceName: compilerSourcePath,
    });

    expect(compiled.diagnostics).toEqual([]);

    const browserImpl = compiled.sourceMap.find((entry) => entry.function_name === 'main');
    const rustImplBase = fixture.rust.source_map.find((entry) => entry.function_name === 'main');
    expect(rustImplBase).toBeTruthy();
    const rustImpl = {
      ...rustImplBase!,
      source_path: compilerSourcePath,
    };
    const browserBudget = compiled.budgetReport.find((entry) => entry.function_name === 'main');
    const rustBudgetBase = fixture.rust.budget_report.find((entry) => entry.function_name === 'main');
    expect(rustBudgetBase).toBeTruthy();
    const rustBudget = {
      ...rustBudgetBase!,
      source_path: compilerSourcePath,
    };

    expect(browserImpl).toEqual(expect.objectContaining({
      function_name: rustImpl?.function_name,
      pc_start: rustImpl?.pc_start,
      source_path: rustImpl?.source_path,
      line: rustImpl?.line,
      column: rustImpl?.column,
    }));
    expect(browserBudget).toEqual(expect.objectContaining({
      function_name: rustBudget?.function_name,
      pc_start: rustBudget?.pc_start,
      source_path: rustBudget?.source_path,
      line: rustBudget?.line,
      column: rustBudget?.column,
    }));
  });

  it('matches rust debug rows for threshold-escrow guard helpers', () => {
    const fixture = findParityFixture(readParityFixtures(), 'threshold-escrow');
    expect(fixture.rust.kind).toBe('success');
    if (fixture.rust.kind !== 'success') {
      throw new Error('threshold-escrow fixture unexpectedly stopped compiling under Rust.');
    }

    const compiled = compileKotodamaStudioProgram(fixture.source, { sourceName: fixture.source_name });
    const helperNames = new Set([
      'assert_unopened',
      'assert_open',
      'assert_payer',
    ]);

    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.sourceMap.filter((entry) => helperNames.has(entry.function_name))).toEqual(
      fixture.rust.source_map.filter((entry) => helperNames.has(entry.function_name))
    );
    expect(compiled.budgetReport.filter((entry) => helperNames.has(entry.function_name))).toEqual(
      fixture.rust.budget_report.filter((entry) => helperNames.has(entry.function_name))
    );
  });

  it('keeps authority-probe manifest identity aligned with rust', () => {
    const fixture = readParityFixtures().find((entry) => entry.id === 'authority-probe');
    expect(fixture).toBeTruthy();
    expect(fixture?.rust.kind).toBe('success');

    const compiled = compileKotodamaStudioProgram(fixture!.source, {
      sourceName: fixture!.compiler_source_path ?? fixture!.source_name,
    });

    expect(compiled.diagnostics).toEqual([]);
    if (fixture?.rust.kind !== 'success') {
      throw new Error('authority-probe fixture unexpectedly stopped compiling under Rust.');
    }
    expect(compiled.manifest?.entrypoints.map((entry) => entry.name)).toEqual(
      (fixture.rust.manifest as { entrypoints?: Array<{ name: string }> }).entrypoints?.map((entry) => entry.name)
    );
  });

  it('matches the rust authority-probe meaningful disassembly through compare and account-detail bodies', () => {
    const fixture = readParityFixtures().find((entry) => entry.id === 'authority-probe');
    expect(fixture).toBeTruthy();
    expect(fixture?.rust.kind).toBe('success');

    const compiled = compileKotodamaStudioProgram(fixture!.source, {
      sourceName: fixture!.compiler_source_path ?? fixture!.source_name,
    });

    expect(compiled.diagnostics).toEqual([]);
    if (fixture?.rust.kind !== 'success') {
      throw new Error('authority-probe fixture unexpectedly stopped compiling under Rust.');
    }
    expect(compiled.manifest).not.toBeNull();
    expect(fixture.rust.manifest).not.toBeNull();

    const browserView = buildContractViewFromArtifact(compiled.artifactBytes, compiled.codeHashHex, compiled.manifest);
    const rustArtifact = Uint8Array.from(Buffer.from(fixture.rust.artifact_b64, 'base64'));
    const rustManifest = fixture.rust.manifest as unknown as { code_hash: string };
    const rustCodeHash = rustManifest.code_hash.replace(/^hash:/u, '').replace(/#.*/u, '');
    const rustView = buildContractViewFromArtifact(rustArtifact, rustCodeHash, rustManifest);

    const browserInstructions = extractAuthorityProbeMeaningfulInstructions(browserView?.rendered_source_text ?? '');
    const rustInstructions = extractAuthorityProbeMeaningfulInstructions(rustView?.rendered_source_text ?? '');
    expect(browserInstructions).toContain('scall 0xa4 ; GET_AUTHORITY');
    expect(browserInstructions.filter((line) => line.includes('SET_ACCOUNT_DETAIL'))).toHaveLength(
      rustInstructions.filter((line) => line.includes('SET_ACCOUNT_DETAIL')).length
    );
  });

});

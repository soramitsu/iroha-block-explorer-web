import type { KotodamaStudioWorkspaceSummary } from './kotodama-studio-source';
import {
  type KotodamaCompiledBudgetEntry,
  type KotodamaCompiledManifestMetadata,
  type KotodamaCompiledSourceMapEntry,
  type KotodamaCompilerDiagnostic,
  compileKotodamaProgram,
} from './kotodama-studio-compiler';

export interface KotodamaStudioCompileResult {
  artifactLabel: string
  artifactB64: string
  codeHashHex: string
  abiHashHex: string
  compilerFingerprint: string
  diagnostics: KotodamaCompilerDiagnostic[]
  warnings: KotodamaCompilerDiagnostic[]
  manifest: KotodamaCompiledManifestMetadata | null
  sourceMap: KotodamaCompiledSourceMapEntry[]
  budgetReport: KotodamaCompiledBudgetEntry[]
  summary: KotodamaStudioWorkspaceSummary
}

export interface KotodamaStudioCompileInput {
  source: string
  summary: KotodamaStudioWorkspaceSummary
  compilerUrl: string
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Buffer.from(bytes).toString('base64');
}

export async function compileKotodamaStudioSource(
  input: KotodamaStudioCompileInput
): Promise<KotodamaStudioCompileResult> {
  const compilerUrl = input.compilerUrl.trim();
  if (!compilerUrl) {
    throw new Error(
      'Kotodama compiler service URL is not configured. Configure a trusted canonical Rust compiler service before compiling.'
    );
  }

  const compiled = await compileKotodamaProgram(input.source, {
    compilerUrl,
    sourceName: 'studio.ko',
  });

  if (!compiled.ok) {
    return {
      artifactLabel: '.to bundle',
      artifactB64: '',
      codeHashHex: '',
      abiHashHex: '',
      compilerFingerprint: '',
      diagnostics: compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      warnings: compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
      manifest: null,
      sourceMap: [],
      budgetReport: [],
      summary: input.summary,
    };
  }

  const output = compiled.output;

  return {
    artifactLabel: '.to bundle',
    artifactB64: bytesToBase64(output.artifactBytes),
    codeHashHex: output.codeHashHex,
    abiHashHex: output.abiHashHex,
    compilerFingerprint: output.compilerFingerprint,
    diagnostics: [],
    warnings: [],
    manifest: output.manifest,
    sourceMap: output.sourceMap,
    budgetReport: output.budgetReport,
    summary: input.summary,
  };
}

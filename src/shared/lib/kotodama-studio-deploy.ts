import type { KotodamaStudioWorkspaceSummary } from './kotodama-studio-source';
import {
  type KotodamaStudioCompiledBudgetEntry,
  compileKotodamaStudioProgram,
  type KotodamaStudioCompiledManifestMetadata,
  type KotodamaStudioCompilerDiagnostic,
  type KotodamaStudioCompiledSourceMapEntry,
} from './kotodama-studio-compiler';

export interface KotodamaStudioCompileResult {
  artifactLabel: string
  artifactB64: string
  codeHashHex: string
  abiHashHex: string
  compilerFingerprint: string
  diagnostics: KotodamaStudioCompilerDiagnostic[]
  warnings: KotodamaStudioCompilerDiagnostic[]
  manifest: KotodamaStudioCompiledManifestMetadata | null
  sourceMap: KotodamaStudioCompiledSourceMapEntry[]
  budgetReport: KotodamaStudioCompiledBudgetEntry[]
  summary: KotodamaStudioWorkspaceSummary
}

export interface KotodamaStudioCompileInput {
  source: string
  summary: KotodamaStudioWorkspaceSummary
}

export interface KotodamaStudioToriiDeployRequest {
  endpoint: '/v1/contracts/deploy'
  authority: string
  code_b64: string
  dataspace?: string
}

export interface KotodamaStudioDeployDraft {
  authority: string
  chainId: string
  dataspace: string
  codeHashHex: string
  abiHashHex: string
  deployMode: 'torii_contracts_deploy_v1'
  toriiRequest: KotodamaStudioToriiDeployRequest
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
  const compiled = compileKotodamaStudioProgram(input.source, { sourceName: 'studio.ko' });

  return {
    artifactLabel: '.to bundle',
    artifactB64: bytesToBase64(compiled.artifactBytes),
    codeHashHex: compiled.codeHashHex,
    abiHashHex: compiled.abiHashHex,
    compilerFingerprint: compiled.compilerFingerprint,
    diagnostics: compiled.diagnostics,
    warnings: compiled.warnings,
    manifest: compiled.manifest,
    sourceMap: compiled.sourceMap,
    budgetReport: compiled.budgetReport,
    summary: input.summary,
  };
}

export function buildKotodamaStudioDeployDraft(options: {
  authority: string
  chainId: string
  dataspace: string
  compileResult: KotodamaStudioCompileResult
}): KotodamaStudioDeployDraft {
  if (options.compileResult.manifest === null) {
    throw new Error('Cannot build a deploy draft without a successful local compiler manifest.');
  }

  const normalizedDataspace = options.dataspace.trim();
  const resolvedDataspace = normalizedDataspace.length > 0 ? normalizedDataspace : 'universal';
  const includeDataspace = normalizedDataspace.length > 0 && normalizedDataspace.toLowerCase() !== 'universal';

  return {
    authority: options.authority,
    chainId: options.chainId,
    dataspace: resolvedDataspace,
    codeHashHex: options.compileResult.codeHashHex,
    abiHashHex: options.compileResult.abiHashHex,
    deployMode: 'torii_contracts_deploy_v1',
    toriiRequest: {
      endpoint: '/v1/contracts/deploy',
      authority: options.authority,
      code_b64: options.compileResult.artifactB64,
      ...(includeDataspace ? { dataspace: resolvedDataspace } : {}),
    },
  };
}

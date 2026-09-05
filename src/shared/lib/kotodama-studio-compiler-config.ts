import { getRuntimeConfig } from '@/shared/runtime-config';

export function resolveKotodamaCompilerUrl(
  runtimeValue: string | undefined,
  buildTimeValue: string | undefined
): string | null {
  const runtimeUrl = runtimeValue?.trim();
  if (runtimeUrl) return runtimeUrl;

  const buildTimeUrl = buildTimeValue?.trim();
  return buildTimeUrl || null;
}

export function getKotodamaCompilerUrl(): string | null {
  return resolveKotodamaCompilerUrl(
    getRuntimeConfig().kotodamaCompilerUrl,
    import.meta.env.VITE_KOTODAMA_COMPILER_URL
  );
}

import { z } from 'zod';
import { NetworkPrefixSchema, requireNetworkPrefix } from '@/shared/lib/network-prefix';
import { isCanonicalIrohaHashLiteral32 } from '@/shared/lib/iroha-hash';

const CheckedNetworkIdSchema = z.string().refine(isCanonicalIrohaHashLiteral32);

const RuntimeConfigSchema = z
  .object({
    toriiBaseUrl: z.string().trim().min(1).optional(),
    networkId: CheckedNetworkIdSchema.optional(),
    networkPrefix: NetworkPrefixSchema,
    kotodamaCompilerUrl: z.string().trim().min(1).optional(),
    sorafsPublicBaseUrl: z.string().trim().min(1).optional(),
    toriiForceBaseUrl: z.boolean().optional(),
    toriiEconometricsEndpointsEnabled: z.boolean().optional(),
    toriiFailoverEnabled: z.boolean().optional(),
    toriiFailoverNodes: z.array(z.string().trim().min(1)).optional(),
    toriiFailoverFailureThreshold: z.number().int().min(1).optional(),
    toriiFailoverWindowMs: z.number().int().min(1).optional(),
    toriiFailoverProbeTimeoutMs: z.number().int().min(1).optional(),
    toriiFailoverPersistSwitch: z.boolean().optional(),
    toriiFailoverMaxPeerCandidates: z.number().int().min(1).optional(),
    toriiRequestTimeoutMs: z.number().int().min(1).optional(),
    toriiRequestRetryCount: z.number().int().min(0).optional(),
    toriiRequestRetryBaseDelayMs: z.number().int().min(0).optional(),
  })
  .strict();

// Both public explorers bind to the same authoritative Taira API. Keeping the
// deployment profile exact also rules out stored-node and failover overrides.
const TairaRuntimeConfigSchema = z
  .object({
    toriiBaseUrl: z.literal('https://taira.sora.org'),
    toriiForceBaseUrl: z.literal(true),
    networkId: CheckedNetworkIdSchema,
    networkPrefix: z.literal(369),
  })
  .strict();

// The CBSI Explorer is a separate public application. Its node is the
// operator-designated Bokolo Torii origin, with an identity and address prefix
// supplied by authenticated CBSI deployment metadata rather than copied from
// the public Taira profile.
const CbsiRuntimeConfigSchema = z
  .object({
    toriiBaseUrl: z.literal('https://bokolo.soramitsu.io'),
    toriiForceBaseUrl: z.literal(true),
    networkId: CheckedNetworkIdSchema,
    networkPrefix: NetworkPrefixSchema,
  })
  .strict();

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

const CONFIGURATION_ERROR_MESSAGE = 'Explorer runtime configuration is unavailable or invalid.';
let runtimeConfig: Partial<RuntimeConfig> = {};
let loadPromise: Promise<RuntimeConfig> | null = null;

export function getRuntimeConfig(): Partial<RuntimeConfig> {
  return runtimeConfig;
}

export function getRuntimeNetworkPrefix(): number {
  return requireNetworkPrefix(runtimeConfig.networkPrefix);
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof window === 'undefined') throw new Error(CONFIGURATION_ERROR_MESSAGE);

    const baseUrl = String(import.meta.env.BASE_URL ?? '/');
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const primaryUrl = `${normalizedBaseUrl}config.json`;
    const requiresTairaProfile = ['taira-explorer.sora.org', 'explorer-bpng.soramitsu.io']
      .includes(window.location.hostname);
    const schema = requiresTairaProfile
      ? TairaRuntimeConfigSchema
      : window.location.hostname === 'bokolo-explorer.soramitsu.io'
        ? CbsiRuntimeConfigSchema
        : RuntimeConfigSchema;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(primaryUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(CONFIGURATION_ERROR_MESSAGE);

      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new Error(CONFIGURATION_ERROR_MESSAGE);

      runtimeConfig = parsed.data;
      return parsed.data;
    } catch {
      // Never expose response bodies, schema inputs, or transport error details.
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  try {
    return await loadPromise;
  } catch (error) {
    // Failed loads are not a cached success: explicit retries fetch the same
    // configured location again without selecting another blockchain endpoint.
    loadPromise = null;
    throw error;
  }
}

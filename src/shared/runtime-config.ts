import { z } from 'zod';

const RuntimeConfigSchema = z
  .object({
    toriiBaseUrl: z.string().trim().min(1).optional(),
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
    toriiApiVersionHeaderEnabled: z.boolean().optional(),
  })
  .passthrough();

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

let runtimeConfig: RuntimeConfig = {};
let loadPromise: Promise<RuntimeConfig> | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (typeof window === 'undefined') return runtimeConfig;

    const baseUrl = String(import.meta.env.BASE_URL ?? '/');
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const primaryUrl = `${normalizedBaseUrl}config.json`;
    const candidates = primaryUrl === '/config.json' ? [primaryUrl] : [primaryUrl, '/config.json'];

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    try {
      for (const url of candidates) {
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) continue;

        const json = await res.json();
        const parsed = RuntimeConfigSchema.safeParse(json);
        if (!parsed.success) return runtimeConfig;

        runtimeConfig = parsed.data;
        return runtimeConfig;
      }

      return runtimeConfig;
    } catch {
      return runtimeConfig;
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  return loadPromise;
}

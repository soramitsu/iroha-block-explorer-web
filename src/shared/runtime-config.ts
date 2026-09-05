import { z } from 'zod';
import { NetworkId } from '@iroha/iroha-js/browser';

const NetworkIdLiteralSchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    try {
      NetworkId.parse(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid NetworkId',
      });
    }
  });

const ToriiBaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((value, ctx) => {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', message: 'Torii base URL must use HTTP or HTTPS' });
      }
      if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
        ctx.addIssue({
          code: 'custom',
          message: 'Torii base URL must be an origin without credentials, a path, query, or fragment',
        });
      }
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Torii base URL must be an absolute URL' });
    }
  });

const RuntimeConfigSchema = z
  .object({
    networkId: NetworkIdLiteralSchema.optional(),
    toriiBaseUrl: ToriiBaseUrlSchema.optional(),
    kotodamaCompilerUrl: z.string().trim().min(1).optional(),
    toriiForceBaseUrl: z.boolean().optional(),
    toriiFailoverEnabled: z.boolean().optional(),
    toriiFailoverNodes: z.array(ToriiBaseUrlSchema).optional(),
    toriiFailoverFailureThreshold: z.number().int().min(1).optional(),
    toriiFailoverWindowMs: z.number().int().min(1).optional(),
    toriiFailoverProbeTimeoutMs: z.number().int().min(1).optional(),
    toriiFailoverPersistSwitch: z.boolean().optional(),
    toriiRequestTimeoutMs: z.number().int().min(1).optional(),
    toriiRequestRetryCount: z.number().int().min(0).optional(),
    toriiRequestRetryBaseDelayMs: z.number().int().min(0).optional(),
  })
  .strict();

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

let runtimeConfig: RuntimeConfig = {};
let loadPromise: Promise<RuntimeConfig> | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig;
}

export async function loadRuntimeConfig(
  options: { required?: boolean } = {}
): Promise<RuntimeConfig> {
  if (loadPromise) return loadPromise;
  const required = options.required ?? import.meta.env.PROD;

  loadPromise = (async () => {
    if (typeof window === 'undefined') return runtimeConfig;

    const baseUrl = String(import.meta.env.BASE_URL ?? '/');
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const configUrl = `${normalizedBaseUrl}config.json`;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);

    try {
      const res = await fetch(configUrl, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) {
        if (required) throw new Error(`Runtime config request failed with HTTP ${res.status}`);
        return runtimeConfig;
      }

      const json = await res.json();
      const parsed = RuntimeConfigSchema.safeParse(json);
      if (!parsed.success) {
        if (required) throw new Error(`Runtime config is invalid: ${parsed.error.message}`);
        return runtimeConfig;
      }
      if (required && (!parsed.data.networkId || !parsed.data.toriiBaseUrl)) {
        throw new Error('Production runtime config requires exact networkId and toriiBaseUrl values');
      }

      runtimeConfig = parsed.data;
      return runtimeConfig;
    } catch (error) {
      if (required) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to load required runtime config from ${configUrl}: ${message}`, { cause: error });
      }
      return runtimeConfig;
    } finally {
      window.clearTimeout(timeout);
    }
  })();

  return loadPromise;
}

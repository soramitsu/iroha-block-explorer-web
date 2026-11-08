import * as connectBrowserSdk from '@iroha/iroha-js/connect-browser';
import type { BrowserConnectAppSessionOptions as ConnectAppSessionOptions, BrowserConnectAppSession as ConnectAppSession, BrowserConnectCanonicalRequestAuth as ConnectCanonicalRequestAuth, BrowserConnectSessionPreviewOptions as ConnectSessionPreviewOptions, BrowserConnectSessionPreview as ConnectSessionPreview, BrowserConnectSessionResponse as ConnectSessionResponse } from '@iroha/iroha-js/connect-browser';
import { ToriiBrowserClient } from '@iroha/iroha-js/torii-browser';
import { getRuntimeConfig } from '@/shared/runtime-config';

export {
  buildConnectTokenProtocol,
  buildConnectWebSocketUrl,
  ConnectApprovalRejectedError,
  ConnectSessionClosedError,
  ConnectSignRequestError,
  rewriteConnectUriProtocol,
  TORII_CANONICAL_REQUEST_DOMAIN_TAG,
} from '@iroha/iroha-js/connect-browser';

export type {
  BrowserConnectAppSession as ConnectAppSession,
  BrowserConnectApproval as ConnectApproval,
  BrowserConnectAppSessionOptions as ConnectAppSessionOptions,
  BrowserConnectBinaryLike as ConnectBinaryLike,
  BrowserConnectCanonicalRequestAuth as ConnectCanonicalRequestAuth,
  BrowserConnectPermissions as ConnectPermissions,
  BrowserConnectSessionPreview as ConnectSessionPreview,
  BrowserConnectSessionPreviewOptions as ConnectSessionPreviewOptions,
  BrowserConnectSessionResponse as ConnectSessionResponse,
} from '@iroha/iroha-js/connect-browser';

export type ConnectNetworkId = connectBrowserSdk.NetworkId;
export type ConnectSdkNamespace = Pick<typeof connectBrowserSdk, 'NetworkId' | 'createConnectSessionPreview' | 'registerConnectSession' | 'createConnectAppSession' | 'createConnectCanonicalRequestAuth'>;

function configuredNetworkIdLiteral(): string | null {
  return getRuntimeConfig().networkId ?? null;
}

export function parseConnectNetworkId(
  literal: string,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectNetworkId {
  const exactLiteral = literal.trim();
  if (!exactLiteral) throw new Error('An exact Iroha NetworkId is required for Connect.');
  if (exactLiteral !== literal) throw new Error('Iroha NetworkId must not contain surrounding whitespace.');
  const parsed = sdkNamespace.NetworkId.parse(exactLiteral);
  if (parsed.toString() !== exactLiteral) {
    throw new Error('Iroha NetworkId is not in canonical emitted form.');
  }
  return parsed;
}

export type ConnectConfiguration =
  | { available: true, literal: string, networkId: ConnectNetworkId }
  | { available: false, error: Error };

export function getConnectConfiguration(
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectConfiguration {
  try {
    const literal = configuredNetworkIdLiteral();
    if (!literal) {
      return {
        available: false,
        error: new Error('Connect is disabled until an exact Iroha NetworkId is configured.'),
      };
    }
    return {
      available: true,
      literal,
      networkId: parseConnectNetworkId(literal, sdkNamespace),
    };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export function createConnectSessionPreview(
  options: ConnectSessionPreviewOptions,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectSessionPreview {
  return sdkNamespace.createConnectSessionPreview(options);
}

export async function registerConnectSession(
  baseUrl: string,
  preview: ConnectSessionPreview,
  options: { node?: string | null, fetchImpl?: typeof fetch } = {},
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): Promise<ConnectSessionResponse> {
  return await sdkNamespace.registerConnectSession(baseUrl, preview, options);
}

export function createConnectAppSession(
  options: ConnectAppSessionOptions,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): ConnectAppSession {
  const identityClient = new ToriiBrowserClient(options.baseUrl, {
    networkId: connectBrowserSdk.NetworkId.parse(options.preview.networkId.toString()),
  });
  return sdkNamespace.createConnectAppSession({
    ...options,
    inspectAccountIdentity: (accountId, { signal }) => identityClient.inspectAccountIdentity(accountId, { signal }),
  });
}

export async function createConnectCanonicalRequestAuth(
  session: Pick<ConnectAppSession, 'waitForApproval' | 'signRaw'>,
  sdkNamespace: ConnectSdkNamespace = connectBrowserSdk
): Promise<ConnectCanonicalRequestAuth> {
  return await sdkNamespace.createConnectCanonicalRequestAuth(session);
}

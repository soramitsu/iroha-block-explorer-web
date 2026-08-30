import { expect, test } from 'vitest';
import { resolveApiBaseUrl } from '@/shared/api';

test('resolveApiBaseUrl defaults to the legacy same-origin explorer API path', () => {
  expect(resolveApiBaseUrl(undefined, 'https://taira-explorer.sora.org/')).toBe(
    'https://taira-explorer.sora.org/api/v1'
  );
});

test('resolveApiBaseUrl preserves explicit TAIRA explorer API deployments', () => {
  expect(resolveApiBaseUrl('/v1/explorer/', 'https://taira-explorer.sora.org')).toBe(
    'https://taira-explorer.sora.org/v1/explorer'
  );
});

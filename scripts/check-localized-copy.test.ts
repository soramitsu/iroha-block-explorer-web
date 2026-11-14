// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { checkLocalizedCopy, findingsForTemplate } from './check-localized-copy.mjs';

describe('localized TypeScript UI copy contract', () => {
  it('contains no unreviewed user-facing string construction', async () => {
    await expect(checkLocalizedCopy()).resolves.toEqual([]);
  });

  it('rejects user-facing prose constructed inside a template interpolation', () => {
    const constructed = String.fromCodePoint(36) + '{item.timestamp_ms} ms';
    const source = '<template><span>{{ `' + constructed + '` }}</span></template>';

    expect(findingsForTemplate('src/Example.vue', source)).toEqual([expect.objectContaining({ value: constructed })]);
  });

  it('rejects raw API diagnostics interpolated into localized UI', () => {
    const source = "<template><span>{{ $t('errors.load', { message: itemResource.error.message }) }}</span></template>";

    expect(findingsForTemplate('src/Example.vue', source)).toEqual([
      expect.objectContaining({ value: 'itemResource.error.message' }),
    ]);
  });
});

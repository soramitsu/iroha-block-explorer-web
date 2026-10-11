import { describe, expect, it } from 'vitest';
import { NexusDataspaceCatalogEntry } from './schemas';

describe('public dataspace catalog policy', () => {
  const registered = { lane_id: 3, dataspace_id: '9884542487407331249', alias: 'dpn' };

  it('retains exact u64 identity and authoritative public manifest observations', () => {
    expect(NexusDataspaceCatalogEntry.parse({
      ...registered,
      visibility: 'restricted',
      manifest_required: true,
      manifest_ready: true,
      manifest_path: '/manifests/dpn.manifest.json',
    })).toMatchObject({
      ...registered,
      visibility: 'restricted',
      manifest_required: true,
      manifest_ready: true,
      manifest_path: '/manifests/dpn.manifest.json',
    });
  });

  it('does not fabricate policy or operator observations when fields are absent', () => {
    const parsed = NexusDataspaceCatalogEntry.parse(registered);
    expect(parsed).not.toHaveProperty('visibility');
    expect(parsed).not.toHaveProperty('manifest_required');
    expect(parsed).not.toHaveProperty('manifest_ready');
    expect(parsed).not.toHaveProperty('quorum');
    expect(parsed).not.toHaveProperty('validator_ids');
  });

  it.each([
    { visibility: 'private' },
    { manifest_required: 'true' },
    { manifest_ready: 1 },
    { manifest_path: 123 },
  ])('rejects malformed public policy rather than treating it as a truthy flag', (invalid) => {
    expect(NexusDataspaceCatalogEntry.safeParse({ ...registered, ...invalid }).success).toBe(false);
  });
});

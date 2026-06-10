import { describe, expect, it } from 'vitest';
import {
  buildSorafsPublicFileUrl,
  decodeSorafsContentCid,
  encodeSorafsContentCid,
  resolveSorafsPublicBaseUrl,
  sorafsContentCidToHex,
  sorafsFilePathLabel,
  sorafsManifestBase64ToRootCid,
} from './sorafs';

const SAMPLE_ROOT_CID_HEX = '01711f2013800cd0a328f2712fc9704b6723885bc602586f544883e146b3aa341b7b9f2a';
const SAMPLE_ROOT_CID = 'bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi';
const SAMPLE_MANIFEST_B64 =
  'TlJUMAAAt3Qx1Tzz0Na3dDHVPPPQ1gBeAwAAAAAAABD2CBUt0AEZAAEAAAAAAAAAASwAAAAAAAAAJAAAAAAAAAABcR8gE4AM0KMo8nEvyXBLZyOIW8YCWG9USIPhRrOqNBt7nyoQAAAAAAAAAAgAAAAAAAAAcQAAAAAAAADcAAAAAAAAAAwAAAAAAAAABAAAAAAAAAABAAAADgAAAAAAAAAGAAAAAAAAAHNvcmFmcwsAAAAAAAAAAwAAAAAAAABzZjENAAAAAAAAAAUAAAAAAAAAMS4wLjAEAAAAAAAAAAAAAQAEAAAAAAAAAAAABAAEAAAAAAAAAAAACAAEAAAAAAAAAP//AAAIAAAAAAAAAB8AAAAAAAAAQgAAAAAAAAACAAAAAAAAABgAAAAAAAAAEAAAAAAAAABzb3JhZnMuc2YxQDEuMC4wEgAAAAAAAAAKAAAAAAAAAHNvcmFmcy1zZjEIAAAAAAAAAFScAgAAAAAAIAAAAAAAAACjQkcG5gwixl+4di3pXINMkrMDgrTacXoLwANEF1sshwgAAAAAAAAAE6UCAAAAAAAmAAAAAAAAAAIAAAAAAAAAAQAEAAAAAAAAAAEAAAAIAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAH8BAAAAAAAABgAAAAAAAAApAAAAAAAAAAsAAAAAAAAAAwAAAAAAAABhcHAOAAAAAAAAAAYAAAAAAAAAaGF5YWhpKgAAAAAAAAAPAAAAAAAAAAcAAAAAAAAAc3VyZmFjZQsAAAAAAAAAAwAAAAAAAAB3ZWIwAAAAAAAAABMAAAAAAAAACwAAAAAAAABlbnZpcm9ubWVudA0AAAAAAAAABQAAAAAAAAB0YWlyYT8AAAAAAAAAGAAAAAAAAAAQAAAAAAAAAGRlcGxveW1lbnRfbW9kZWwXAAAAAAAAAA8AAAAAAAAAc3RhdGljX2Zyb250ZW5kOAAAAAAAAAAUAAAAAAAAAAwAAAAAAAAAcnVudGltZV9tb2RlFAAAAAAAAAAMAAAAAAAAAGJyb3dzZXJfbGl2ZU0AAAAAAAAAGwAAAAAAAAATAAAAAAAAAGJyb3dzZXJfbGl2ZV9zb3VyY2UiAAAAAAAAABoAAAAAAAAAcWFudGFzX3B1YmxpY19zY2hlZHVsZV9hcGk=';

describe('sorafs helpers', () => {
  it('encodes raw root CID bytes as lowercase multibase base32', () => {
    expect(encodeSorafsContentCid(Uint8Array.from(Buffer.from(SAMPLE_ROOT_CID_HEX, 'hex')))).toBe(SAMPLE_ROOT_CID);
  });

  it('extracts the public root CID from a Norito manifest blob', () => {
    expect(sorafsManifestBase64ToRootCid(SAMPLE_MANIFEST_B64)).toBe(SAMPLE_ROOT_CID);
  });

  it('decodes public root CID strings back into raw bytes and hex', () => {
    expect(Buffer.from(decodeSorafsContentCid(SAMPLE_ROOT_CID) ?? new Uint8Array()).toString('hex')).toBe(
      SAMPLE_ROOT_CID_HEX
    );
    expect(sorafsContentCidToHex(SAMPLE_ROOT_CID)).toBe(SAMPLE_ROOT_CID_HEX);
  });

  it('returns null for malformed manifest payloads', () => {
    expect(sorafsManifestBase64ToRootCid('not-valid-base64')).toBeNull();
    expect(decodeSorafsContentCid('not-a-cid')).toBeNull();
    expect(sorafsContentCidToHex('bafy!')).toBeNull();
  });

  it('builds public file URLs with encoded path segments', () => {
    expect(buildSorafsPublicFileUrl(SAMPLE_ROOT_CID, ['assets', 'index file.js'], 'https://taira.sora.org/')).toBe(
      'https://taira.sora.org/sorafs/cid/bafyr6iatqagnbizi6jys7slqjntshcc3yybfq32ujcb6crvtvi2bw647fi/assets/index%20file.js'
    );
    expect(sorafsFilePathLabel(['assets', 'index file.js'])).toBe('assets/index file.js');
  });

  it('prefers explicit public base URLs and falls back to Torii or window origin', () => {
    expect(
      resolveSorafsPublicBaseUrl({
        configuredBaseUrl: '/gateway',
        toriiBaseUrl: 'https://ignored.example',
        windowOrigin: 'https://explorer.example',
      })
    ).toBe('https://explorer.example/gateway');

    expect(
      resolveSorafsPublicBaseUrl({
        toriiBaseUrl: 'https://taira.sora.org/',
        windowOrigin: 'https://explorer.example',
      })
    ).toBe('https://taira.sora.org');

    expect(resolveSorafsPublicBaseUrl({ windowOrigin: 'https://explorer.example/' })).toBe('https://explorer.example');
  });
});

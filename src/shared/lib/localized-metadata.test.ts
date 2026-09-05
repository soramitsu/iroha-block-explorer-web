import { describe, expect, it } from 'vitest';

import { applyLocalizedDocumentMetadata } from './localized-metadata';

function metadataDocument(): Document {
  return new DOMParser().parseFromString(
    `
    <html><head>
      <title>Hyperledger Iroha</title>
      <meta name="description" content="">
      <meta name="keywords" content="">
      <meta property="og:title" content="Hyperledger Iroha">
      <meta property="og:description" content="">
      <meta property="og:image:alt" content="Hyperledger Iroha">
    </head><body></body></html>
  `,
    'text/html'
  );
}

describe('applyLocalizedDocumentMetadata', () => {
  it('updates every localized document and social-preview field', () => {
    const target = metadataDocument();

    applyLocalizedDocumentMetadata(target, {
      title: 'Localized title',
      description: 'Localized description',
      keywords: 'localized, keywords',
      imageAlt: 'Localized image description',
    });

    expect(target.title).toBe('Localized title');
    expect(target.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Localized description');
    expect(target.querySelector('meta[name="keywords"]')?.getAttribute('content')).toBe('localized, keywords');
    expect(target.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Localized title');
    expect(target.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(
      'Localized description'
    );
    expect(target.querySelector('meta[property="og:image:alt"]')?.getAttribute('content')).toBe(
      'Localized image description'
    );
  });

  it('fails closed when the static shell omits a localized metadata target', () => {
    const target = metadataDocument();
    target.querySelector('meta[name="keywords"]')?.remove();

    expect(() =>
      applyLocalizedDocumentMetadata(target, {
        title: 'Title',
        description: 'Description',
        keywords: 'keywords',
        imageAlt: 'Image',
      })
    ).toThrow('Missing localized metadata element: meta[name="keywords"]');
  });
});

export interface LocalizedDocumentMetadata {
  readonly title: string;
  readonly description: string;
  readonly keywords: string;
  readonly imageAlt: string;
}

const META_FIELDS = [
  ['meta[name="description"]', 'description'],
  ['meta[name="keywords"]', 'keywords'],
  ['meta[property="og:title"]', 'title'],
  ['meta[property="og:description"]', 'description'],
  ['meta[property="og:image:alt"]', 'imageAlt'],
] as const;

export function applyLocalizedDocumentMetadata(target: Document, metadata: LocalizedDocumentMetadata): void {
  target.title = metadata.title;
  for (const [selector, field] of META_FIELDS) {
    const element = target.querySelector<HTMLMetaElement>(selector);
    if (!element) throw new Error(`Missing localized metadata element: ${selector}`);
    element.content = metadata[field];
  }
}

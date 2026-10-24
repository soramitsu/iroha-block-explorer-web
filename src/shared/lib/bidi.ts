/**
 * Wrap a value interpolated into a sentence in a first-strong isolate, so a
 * reading such as "2.4 s" keeps its own order inside right-to-left text
 * instead of rendering as "s 2.4". Invisible in left-to-right text.
 */
export function isolateText(text: string): string {
  return text === '' ? '' : `⁨${text}⁩`;
}

export type QueryParams = Record<string, any>;

export function appendSearchParams(url: URL, params?: QueryParams) {
  if (!params) return;
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    url.searchParams.set(key, String(value));
  });
}

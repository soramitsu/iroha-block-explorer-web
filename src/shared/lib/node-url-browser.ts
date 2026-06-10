export function domainToASCII(domain: string): string {
  const value = String(domain).trim();
  if (!value) return '';

  try {
    return new URL(`https://${value}`).hostname;
  } catch {
    return '';
  }
}

export function fileURLToPath(url: string | URL): string {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  if (parsed.protocol !== 'file:') {
    throw new TypeError('fileURLToPath expects a file URL');
  }
  const pathname = decodeURIComponent(parsed.pathname);
  return /^\/[A-Za-z]:/u.test(pathname) ? pathname.slice(1) : pathname;
}

export function formatNumber(value: number | string) {
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 10,
  });

  return formatter.format(Number(value));
}

export function formatBytes(value: number | string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let unitIndex = 0;
  let scaled = Math.abs(bytes);

  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }

  const signedScaled = bytes < 0 ? -scaled : scaled;
  const digits = unitIndex === 0 || Math.abs(signedScaled) >= 10 ? 0 : 1;

  return `${signedScaled.toFixed(digits).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

export function formatMoney(value: number | string, currency: string) {
  return currency + formatNumber(value);
}

export function formatTimestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);

  if (seconds >= 86400) return Math.floor(seconds / 86400) + 'd';
  else if (seconds >= 3600) return Math.floor(seconds / 3600) + 'h';
  else if (seconds >= 60) return Math.floor(seconds / 60) + 'm';
  else if (seconds >= 1) return seconds + 's';

  return ms + 'ms';
}

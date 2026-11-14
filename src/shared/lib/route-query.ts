import type { LocationQuery, LocationQueryRaw } from 'vue-router';

export type RouteQueryPatchValue = string | number | boolean | string[] | null | undefined;

export function firstRouteQueryValue(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

export type CanonicalRoutePositiveIntegerResult = { ok: true; value: number; explicit: boolean } | { ok: false };

/** Parses one canonical positive integer without normalizing explicit invalid URL state. */
export function parseCanonicalRoutePositiveInteger(
  value: unknown,
  defaultValue: number,
  allowed?: ReadonlySet<number>
): CanonicalRoutePositiveIntegerResult {
  if (value === undefined) return { ok: true, value: defaultValue, explicit: false };
  if (Array.isArray(value) || typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return { ok: false };

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (allowed && !allowed.has(parsed))) return { ok: false };
  return { ok: true, value: parsed, explicit: true };
}

export function parseRouteEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, fallback: T): T {
  const raw = firstRouteQueryValue(value);
  return raw && allowed.has(raw as T) ? (raw as T) : fallback;
}

function serializePatchValue(value: RouteQueryPatchValue): LocationQueryRaw[string] {
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return String(value);
  return value;
}

function comparableQueryValue(value: LocationQueryRaw[string]): string {
  return Array.isArray(value) ? value.join(',') : String(value ?? '');
}

export function mergeRouteQuery(
  current: LocationQuery | LocationQueryRaw,
  patch: Record<string, RouteQueryPatchValue>,
  defaults: Record<string, RouteQueryPatchValue> = {}
): LocationQueryRaw {
  const next: LocationQueryRaw = { ...current };

  for (const [key, rawValue] of Object.entries(patch)) {
    const value = serializePatchValue(rawValue);
    const defaultValue = serializePatchValue(defaults[key]);
    const isDefault = key in defaults && comparableQueryValue(value) === comparableQueryValue(defaultValue);

    if (value === null || value === undefined || value === '' || isDefault) delete next[key];
    else next[key] = value;
  }

  return next;
}

export function routeQueriesEqual(left: LocationQueryRaw, right: LocationQueryRaw): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && comparableQueryValue(left[key]) === comparableQueryValue(right[key])
  );
}

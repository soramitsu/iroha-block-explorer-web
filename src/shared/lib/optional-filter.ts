export interface OptionalFilterParseResult<T> {
  value: T | undefined
  error: string | null
}

export function parseOptionalFilter<T>(
  raw: string,
  parser: (trimmed: string) => T | null | undefined,
  invalidMessage: string
): OptionalFilterParseResult<T> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      value: undefined,
      error: null,
    };
  }

  const parsed = parser(trimmed);
  if (parsed === null || parsed === undefined) {
    return {
      value: undefined,
      error: invalidMessage,
    };
  }

  return {
    value: parsed,
    error: null,
  };
}

export function parseOptionalFilterCatching<T>(
  raw: string,
  parser: (trimmed: string) => T,
  invalidMessage: string
): OptionalFilterParseResult<T> {
  return parseOptionalFilter(
    raw,
    (trimmed) => {
      try {
        return parser(trimmed);
      } catch {
        return undefined;
      }
    },
    invalidMessage
  );
}

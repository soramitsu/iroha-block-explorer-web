const STRICT_JSON_MAX_DEPTH = 256;

type JsonErrorConstructor = new (message?: string) => Error;

class FloatingJsonNumberToken {
  readonly value: number;

  constructor(value: number) {
    this.value = value;
  }
}

/**
 * Parse the integer-only JSON profile emitted by typed Torii endpoints.
 *
 * This follows the strict numeric and duplicate-key semantics at the pinned
 * iroha-js revision without imposing its generic SDK node budget on the
 * unpaginated Soracles history capability. Native
 * `JSON.parse` rounds integer tokens beyond `Number.MAX_SAFE_INTEGER` and
 * silently keeps only the last duplicate object key; neither behavior is
 * acceptable for identity-bound ledger records.
 */
function parseStrictLosslessJsonProfile(text: string, context: string, allowFloatingNumbers: boolean): unknown {
  if (typeof text !== 'string') {
    throw new TypeError(`${context} JSON source must be a string`);
  }
  if (typeof context !== 'string' || context.length === 0) {
    throw new TypeError('strict lossless JSON context must be a non-empty string');
  }

  let index = 0;
  const fail = (message: string, ErrorType: JsonErrorConstructor = TypeError): never => {
    throw new ErrorType(`${context} contains invalid JSON at character ${index}: ${message}`);
  };
  const consumeNode = (depth: number): void => {
    if (depth > STRICT_JSON_MAX_DEPTH) {
      fail(`value exceeds the ${STRICT_JSON_MAX_DEPTH}-level nesting limit`, RangeError);
    }
  };
  const character = (): string => text[index] ?? '';
  const skipWhitespace = (): void => {
    while (index < text.length && [' ', '\t', '\n', '\r'].includes(character())) {
      index += 1;
    }
  };
  const appendUnicodeCodeUnit = (result: string, codeUnit: number, escaped: boolean): string => {
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      let low: number;
      if (escaped) {
        if (text.slice(index, index + 2) !== '\\u') {
          fail('high surrogate must be followed by an escaped low surrogate');
        }
        const lowHex = text.slice(index + 2, index + 6);
        if (!/^[0-9A-Fa-f]{4}$/u.test(lowHex)) {
          fail('invalid Unicode escape');
        }
        low = Number.parseInt(lowHex, 16);
        index += 6;
      } else {
        if (index >= text.length) fail('unterminated high surrogate');
        low = text.charCodeAt(index);
        index += 1;
      }
      if (low < 0xdc00 || low > 0xdfff) {
        fail('high surrogate must be followed by a low surrogate');
      }
      return result + String.fromCharCode(codeUnit, low);
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail('unpaired low surrogate');
    }
    return result + String.fromCharCode(codeUnit);
  };
  const parseString = (): string => {
    if (character() !== '"') fail('expected a string');
    index += 1;
    let result = '';
    while (index < text.length) {
      const current = character();
      if (current === '"') {
        index += 1;
        return result;
      }
      if (current === '\\') {
        index += 1;
        if (index >= text.length) fail('unterminated string escape');
        const escaped = character();
        index += 1;
        switch (escaped) {
          case '"':
          case '\\':
          case '/':
            result += escaped;
            break;
          case 'b':
            result += '\b';
            break;
          case 'f':
            result += '\f';
            break;
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case 'u': {
            const hex = text.slice(index, index + 4);
            if (!/^[0-9A-Fa-f]{4}$/u.test(hex)) fail('invalid Unicode escape');
            const codeUnit = Number.parseInt(hex, 16);
            index += 4;
            result = appendUnicodeCodeUnit(result, codeUnit, true);
            break;
          }
          default:
            fail('invalid string escape');
        }
        continue;
      }
      const codeUnit = text.charCodeAt(index);
      if (codeUnit <= 0x1f) fail('unescaped control character in string');
      index += 1;
      result = appendUnicodeCodeUnit(result, codeUnit, false);
    }
    return fail('unterminated string');
  };
  const consumeDigits = (): void => {
    while (index < text.length && /[0-9]/u.test(character())) index += 1;
  };
  const consumeIntegerPart = (): void => {
    if (index >= text.length) fail('incomplete number');
    if (character() === '0') {
      index += 1;
      if (index < text.length && /[0-9]/u.test(character())) {
        fail('integer tokens must not contain leading zeroes');
      }
    } else if (/[1-9]/u.test(character())) {
      consumeDigits();
    } else {
      fail('invalid integer token');
    }
  };
  const consumeFraction = (): boolean => {
    if (character() !== '.') return false;
    if (!allowFloatingNumbers) fail('numeric tokens must be canonical integers');
    index += 1;
    if (!/[0-9]/u.test(character())) fail('fraction must contain at least one digit');
    consumeDigits();
    return true;
  };
  const consumeExponent = (): boolean => {
    if (!/[eE]/u.test(character())) return false;
    if (!allowFloatingNumbers) fail('numeric tokens must be canonical integers');
    index += 1;
    if (/[+-]/u.test(character())) index += 1;
    if (!/[0-9]/u.test(character())) fail('exponent must contain at least one digit');
    consumeDigits();
    return true;
  };
  const convertNumberToken = (token: string, floating: boolean): number | bigint | FloatingJsonNumberToken => {
    if (token === '-0' && !allowFloatingNumbers) {
      fail('numeric tokens must be canonical integers; negative zero is forbidden');
    }
    if (floating) {
      const value = Number(token);
      if (!Number.isFinite(value)) fail('floating-point number must be finite');
      return new FloatingJsonNumberToken(value);
    }
    if (token === '-0') return new FloatingJsonNumberToken(-0);
    let integer: bigint;
    try {
      integer = BigInt(token);
    } catch {
      return fail('invalid integer token');
    }
    if (allowFloatingNumbers && (integer < -(1n << 63n) || integer > (1n << 128n) - 1n)) {
      return fail('integer token exceeds the Norito JSON numeric domain');
    }
    if (integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(integer);
    }
    return integer;
  };
  const parseNumber = (): number | bigint | FloatingJsonNumberToken => {
    const start = index;
    if (character() === '-') index += 1;
    consumeIntegerPart();
    const hasFraction = consumeFraction();
    const hasExponent = consumeExponent();
    return convertNumberToken(text.slice(start, index), hasFraction || hasExponent);
  };
  const parseObject = (depth: number): Record<string, unknown> => {
    index += 1;
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    const keys = new Set<string>();
    skipWhitespace();
    if (character() === '}') {
      index += 1;
      return record;
    }
    while (true) {
      skipWhitespace();
      const key = parseString();
      if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      skipWhitespace();
      if (character() !== ':') fail("expected ':' after object key");
      index += 1;
      const value = parseValue(depth + 1);
      Object.defineProperty(record, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      skipWhitespace();
      if (character() === '}') {
        index += 1;
        return record;
      }
      if (character() !== ',') fail("expected ',' or '}' in object");
      index += 1;
    }
  };
  const parseArray = (depth: number): unknown[] => {
    index += 1;
    const values: unknown[] = [];
    skipWhitespace();
    if (character() === ']') {
      index += 1;
      return values;
    }
    while (true) {
      values.push(parseValue(depth + 1));
      skipWhitespace();
      if (character() === ']') {
        index += 1;
        return values;
      }
      if (character() !== ',') fail("expected ',' or ']' in array");
      index += 1;
    }
  };
  const parseLiteral = <T>(literal: string, value: T): T => {
    if (text.slice(index, index + literal.length) !== literal) fail('invalid literal');
    index += literal.length;
    return value;
  };
  const parseValue = (depth: number): unknown => {
    consumeNode(depth);
    skipWhitespace();
    if (index >= text.length) fail('unexpected end of input');
    switch (character()) {
      case '{':
        return parseObject(depth);
      case '[':
        return parseArray(depth);
      case '"':
        return parseString();
      case 't':
        return parseLiteral('true', true);
      case 'f':
        return parseLiteral('false', false);
      case 'n':
        return parseLiteral('null', null);
      default:
        if (character() === '-' || /[0-9]/u.test(character())) return parseNumber();
        return fail('unexpected token');
    }
  };

  skipWhitespace();
  const parsed = parseValue(0);
  skipWhitespace();
  if (index !== text.length) fail('trailing input');
  return parsed;
}

export function parseStrictLosslessIntegerJson(text: string, context: string): unknown {
  return parseStrictLosslessJsonProfile(text, context, false);
}

/**
 * Parse generic Norito JSON without losing wide integer tokens or duplicate-key
 * diagnostics. Floating-point tokens are retained as opaque values so callers
 * validating integer-only fields cannot accidentally coerce `1.0` into `1`.
 */
export function parseStrictLosslessJsonForValidation(text: string, context: string): unknown {
  return parseStrictLosslessJsonProfile(text, context, true);
}

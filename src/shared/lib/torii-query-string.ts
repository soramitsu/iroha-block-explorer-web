const NORITO_SCALAR_KEYWORD = /^(?:null|true|false)$/iu;
const NORITO_FINITE_NUMBER_LITERAL = /^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/u;

/**
 * Returns whether scalar-coercing `NoritoQuery` preserves this exact value as a
 * string. Current Torii trims form values, then coerces null, booleans, and
 * finite numeric literals before deserializing the route DTO.
 */
export function isExactNoritoQueryStringValue(value: string): boolean {
  if (value.length === 0 || value.trim() !== value) return false;
  if (NORITO_SCALAR_KEYWORD.test(value)) return false;
  if (NORITO_FINITE_NUMBER_LITERAL.test(value) && Number.isFinite(Number(value))) return false;
  return true;
}

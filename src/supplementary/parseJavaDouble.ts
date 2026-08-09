import { NumberFormatError } from '../xml/errors.js';

/**
 * `Double.parseDouble` semantics for attribute values: reject what Java rejects instead of
 * quietly producing `NaN`.
 *
 * Leaf module (L1). It exists because `parseFloat` and `Double.parseDouble` disagree about
 * *failure*, not about numbers: `parseFloat('abc')` is `NaN` and `parseFloat('12abc')` is
 * `12`, where Java throws `NumberFormatException` in both cases and the surrounding factory
 * turns that into a skipped element. Reproducing the value but not the failure produced a
 * def that Java would have discarded — see PARITY.md, "Fixed bugs", entry P1.
 *
 * The accepted grammar is the one `Double.valueOf`'s javadoc publishes, minus its
 * hexadecimal-float alternative (`0x1.8p1`). That omission is deliberate and is the single
 * residual difference: such a literal is accepted by Java and rejected here. It cannot
 * appear in an MPM document written by any tool in this ecosystem, and rejecting it skips
 * one def where accepting it would need a hand-written hex-float decoder.
 */

/** `[+-]?(NaN|Infinity)`. Java's grammar accepts these and so does `Number`. */
const SPECIAL = /^[+-]?(?:NaN|Infinity)$/;

/**
 * A finite decimal literal with Java's optional `f`/`d` type suffix, which `Number` does not
 * accept and which is therefore stripped before conversion. `Number` would also accept
 * `0x10`, `0b101` and `0o17`, all of which Java rejects; requiring this pattern first is what
 * keeps them out.
 */
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[fFdD]?$/;

/**
 * Strip the whitespace Java's grammar brackets its literals with — every character up to and
 * including the space, `[\x00-\x20]`. Written against char codes rather than as a regex
 * because JS `String.trim` uses a wider, Unicode class (NBSP, U+2028, …): trimming with it
 * would accept literals Java rejects, inventing a second whitespace divergence on top of the
 * one `RelatedResource.setType` already carries.
 */
function trimJavaWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) ++start;
  while (end > start && text.charCodeAt(end - 1) <= 0x20) --end;
  return text.slice(start, end);
}

/**
 * Parse `text` the way Java's `Double.parseDouble` would.
 *
 * @param text the raw attribute value
 * @param what what is being parsed, for the error message — conventionally
 *   `element/@attribute`, e.g. `tempoDef/@value`
 * @returns the parsed value, which may legitimately be `NaN` or `±Infinity` when the text
 *   says so, exactly as in Java
 * @throws {NumberFormatError} if `text` is not a Java double literal. Callers on the parse
 *   path let it reach their `create*` factory, which logs it and returns null.
 */
export function parseJavaDouble(text: string, what: string): number {
  const trimmed = trimJavaWhitespace(text);

  if (SPECIAL.test(trimmed)) return Number(trimmed);
  if (!DECIMAL.test(trimmed))
    throw new NumberFormatError(`Cannot parse ${what}: "${text}" is not a number.`);

  return Number(trimmed.replace(/[fFdD]$/, ''));
}

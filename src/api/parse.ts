/**
 * The two input guards every facade parse goes through (RULE E2).
 *
 * They live apart from {@link module:api/pipeline} because there is now a second entry point —
 * `expression.ts`'s MPM⇒MPM transform — and the whole value of {@link parseOrThrow} is that
 * *every* construction of a document goes through it. Two copies of it would make that
 * sentence false the moment one of them was fixed.
 */
import { ParseError } from './errors.js';
import type { XmlText } from './types.js';

/** Which of the three formats a message is about. */
export type DocumentKind = 'MEI' | 'MSM' | 'MPM';

export function requireXmlText(kind: DocumentKind, text: XmlText): void {
  // The `typeof` guard is for untyped callers: a plain-JS `null` would otherwise fail with a
  // `TypeError` from inside the parser instead of this module's own error type.
  //
  // The message names WHAT arrived (W3 MINOR): "got nothing" is true of `undefined` and of an
  // empty string and misleading for `42` or `{}`, and an untyped caller who passed the wrong
  // variable is exactly the reader of this message.
  if (typeof text !== 'string' || text.trim() === '')
    throw new ParseError(`${kind}: expected XML text, got ${describe(text)}`);
}

/** What arrived, in one word a message can carry: a type, or "nothing" / "an empty string". */
function describe(value: unknown): string {
  if (value === undefined || value === null) return 'nothing';
  if (typeof value === 'string') return 'an empty string';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

/**
 * The XML layer is lenient in two different ways at two different depths, and only one of
 * them is visible as an empty document: `XmlBase` catches the XOM layer's own
 * `ParsingException` and leaves `data` null, but a fatal parser error escapes as
 * **`@xmldom/xmldom`'s `ParseError`** — a foreign class that happens to share its name with
 * this package's, so a consumer catching `ParseError` by identity would miss it entirely.
 * Every construction of a document therefore goes through here.
 */
export function parseOrThrow<T>(kind: DocumentKind, parse: () => T): T {
  try {
    return parse();
  } catch (cause) {
    throw new ParseError(
      `${kind}: ${cause instanceof Error ? cause.message : String(cause)}`.replace(/\s+/g, ' '),
      { cause },
    );
  }
}

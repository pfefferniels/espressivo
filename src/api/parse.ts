/**
 * The two input guards every facade parse goes through (RULE E2).
 *
 * They live apart from {@link module:api/pipeline} because three entry points share them, and
 * the whole value of {@link parseOrThrow} is that *every* construction of a document goes
 * through it. Two copies would make that sentence false the moment one of them was fixed.
 */
import { ParseError } from './errors.js';
import type { XmlText } from './types.js';

/** Which of the three formats a message is about. */
export type DocumentKind = 'MEI' | 'MSM' | 'MPM';

/** Reject anything that is not non-blank XML text, before it reaches a parser. */
export function requireXmlText(kind: DocumentKind, text: XmlText): void {
  // The `typeof` guard is for untyped callers: a plain-JS `null` would otherwise fail with a
  // `TypeError` from inside the parser instead of this module's own error type. The message
  // names what arrived, because an untyped caller who passed the wrong variable is exactly
  // its reader.
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
 * Run `parse` and re-raise whatever it throws as this package's own {@link ParseError}, with
 * the document kind and the underlying message.
 *
 * A fatal parser error escapes the XML layer as `@xmldom/xmldom`'s `ParseError` — a foreign
 * class that happens to share its name with this package's, so a consumer catching
 * `ParseError` by identity would miss it entirely. Every construction of a document therefore
 * goes through here.
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

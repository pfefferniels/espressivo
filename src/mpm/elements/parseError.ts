import { err, matchKind, ok, type Result } from '../../prelude/index.js';
import type { MeicoError } from '../../xml/errors.js';

/**
 * Why an MPM element could not be read.
 *
 * The factories under `elements/**` return `Result<T, MpmParseError>` rather than logging and
 * returning null. The *control* decision is unchanged and is Java's — skip this element, keep
 * the document, which is what the byte-equivalence gate pins — but the reason survives as a
 * value instead of going to whatever stderr the host happens to have, so a caller can tell
 * "malformed" from "legitimately absent". Whoever knows whether a user is watching decides
 * whether to print; `Header.adoptStyleType` is the example, and `styles/style.ts`'s
 * `StyleError` is this type's narrower sibling.
 *
 * A data union rather than a fourth `MeicoError` hierarchy: nothing throws these, `instanceof`
 * is not how they are consumed, and a class would carry a stack trace allocated once per
 * element of a document. The `kind` discriminant is what makes {@link matchKind} exhaustive.
 *
 * The `'threw'` arm carries a throw the parser does not classify. It exists because narrowing
 * the total `catch` to "only what a document can cause" — which `defs/defName.ts` does, and
 * argues for — would change which inputs produce a skip, and that is the one thing this work
 * may not move. So the catch stays total where it was total, and the arm's name says plainly
 * that nobody has classified it yet.
 */
export type MpmParseError =
  /** The element handed to the factory was null — reachable only through a cast. */
  | { readonly kind: 'noElement'; readonly what: string }
  /** An attribute the element must carry is absent, or present and empty. */
  | { readonly kind: 'missingAttribute'; readonly what: string; readonly attribute: string }
  /** The element's local name is not one this class can read. */
  | {
      readonly kind: 'wrongLocalName';
      readonly what: string;
      readonly localName: string;
      readonly requirement: string;
    }
  /** A required argument of a from-scratch factory was not supplied. */
  | { readonly kind: 'missingArgument'; readonly what: string; readonly argument: string }
  /** The element parsed, but yielded nothing to hold — `Metadata`'s one hard rule. */
  | { readonly kind: 'empty'; readonly what: string }
  /** A child this element cannot do without could not be read, and why. */
  | { readonly kind: 'childFailed'; readonly what: string; readonly cause: MpmParseError }
  /**
   * A `*Def` element the parser refused, carrying the library error it raised.
   *
   * The only arm that keeps an `Error`: `defs/defName.ts` narrows its catch to
   * {@link MeicoError} so that a `TypeError` from a broken port cannot be mistaken for a
   * rejected document, and that narrowing is what this arm carries. Its message is already a
   * whole sentence, so {@link describeMpmParseError} hands it back unwrapped.
   */
  | { readonly kind: 'malformedDef'; readonly what: string; readonly cause: MeicoError }
  /** Something threw that the parser does not classify. See the module header. */
  | { readonly kind: 'threw'; readonly what: string; readonly cause: unknown };

/**
 * An {@link MpmParseError} as a sentence, for a caller that has decided to report it. Separate
 * from the error value because *whether* to print is not the parser's call. The wording is the
 * wording the thrown `Error`s carried.
 */
export function describeMpmParseError(error: MpmParseError): string {
  return matchKind(error, {
    noElement: (e) => `Cannot generate ${e.what} object. XML Element is null.`,
    missingAttribute: (e) =>
      `Cannot generate ${e.what} object. Attribute ${e.attribute} is missing or empty.`,
    wrongLocalName: (e) =>
      `Cannot generate ${e.what} object. Local name "${e.localName}" ${e.requirement}.`,
    missingArgument: (e) => `Cannot generate ${e.what} object. Argument ${e.argument} is missing.`,
    empty: (e) => `Cannot generate empty ${e.what} object.`,
    childFailed: (e) =>
      `Cannot generate ${e.what} object. Failed to generate ${e.cause.what} object.`,
    malformedDef: (e) => e.cause.message,
    threw: (e) => `Cannot generate ${e.what} object. ${String(e.cause)}`,
  });
}

/**
 * Run the body of a factory, keeping an unclassified throw as a value instead of printing it.
 *
 * Every failure a *document* can cause should be an explicit arm returned before this is
 * reached; what lands here is the residue.
 *
 * The `try` is written out rather than composed from `attempt` + `mapErr` so that the whole
 * body — including the `new` — is inside the guarded region.
 */
export function attemptParse<T>(what: string, body: () => T): Result<T, MpmParseError> {
  try {
    return ok(body());
  } catch (cause) {
    return err({ kind: 'threw', what, cause });
  }
}

import { err, matchKind, ok, type Result } from '../../prelude/index.js';

/**
 * Why an MPM element could not be read.
 *
 * ## What this replaces
 *
 * Every static factory under `elements/**` was the same five lines:
 *
 * ```ts
 * } catch (e) {
 *   console.error(e);
 *   return null;
 * }
 * ```
 *
 * That shape decides two unrelated things at once, and gets one of them wrong. The *control*
 * decision — skip this element, keep the document — is right, is Java's, and is what the
 * byte-equivalence gate pins. The *reporting* decision is not the factory's to make: it prints
 * the only copy of the explanation to whatever stderr the host happens to have, and hands the
 * caller a `null` that is indistinguishable from "there was legitimately nothing here". A
 * library that is embedded in an editor, a server or another library has no business writing to
 * a console, and a caller that wants to tell "malformed" from "absent" cannot.
 *
 * So the factories return `Result<T, MpmParseError>`: the same elements are skipped, and the
 * reason survives as a value. Whether it reaches a console is now decided by whoever knows
 * whether there is a user watching — the precedent is `styles/style.ts`, whose `StyleError` is
 * this type's older, narrower sibling, printed by `Header.addStyleType` because *that* is the
 * code that knows it is converting somebody's document.
 *
 * ## Why a data union and not an `Error` subclass
 *
 * `src/xml/errors.ts` already owns the library's thrown hierarchy, and the facade
 * (`src/api/errors.ts`) is where interior failure becomes something a consumer catches. A
 * fourth hierarchy of `MeicoError` subclasses here would buy nothing: nothing throws these,
 * `instanceof` is not how they are consumed, and a class carries a stack trace that costs
 * allocation on a path the parser walks once per element of a document. A closed union with a
 * `kind` discriminant is what {@link matchKind} makes exhaustive, and it can be compared,
 * serialized and counted, which an `Error` cannot.
 *
 * ## The `threw` arm is deliberate, and is the honest part
 *
 * Five arms name failures the parser recognises. The sixth, {@link MpmParseError} `'threw'`,
 * carries a throw the parser did *not* recognise — and it exists because removing the bare
 * `catch` outright would be a behaviour change, not a plumbing change. The incumbent `catch (e)`
 * absorbs everything, including a `TypeError` that means this port is broken rather than the
 * document. Narrowing that to "only what the document can cause" is a real improvement and
 * `defs/defName.ts` argues for it at length, having measured a control that went green because
 * a catch-all made an injected `ReferenceError` indistinguishable from the rejection it had
 * replaced. But it changes which inputs produce a skip, and the charter for this work says that
 * is the one thing that may not move. So the total catch stays where it was total, the reason it
 * caught is kept instead of printed, and the arm's name says plainly that nobody has classified
 * it yet.
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
  /** Something threw that the parser does not classify. See the module header. */
  | { readonly kind: 'threw'; readonly what: string; readonly cause: unknown };

/**
 * An {@link MpmParseError} as a sentence, for a caller that has decided to report it.
 *
 * Separate from the error value on purpose, for the reason the module header gives: the point
 * of returning the reason rather than printing it is that *whether* to print is not the
 * parser's call. The wording is the wording the thrown `Error`s carried, so a caller that does
 * print sees what it saw before.
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
    threw: (e) => `Cannot generate ${e.what} object. ${String(e.cause)}`,
  });
}

/**
 * Run the body of a factory, keeping an unclassified throw as a value instead of printing it.
 *
 * This is `prelude`'s {@link attempt} with the `unknown` error labelled — it is the boundary
 * adapter the factories need while the classes they build still signal a broken invariant by
 * throwing. Every failure a *document* can cause should be an explicit arm returned before this
 * is reached; what lands here is the residue, and its size is the measure of how much of the
 * parser has been given honest preconditions.
 *
 * The `try` is written out rather than composed from `attempt` + `mapErr` so that the whole
 * body — including the `new` — is inside the guarded region, which is where the incumbent
 * `try` had it.
 */
export function attemptParse<T>(what: string, body: () => T): Result<T, MpmParseError> {
  try {
    return ok(body());
  } catch (cause) {
    return err({ kind: 'threw', what, cause });
  }
}

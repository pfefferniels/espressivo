/**
 * Raw MPM text in, raw MPM text out — the two ends of the expression engine's document
 * layer.
 *
 * DESIGN.md D-A (as rewritten by adjudication A1) forbids `new Mpm(text)` here, and not as
 * a preference: the `Mpm` constructor runs the def parsers eagerly through
 * `Header.parseData`'s `addStyleType` loop, so merely *parsing* a document rewrites it —
 * `rubatoDef` gains `intensity="1" lateStart="0" earlyEnd="1"` and has present values
 * respelled (`"1.0"` → `"1"`), `accentuationPatternDef` gains `length="4"`,
 * `GenericMap.parseData` ends in an unconditional `sortXml()` that reorders map children
 * and hoists every instruction in front of the whitespace, `Performance` adds
 * `pulsesPerQuarter` and an empty `<global>`, and `Dated.addMap`/`Header.addStyleType`
 * DELETE duplicate maps and style collections. A transform that inherits those edits
 * cannot tell the caller which bytes it actually changed.
 *
 * `Builder` is the verified non-mutating alternative (REVIEW-FINDINGS.md, "Mpm
 * CONSTRUCTOR"): it parses with `@xmldom/xmldom` and hands the root to `Element.wrap`,
 * which copies attributes and children across verbatim.
 *
 * ## What the round trip is and is not
 *
 * `parse → serialize` is NOT the identity on bytes, for every MPM document, whatever this
 * module does. `Element.wrap` drops `xmlns`/`xmlns:*` declarations at parse
 * (XomTypes.ts:410) and `Element.toXML` re-emits one on every namespaced element with no
 * check for an inherited declaration (XomTypes.ts:766-771), which inflates a real fixture
 * from 2444 to 3972 bytes. Comments, processing instructions and CDATA are dropped
 * (XomTypes.ts:381-383). What DOES hold, and is what the engine's P1 identity predicate
 * is asserted against, is that the round trip is **idempotent after one application**:
 * `serialize(parse(serialize(parse(t)))) === serialize(parse(t))`. The canonical baseline
 * every identity claim compares to is therefore `serialize(parse(t))`, never `t`.
 *
 * Serialization is `getRootElement().toXML()`, not `Document.toXML()` — RULE F2a. The
 * declaration-free form is the byte sequence the equivalence suite compares against the
 * Java fixtures; `Document.toXML` would additionally rewrite `<?xml version="1.0"?>` into
 * its own spelling (XomTypes.ts:836-838).
 */
import { Builder, type Document, type Element } from '../xml/XomTypes.js';

/**
 * Parse MPM text into a raw XOM tree, without constructing a single MPM class.
 *
 * No validation beyond XML well-formedness happens here — not the root element's name,
 * not the namespace, not the presence of a `<performance>`. Structural checks and typed
 * errors belong to the facade wave; this layer stays a thin, honest parse so that the
 * navigation modules above it can report an empty document as "nothing to transform"
 * rather than having a guess about intent baked in underneath them.
 *
 * @throws {ParsingException} from `Builder`, for both malformed XML and a document with no
 *   root element. facade wraps — W3 turns it into the typed `ParseError`.
 */
export function parseMpmDocument(text: string): Document {
  return new Builder().build(text);
}

/** {@link parseMpmDocument}, returning the root element the walkers start from. */
export function parseMpmRoot(text: string): Element {
  return parseMpmDocument(text).getRootElement();
}

/** The document as text, in the declaration-free form RULE F2a fixes. */
export function serializeMpmDocument(document: Document): string {
  return document.getRootElement().toXML();
}

/** {@link serializeMpmDocument} for a tree held by its root element. */
export function serializeMpmRoot(root: Element): string {
  return root.toXML();
}

/**
 * The canonical baseline of `text`: what an untouched document serializes to once it has
 * been through this module.
 *
 * Every identity claim in the engine — `exaggerate(mpm, {})`, `exaggerate(mpm, {every
 * dimension: 1})` — is byte-compared against this, per §1.1, because comparing against the
 * input is unreachable for reasons that have nothing to do with the transform.
 */
export function canonicalBaseline(text: string): string {
  return serializeMpmRoot(parseMpmRoot(text));
}

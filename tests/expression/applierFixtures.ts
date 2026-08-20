/**
 * Helpers for the applier's tests: run one exaggeration, then read exact attribute values
 * back out of the tree.
 *
 * Assertions read attributes rather than matching serialized XML because `Element.toXML`
 * re-emits `xmlns` on every namespaced element (`mpmDocument.ts`'s round-trip note), which
 * would bury every expectation in 40 characters of namespace. The one place bytes ARE
 * compared is the identity and determinism suite, where bytes are the claim.
 *
 * Every fixture in these tests is hand-built. DESIGN §7.7 records why: the integration corpus
 * is a blind spot for exactly these paths — every `<articulation>` in it carries only
 * `name.ref` and `noteid`, so all twelve numeric modifiers went unread through the whole
 * certification programme, and no fixture puts a `<style>` switch at the same date as the
 * instruction it would govern.
 */
import { applyExaggeration } from '../../src/expression/applier.js';
import { parseMpmRoot, serializeMpmRoot } from '../../src/expression/mpmDocument.js';
import type { ExaggerateOptions } from '../../src/expression/options.js';
import type { ExaggerationFactors } from '../../src/expression/registry.js';
import type {
  ExaggerationReport,
  PerformanceReport,
  ReportNoteKind,
} from '../../src/expression/report.js';
import type { Element } from '../../src/xml/XomTypes.js';
import { attribute } from '../../src/xml/tree.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import { elementAt } from '../../src/prelude/index.js';

/** A one-performance document from a `<header>` body and a `<dated>` body. */
export function globalDocument(header: string, dated: string, name = 'P'): string {
  return (
    `<mpm xmlns="${MPM_NAMESPACE}"><performance name="${name}">` +
    `<global><header>${header}</header><dated>${dated}</dated></global>` +
    `</performance></mpm>`
  );
}

export interface Run {
  readonly root: Element;
  readonly report: ExaggerationReport;
  /**
   * The first (usually only) performance sub-report.
   *
   * A GETTER, and the indirection is the point: a run whose `performance` selector matched
   * nothing has no sub-report at all, and `applierLevels.test.ts` asserts exactly that. Read
   * eagerly as `report.performances[0]` this field was typed `PerformanceReport` and held
   * `undefined` on that path — a lie the type system could not see while
   * `noUncheckedIndexedAccess` was off, and one that would have surfaced as "cannot read
   * properties of undefined" in whichever test first dereferenced it. Deferring the checked
   * read to the point of USE keeps the convenient type for the ~15 files that always have a
   * performance, and fails with a sentence in the one that does not.
   */
  readonly performance: PerformanceReport;
  readonly xml: string;
}

/** Parse, exaggerate, and hand back the tree, the report and the serialized result. */
export function exaggerate(
  text: string,
  factors: ExaggerationFactors,
  options?: ExaggerateOptions,
): Run {
  const root = parseMpmRoot(text);
  const report = applyExaggeration(root, factors, options);
  return {
    root,
    report,
    get performance() {
      return elementAt(report.performances, 0, 'the report’s performances');
    },
    xml: serializeMpmRoot(root),
  };
}

/** The first element carrying `id="…"`, anywhere under `root`. */
export function byId(root: Element, id: string): Element {
  const found = findById(root, id);
  if (found === null) throw new Error(`no element with id ${JSON.stringify(id)}`);
  return found;
}

function findById(parent: Element, id: string): Element | null {
  for (const child of parent.getChildElements().toArray()) {
    if (attribute('id', child)?.getValue() === id) return child;
    const nested = findById(child, id);
    if (nested !== null) return nested;
  }
  return null;
}

/** The raw text of one attribute — what the engine actually wrote, spelling included. */
export function textAt(root: Element, id: string, attributeName: string): string | null {
  return attribute(attributeName, byId(root, id))?.getValue() ?? null;
}

/** {@link textAt} parsed back to a number, for expectations computed in floating point. */
export function numberAt(root: Element, id: string, attributeName: string): number {
  const text = textAt(root, id, attributeName);
  if (text === null) throw new Error(`${id} carries no @${attributeName}`);
  return Number(text);
}

/** Every note of one kind, in walk order. */
export function notesOfKind(
  performance: PerformanceReport,
  kind: ReportNoteKind,
): readonly { readonly detail: string; readonly attribute: string | null }[] {
  return performance.notes
    .filter((note) => note.kind === kind)
    .map((note) => ({ detail: note.detail, attribute: note.site?.attribute ?? null }));
}

/**
 * The FIRST note of one kind — a checked {@link notesOfKind}`[0]`.
 *
 * Written `notesOfKind(performance, 'x')[0].attribute`, a run that emitted no such note failed
 * as "cannot read properties of undefined" rather than as "the applier emitted no x note",
 * which is exactly the claim those tests are making.
 */
export function firstNoteOfKind(
  performance: PerformanceReport,
  kind: ReportNoteKind,
): { readonly detail: string; readonly attribute: string | null } {
  return elementAt(notesOfKind(performance, kind), 0, `the run’s ${kind} notes`);
}

/** The note kinds a run emitted, minus the fourteen identity notes every partial run carries. */
export function noteKinds(performance: PerformanceReport): readonly ReportNoteKind[] {
  return performance.notes.map((note) => note.kind).filter((kind) => kind !== 'identity-factor');
}

// --- The scale spaces, spelled the way `transforms.ts` spells them ------------------------
//
// Expectations are computed with the SAME closed form, not with an algebraically equivalent
// one: `μ·(x/μ)^s` and `x^s·μ^(1−s)` are the same number in ℝ and differ in the last bits in
// doubles, and these tests assert exact equality.

/** `μ·(x/μ)^s` — level values around a center (§7.1). */
export function logAroundCenter(x: number, s: number, center: number): number {
  return center * Math.pow(x / center, s);
}

/** `x^s` — pure ratio gains (§7.6, §7.7, §7.10). */
export function logAroundOne(x: number, s: number): number {
  return Math.pow(x, s);
}

/** `1 − (1−x)^s` — proportions whose neutral is the lower bound (§7.5, §7.14). */
export function boundaryPowerLow(x: number, s: number): number {
  return 1 - Math.pow(1 - x, s);
}

/** `a + (b−a)/(1 + ((b−x)/(x−a))^s)` — bounded proportions with an interior neutral. */
export function logit(x: number, s: number, lower: number, upper: number): number {
  return lower + (upper - lower) / (1 + Math.pow((upper - x) / (x - lower), s));
}

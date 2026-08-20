/**
 * Hand-built MPM strings for the expression engine's raw-document tests.
 *
 * DESIGN.md §7.7 records why these are hand-built rather than taken from the integration
 * corpus: that corpus is a blind spot for exactly the paths this layer exercises. Every
 * `<articulation>` in it carries only `name.ref` and `noteid`, its maps are already in date
 * order, and none of them puts a `<style>` switch at the same date as the instruction it
 * would govern. A test drawn from those fixtures could not fail on any of the orderings or
 * scope rules this layer exists to reproduce.
 */
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { readPerformances, type PerformanceView } from '../../src/expression/mpmTree.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import type { Element } from '../../src/xml/XomTypes.js';
import { elementAt } from '../../src/prelude/index.js';

/** Wrap a body in an `<mpm>` root carrying the MPM default namespace. */
export function mpmDocument(body: string): string {
  return `<mpm xmlns="${MPM_NAMESPACE}">${body}</mpm>`;
}

/** Wrap a body in a single named `<performance>` inside an `<mpm>` root. */
export function performanceDocument(body: string, name = 'P'): string {
  return mpmDocument(`<performance name="${name}">${body}</performance>`);
}

/** A `<global>` environment from its header and dated bodies. */
export function globalEnvironment(header: string, dated: string): string {
  return `<global><header>${header}</header><dated>${dated}</dated></global>`;
}

/** A `<part>` environment from its header and dated bodies. */
export function partEnvironment(header: string, dated: string, name = 'A', number = 1): string {
  return (
    `<part name="${name}" number="${number}" midi.channel="0" midi.port="0">` +
    `<header>${header}</header><dated>${dated}</dated></part>`
  );
}

/** The `id` attributes of an element's children, in document order — a readable order assertion. */
export function idsOf(
  elements: readonly { getAttributeValue(name: string): string | null }[],
): string[] {
  return elements.map((element) => element.getAttributeValue('id') ?? '?');
}

/**
 * The sole performance of a fixture document, and part `index` of it — both checked.
 *
 * `readPerformances(parseMpmRoot(text))[0]` is `PerformanceView | undefined` under
 * `noUncheckedIndexedAccess`, and every test in this directory hangs its whole body off that
 * one read. A parse that found no performance used to surface as "cannot read properties of
 * undefined" on whichever property the test happened to touch first, in a test whose name is
 * about something else; these fail at the read and say what was missing.
 */
export function soleOf(text: string): PerformanceView {
  return soleIn(parseMpmRoot(text));
}

/** As {@link soleOf}, for a caller that holds the root — because it also asserts on the root. */
export function soleIn(root: Element): PerformanceView {
  return elementAt(readPerformances(root), 0, 'the document’s performances');
}

export function partAt(performance: PerformanceView, index: number) {
  return elementAt(performance.parts, index, 'the performance’s parts');
}

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
import { MPM_NAMESPACE } from '../../src/mpm/names.js';

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

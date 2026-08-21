/**
 * The per-method behavioural probe RULE M2a demands before any navigation implementation is
 * merged into another (ARCHITECTURE.md §9, and the "forbidden in T14" row of §11).
 *
 * Four functions in `src/xml/tree.ts` used to be TypeScript overload sets whose two arms were
 * told apart at runtime by `typeof arg1`. Reading them as "the same lookup, arguments either
 * way round" is the mistake this file exists to prevent: three of the four carry **two
 * genuinely different implementations**, and two of those disagree on inputs a caller can
 * actually reach.
 *
 * So the arms were given separate names rather than merged — a rename changes no behaviour by
 * construction, where a merge would have had to pick a winner on the byte-compared
 * serialisation path. This file pins the differences that make the merge illegal, so that
 * anyone who later proposes one has to delete an explicit, failing assertion rather than an
 * absence of evidence.
 *
 * Each test states BOTH answers. Where they agree, the test says so and the merge is merely
 * unmotivated; where they differ, the test names the input and the merge is a behaviour change.
 */
import { describe, it, expect } from 'vitest';
import { Element, Text } from '../../src/xml/XomTypes.js';
import {
  firstChildElement,
  firstChildElementOf,
  getNextSiblingElement,
  immediateNextSiblingElement,
  getPreviousSiblingElement,
  immediatePreviousSiblingElement,
  requireFirstChildElement,
} from '../../src/xml/tree.js';

const MEI = 'http://www.music-encoding.org/ns/mei';
const MPM = 'http://www.cemfi.de/mpm/ns/1.0';

// ---------------------------------------------------------------------------
// firstChildElement(name, ofThis)  vs  firstChildElementOf(ofThis, localname?)
// ---------------------------------------------------------------------------
describe('the two first-child implementations', () => {
  /**
   * The one input on which they genuinely disagree, and therefore the reason both survive.
   * `firstChildElementOf` inherits an early `return null` from the XPath query it replaced;
   * the walking form has no such guard and looks for a child whose local name is literally
   * the empty string — which, for an element built as `new Element('')`, it finds.
   */
  it('DIFFER on an empty name: the walk finds the empty-named child, the query form does not', () => {
    const parent = new Element('dated');
    const empty = new Element('');
    parent.appendChild(empty);

    expect(firstChildElementOf(parent, '')).toBeNull();
    expect(firstChildElement('', parent)).toBe(empty);
  });

  it('agree on a plain named lookup', () => {
    const parent = new Element('part');
    const a = new Element('note');
    const b = new Element('note');
    parent.appendChild(new Element('rest'));
    parent.appendChild(a);
    parent.appendChild(b);

    expect(firstChildElement('note', parent)).toBe(a);
    expect(firstChildElementOf(parent, 'note')).toBe(a);
  });

  it('agree when nothing matches', () => {
    const parent = new Element('part');
    parent.appendChild(new Element('rest'));

    expect(firstChildElement('note', parent)).toBeNull();
    expect(firstChildElementOf(parent, 'note')).toBeNull();
  });

  /**
   * The case RULE M2a names explicitly: same local name, different namespaces. Both forms
   * match on LOCAL name and so both return the first in document order, ignoring the
   * namespace split. Recorded because a merge onto a namespace-aware primitive would change
   * this, and the byte-compared MEI path relies on it.
   */
  it('agree on same-local-name children in different namespaces — both match local name only', () => {
    const parent = new Element('score', MEI);
    const inMpm = new Element('note', MPM);
    const inMei = new Element('note', MEI);
    parent.appendChild(inMpm);
    parent.appendChild(inMei);

    expect(firstChildElement('note', parent)).toBe(inMpm);
    expect(firstChildElementOf(parent, 'note')).toBe(inMpm);
  });

  it('agree that a namespaced child is found by its bare local name', () => {
    const parent = new Element('performance', MPM);
    const child = new Element('tempoMap', MPM);
    parent.appendChild(child);

    expect(firstChildElement('tempoMap', parent)).toBe(child);
    expect(firstChildElementOf(parent, 'tempoMap')).toBe(child);
  });

  /** Only the subject-first form has an unnamed mode; the walk cannot express it. */
  it('firstChildElementOf with no name returns the first element child of any name', () => {
    const parent = new Element('dated');
    parent.appendChild(new Text('   '));
    const first = new Element('tempoMap', MPM);
    parent.appendChild(first);

    expect(firstChildElementOf(parent)).toBe(first);
  });

  it('requireFirstChildElement throws where firstChildElementOf returns null', () => {
    const parent = new Element('part');
    expect(firstChildElementOf(parent, 'note')).toBeNull();
    expect(() => requireFirstChildElement(parent, 'note')).toThrow(/no child element 'note'/);
  });
});

// ---------------------------------------------------------------------------
// the sibling walkers — the named arm skips non-elements, the immediate arm does not
// ---------------------------------------------------------------------------
describe('the two sibling implementations', () => {
  /**
   * The difference that makes these two separate functions rather than one with a filter,
   * and the reason the old `getNextSiblingElement(ofThis)` arm is now called
   * `immediateNextSiblingElement`: a text node between two elements stops the immediate
   * form dead and is stepped over by the named one.
   */
  it('DIFFER across a text node: the named arm skips it, the immediate arm stops', () => {
    const parent = new Element('part');
    const first = new Element('note');
    const second = new Element('note');
    parent.appendChild(first);
    parent.appendChild(new Text('\n  '));
    parent.appendChild(second);

    expect(getNextSiblingElement('note', first)).toBe(second);
    expect(immediateNextSiblingElement(first)).toBeNull();

    expect(getPreviousSiblingElement('note', second)).toBe(first);
    expect(immediatePreviousSiblingElement(second)).toBeNull();
  });

  it('agree when the siblings are directly adjacent and share the name', () => {
    const parent = new Element('part');
    const first = new Element('note');
    const second = new Element('note');
    parent.appendChild(first);
    parent.appendChild(second);

    expect(getNextSiblingElement('note', first)).toBe(second);
    expect(immediateNextSiblingElement(first)).toBe(second);

    expect(getPreviousSiblingElement('note', second)).toBe(first);
    expect(immediatePreviousSiblingElement(second)).toBe(first);
  });

  /**
   * A second real difference, independent of text nodes: the immediate arm answers with
   * whatever element comes next, the named arm keeps looking for the name.
   */
  it('DIFFER when the adjacent element has a different name', () => {
    const parent = new Element('part');
    const note = new Element('note');
    const rest = new Element('rest');
    const later = new Element('note');
    parent.appendChild(note);
    parent.appendChild(rest);
    parent.appendChild(later);

    expect(immediateNextSiblingElement(note)).toBe(rest);
    expect(getNextSiblingElement('note', note)).toBe(later);
  });

  it('agree on a detached element — both say null', () => {
    const orphan = new Element('note');
    expect(getNextSiblingElement('note', orphan)).toBeNull();
    expect(immediateNextSiblingElement(orphan)).toBeNull();
    expect(getPreviousSiblingElement('note', orphan)).toBeNull();
    expect(immediatePreviousSiblingElement(orphan)).toBeNull();
  });

  it('agree at the ends of the child list', () => {
    const parent = new Element('part');
    const only = new Element('note');
    parent.appendChild(only);

    expect(getNextSiblingElement('note', only)).toBeNull();
    expect(immediateNextSiblingElement(only)).toBeNull();
    expect(getPreviousSiblingElement('note', only)).toBeNull();
    expect(immediatePreviousSiblingElement(only)).toBeNull();
  });

  it('agree that siblings are matched on local name across namespaces', () => {
    const parent = new Element('score', MEI);
    const first = new Element('note', MEI);
    const second = new Element('note', MPM);
    parent.appendChild(first);
    parent.appendChild(second);

    expect(getNextSiblingElement('note', first)).toBe(second);
    expect(immediateNextSiblingElement(first)).toBe(second);
  });
});

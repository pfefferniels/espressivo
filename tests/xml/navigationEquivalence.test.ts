/**
 * Behavioural probe for the navigation primitives that were rewritten for speed
 * (ARCHITECTURE.md RULE M2a, §9).
 *
 * Five functions on the MSM/MPM ⇒ MIDI path used to be written in a shape that is
 * quadratic in the size of the document — three of them by routing a structural query
 * through {@link Element.query}, which serialises the subtree, re-parses it, runs XPath
 * over the throwaway copy and maps every hit back by position. They were replaced by
 * direct traversals. Nothing about the *results* was meant to change, and this file is
 * what says so: each test states the old formulation inline and asserts that the shipped
 * one agrees with it, over the repository's own fixture documents rather than over
 * hand-built toys.
 *
 * The point of restating the old code here rather than citing it: these are equivalence
 * claims, and an equivalence claim needs both sides present to be checkable. If a future
 * change to one of these functions is a deliberate behaviour change, the corresponding
 * test below has to be edited in the same commit, which is exactly the review this asks
 * for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Element, Attribute, type XomNode } from '../../src/xml/XomTypes.js';
import {
  allChildElements,
  descendantElements,
  firstChildElementOf,
  getNextSiblingElement,
  getPreviousSiblingElement,
  reverseDescendantElements,
} from '../../src/xml/tree.js';
import { addToMap } from '../../src/msm/dateMap.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { bestGrowthRatio } from '../support/growthGuard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPARISON = join(HERE, '..', 'comparison', 'fixtures');
const REFERENCE = join(HERE, '..', 'integration', 'fixtures', 'reference');

/**
 * Real documents to walk: the comparison corpus (a few hundred notes each, several
 * parts, every map type between them) plus the MEI-derived reference MSMs. Parsed once —
 * the probes below only read.
 */
const documents: { readonly name: string; readonly root: Element }[] = [];
for (const [dir, ext] of [
  [COMPARISON, '.msm'],
  [COMPARISON, '.mpm'],
  [REFERENCE, '.msm'],
  [REFERENCE, '.mpm'],
] as const) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(ext))) {
    const text = readFileSync(join(dir, file), 'utf-8');
    const doc = ext === '.msm' ? new Msm(text) : new Mpm(text);
    const root = doc.getRootElement();
    if (root !== null) documents.push({ name: `${file}`, root });
  }
}

/** Every element in the document, root included, so the probes cover leaves too. */
function everyElement(root: Element): Element[] {
  return [root, ...descendantElements(root, () => true)];
}

it('the corpus this file probes against is actually there', () => {
  expect(documents.length).toBeGreaterThan(10);
  expect(everyElement(documents[0].root).length).toBeGreaterThan(50);
});

// ---------------------------------------------------------------------------
// descendantElements — replaced `query("descendant::*[…]")`
// ---------------------------------------------------------------------------
describe('descendantElements agrees with the XPath descendant axis', () => {
  /** The three predicates the port actually uses, with their original expressions. */
  const cases: { readonly xpath: string; readonly predicate: (e: Element) => boolean }[] = [
    {
      xpath: "descendant::*[contains(local-name(), 'Map') or local-name()='score']",
      predicate: (e) => e.getLocalName().includes('Map') || e.getLocalName() === 'score',
    },
    {
      xpath: "descendant::*[contains(local-name(), 'Styles')]",
      predicate: (e) => e.getLocalName().includes('Styles'),
    },
    {
      xpath: "descendant::*[contains(local-name(), 'Map')]",
      predicate: (e) => e.getLocalName().includes('Map'),
    },
    {
      xpath: 'descendant::*[attribute::date]',
      predicate: (e) => e.getAttribute('date') !== null,
    },
  ];

  for (const { xpath, predicate } of cases) {
    it(`${xpath} — same nodes, same order, same identities`, () => {
      for (const { name, root } of documents) {
        const viaXpath = root.query(xpath).toArray();
        const viaWalk = descendantElements(root, predicate);
        expect(viaWalk.length, `${name}: count`).toBe(viaXpath.length);
        for (let i = 0; i < viaXpath.length; ++i)
          expect(viaWalk[i] === viaXpath[i], `${name}: node ${i}`).toBe(true);
      }
    });
  }

  it('excludes the context node itself, as `descendant::` does', () => {
    const root = new Element('scoreMap');
    const child = new Element('scoreMap');
    root.appendChild(child);
    expect(descendantElements(root, (e) => e.getLocalName() === 'scoreMap')).toEqual([child]);
  });

  it('searches below a match too, so nested maps are all reported', () => {
    const outer = new Element('outerMap');
    const inner = new Element('innerMap');
    const deepest = new Element('deepestMap');
    inner.appendChild(deepest);
    outer.appendChild(inner);
    const found = descendantElements(outer, (e) => e.getLocalName().includes('Map'));
    expect(found).toEqual([inner, deepest]);
  });

  it('is pre-order, not level-order', () => {
    const root = new Element('root');
    const a = new Element('a');
    const aChild = new Element('a-child');
    const b = new Element('b');
    a.appendChild(aChild);
    root.appendChild(a);
    root.appendChild(b);
    expect(descendantElements(root, () => true).map((e) => e.getLocalName())).toEqual([
      'a',
      'a-child',
      'b',
    ]);
  });

  it('survives a document deep enough to overflow a recursive walk', () => {
    const root = new Element('root');
    let tip = root;
    for (let i = 0; i < 50_000; ++i) {
      const next = new Element('level');
      tip.appendChild(next);
      tip = next;
    }
    expect(descendantElements(root, () => true).length).toBe(50_000);
  });
});

// ---------------------------------------------------------------------------
// reverseDescendantElements — replaced `descendantElements(…)` read back to front
// ---------------------------------------------------------------------------
describe('reverseDescendantElements is descendantElements read backwards, lazily', () => {
  /**
   * The claim is exactly this: same elements, reversed. Both call sites — `addToMap` and
   * the converter's tie handling — used to build the array and index down from its end,
   * so anything else here is a behaviour change.
   */
  const predicates: { readonly what: string; readonly predicate: (e: Element) => boolean }[] = [
    { what: 'every element', predicate: () => true },
    { what: 'dated elements', predicate: (e) => e.getAttribute('date') !== null },
    { what: 'notes with a tie', predicate: (e) => e.getLocalName() === 'note' },
    { what: 'nothing at all', predicate: () => false },
  ];

  for (const { what, predicate } of predicates) {
    it(`${what} — same identities, exactly reversed`, () => {
      for (const { name, root } of documents) {
        const forwards = descendantElements(root, predicate);
        const backwards = [...reverseDescendantElements(root, predicate)];
        expect(backwards.length, `${name}: count`).toBe(forwards.length);
        for (let i = 0; i < forwards.length; ++i)
          expect(backwards[i] === forwards[forwards.length - 1 - i], `${name}: node ${i}`).toBe(
            true,
          );
      }
    });
  }

  it('excludes the context node itself, as `descendant::` does', () => {
    const root = new Element('scoreMap');
    const child = new Element('scoreMap');
    root.appendChild(child);
    expect([...reverseDescendantElements(root, () => true)]).toEqual([child]);
  });

  it('is reverse pre-order: a later subtree comes out before an earlier one, child before parent', () => {
    const root = new Element('root');
    const a = new Element('a');
    const aChild = new Element('a-child');
    const b = new Element('b');
    a.appendChild(aChild);
    root.appendChild(a);
    root.appendChild(b);
    expect([...reverseDescendantElements(root, () => true)].map((e) => e.getLocalName())).toEqual([
      'b',
      'a-child',
      'a',
    ]);
  });

  it('searches below a match too, so nested maps are all reported', () => {
    const outer = new Element('outerMap');
    const inner = new Element('innerMap');
    const deepest = new Element('deepestMap');
    inner.appendChild(deepest);
    outer.appendChild(inner);
    expect([...reverseDescendantElements(outer, (e) => e.getLocalName().includes('Map'))]).toEqual([
      deepest,
      inner,
    ]);
  });

  it('survives a document deep enough to overflow a recursive walk', () => {
    const root = new Element('root');
    let tip = root;
    for (let i = 0; i < 50_000; ++i) {
      const next = new Element('level');
      tip.appendChild(next);
      tip = next;
    }
    expect([...reverseDescendantElements(root, () => true)].length).toBe(50_000);
  });

  it('skips text children, and yields nothing for a childless element', () => {
    const root = new Element('root');
    root.appendChild('some text');
    expect([...reverseDescendantElements(root, () => true)]).toEqual([]);
  });

  /**
   * The whole point of the rewrite, stated exactly rather than as a timing: a caller that
   * wants only the last element must not pay for the other 9999. This is the property
   * `addToMap` depends on for its linearity, and a counted predicate proves it without a
   * clock.
   */
  it('touches only the last element when the caller asks for only the last element', () => {
    const score = new Element('score');
    for (let i = 0; i < 10_000; ++i) score.appendChild(new Element('note'));

    let tested = 0;
    const walk = reverseDescendantElements(score, () => {
      tested++;
      return true;
    });
    const first = walk.next();

    expect(first.done).toBe(false);
    expect(first.value === score.getChild(9_999)).toBe(true);
    expect(tested).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// allChildElements / firstChildElement — replaced `query("child::*[…]")`
// ---------------------------------------------------------------------------
describe('the child-axis helpers agree with the XPath they replaced', () => {
  it('allChildElements(parent, name) matches child::*[local-name()=name]', () => {
    for (const { name, root } of documents) {
      for (const element of everyElement(root)) {
        const names = new Set(descendantElements(element, () => true).map((e) => e.getLocalName()));
        for (const localName of names) {
          const viaXpath = element.query(`child::*[local-name()='${localName}']`).toArray();
          const viaWalk = allChildElements(element, localName);
          expect(viaWalk.length, `${name}: ${localName}`).toBe(viaXpath.length);
          for (let i = 0; i < viaXpath.length; ++i) expect(viaWalk[i] === viaXpath[i]).toBe(true);
        }
      }
    }
  });

  it('allChildElements(parent) matches child::*', () => {
    for (const { name, root } of documents) {
      for (const element of everyElement(root)) {
        const viaXpath = element.query('child::*').toArray();
        const viaWalk = allChildElements(element);
        expect(viaWalk.length, name).toBe(viaXpath.length);
        for (let i = 0; i < viaXpath.length; ++i) expect(viaWalk[i] === viaXpath[i]).toBe(true);
      }
    }
  });

  /**
   * The corpus above is MSM and MPM, which have no `layer` elements — an MSM note carries
   * `layer` as an *attribute*. So the one MEI shape that reaches `allChildElements`
   * through this rewrite, `processLayer`'s scan for a layer's siblings, is stated here on
   * a tree of its own. Without it, breaking that call site leaves the whole suite green:
   * no fixture has a measure in which an earlier layer ends later than the last one, so
   * the maximum it folds is never observably a maximum.
   */
  it("a staff's layers: allChildElements(staff, 'layer') matches child::*[local-name()='layer']", () => {
    const staff = new Element('staff');
    for (const [name, currentDate] of [
      ['layer', '720.0'],
      ['clef', ''],
      ['layer', '1440.0'],
      ['layer', '360.0'],
    ] as const) {
      const child = new Element(name);
      if (currentDate !== '') child.addAttribute(new Attribute('currentDate', currentDate));
      staff.appendChild(child);
    }

    const viaXpath = staff.query("child::*[local-name()='layer']").toArray();
    const viaWalk = allChildElements(staff, 'layer');
    expect(viaWalk.length).toBe(3);
    expect(viaXpath.length).toBe(3);
    for (let i = 0; i < viaXpath.length; ++i) expect(viaWalk[i] === viaXpath[i]).toBe(true);
    expect(viaWalk.map((e) => e.getAttributeValue('currentDate'))).toEqual([
      '720.0',
      '1440.0',
      '360.0',
    ]);
  });

  it('firstChildElement(ofThis, localname) matches the first XPath hit', () => {
    for (const { root } of documents) {
      for (const element of everyElement(root)) {
        // One query per distinct child name: a repeated name asks the same question, and
        // the query path is slow enough that asking it per child dominated the suite.
        for (const localName of new Set(allChildElements(element).map((e) => e.getLocalName()))) {
          const viaXpath = element.query(`child::*[local-name()='${localName}']`);
          const expected = viaXpath.size() === 0 ? null : (viaXpath.get(0) as Element);
          expect(firstChildElementOf(element, localName) === expected).toBe(true);
        }
      }
    }
  });

  it('still returns null for an empty localname, as the query form did', () => {
    const parent = new Element('dated');
    parent.appendChild(new Element(''));
    expect(firstChildElementOf(parent, '')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// the sibling walkers — replaced a scan of the whole child-element list per step
// ---------------------------------------------------------------------------
describe('the sibling walkers agree with the scans they replaced', () => {
  /** `getNextSiblingElement(name, ofThis)` as it was written before T-perf. */
  function nextByBackwardScan(name: string, ofThis: Element): Element | null {
    const parent = ofThis.getParent();
    if (parent === null) return null;
    const es = parent.getChildElements();
    let candidate: Element | null = null;
    for (let i = es.size() - 1; i >= 0; --i) {
      if (es.get(i) === ofThis) return candidate;
      if (es.get(i).getLocalName() === name) candidate = es.get(i);
    }
    return null;
  }

  /** `getPreviousSiblingElement(name, ofThis)` as it was written before T-perf. */
  function previousByForwardScan(name: string, ofThis: Element): Element | null {
    const parent = ofThis.getParent();
    if (parent === null) return null;
    const es = parent.getChildElements();
    let candidate: Element | null = null;
    for (let i = 0; i < es.size(); ++i) {
      if (ofThis === es.get(i)) return candidate;
      if (es.get(i).getLocalName() === name) candidate = es.get(i);
    }
    return null;
  }

  it('give the same answer for every element in the corpus, under every sibling name', () => {
    for (const { name, root } of documents) {
      for (const element of everyElement(root)) {
        const parent = element.getParent();
        if (parent === null) continue;
        const names = new Set(allChildElements(parent).map((e) => e.getLocalName()));
        for (const localName of names) {
          expect(
            getNextSiblingElement(localName, element) === nextByBackwardScan(localName, element),
            `${name}: next ${localName}`,
          ).toBe(true);
          expect(
            getPreviousSiblingElement(localName, element) ===
              previousByForwardScan(localName, element),
            `${name}: previous ${localName}`,
          ).toBe(true);
        }
      }
    }
  });

  it('agree on a detached element — both say null', () => {
    const orphan = new Element('note');
    const parent = new Element('score');
    parent.appendChild(new Element('note'));
    // `orphan` reports `parent` but is not in its child list, the text-node-adjacent case.
    expect(getNextSiblingElement('note', orphan)).toBeNull();
    expect(getPreviousSiblingElement('note', orphan)).toBeNull();
  });

  it('skip text nodes between the siblings, and never return `ofThis`', () => {
    const parent = new Element('score');
    const first = new Element('note');
    const second = new Element('note');
    parent.appendChild(first);
    parent.appendChild('   ');
    parent.appendChild(second);
    expect(getNextSiblingElement('note', first)).toBe(second);
    expect(getNextSiblingElement('note', second)).toBeNull();
    expect(getPreviousSiblingElement('note', second)).toBe(first);
    expect(getPreviousSiblingElement('note', first)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Element.indexOf — memoised, and must not drift from Array.prototype.indexOf
// ---------------------------------------------------------------------------
describe('the memoised indexOf tracks every child mutation', () => {
  it('answers as Array.prototype.indexOf would after each step of a mutation script', () => {
    const parent = new Element('dated');
    const made: XomNode[] = [];
    const child = (n: number): Element => {
      const e = new Element(`e${n}`);
      made.push(e);
      return e;
    };

    // Interleave reads with every mutator, so a stale memo cannot survive unnoticed.
    const check = (): void => {
      for (const node of made) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (parent as any)._children.indexOf(node) as number;
        expect(parent.indexOf(node)).toBe(raw);
      }
    };

    for (let i = 0; i < 6; ++i) parent.appendChild(child(i));
    check();
    parent.insertChild(child(6), 0);
    check();
    parent.insertChild(child(7), 3);
    check();
    parent.insertChild(child(8), parent.getChildCount());
    check();
    parent.removeChild(made[2]);
    check();
    parent.removeChildAt(0);
    check();
    parent.replaceChild(made[4], child(9));
    check();
    parent.appendChild(child(10));
    check();
    parent.removeChildren();
    check();
  });

  it('reports the first position of a node re-parented away and back', () => {
    const a = new Element('a');
    const b = new Element('b');
    const moved = new Element('moved');
    a.appendChild(new Element('filler'));
    a.appendChild(moved);
    expect(a.indexOf(moved)).toBe(1);
    b.appendChild(moved); // appendChild detaches from `a` first
    expect(a.indexOf(moved)).toBe(-1);
    expect(b.indexOf(moved)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Element.reorderChildren — replaced GenericMap.sortXml's remove/insert loop
// ---------------------------------------------------------------------------
describe('reorderChildren produces what the remove-and-insert loop produced', () => {
  /** `GenericMap.sortXml` as it was written before T-perf. */
  function byRemoveInsertLoop(parent: Element, order: readonly XomNode[]): void {
    for (let i = 0; i < order.length; ++i) {
      parent.removeChild(order[i]);
      parent.insertChild(order[i], i);
    }
  }

  /** A parent holding `n` elements with text nodes wedged between them. */
  function build(n: number): { parent: Element; children: Element[] } {
    const parent = new Element('someMap');
    const children: Element[] = [];
    for (let i = 0; i < n; ++i) {
      const e = new Element(`e${i}`);
      children.push(e);
      parent.appendChild(e);
      parent.appendChild('\n  ');
    }
    return { parent, children };
  }

  const shapes: { readonly what: string; readonly pick: (c: Element[]) => Element[] }[] = [
    { what: 'a full reversal', pick: (c) => [...c].reverse() },
    { what: 'the identity', pick: (c) => [...c] },
    { what: 'a rotation', pick: (c) => [...c.slice(3), ...c.slice(0, 3)] },
    { what: 'a subset, leaving the rest to drift', pick: (c) => c.filter((_, i) => i % 3 === 0) },
    { what: 'nothing at all', pick: () => [] },
  ];

  for (const { what, pick } of shapes) {
    it(`${what}: same children, same order`, () => {
      const fast = build(9);
      const slow = build(9);
      fast.parent.reorderChildren(pick(fast.children));
      byRemoveInsertLoop(slow.parent, pick(slow.children));
      expect(fast.parent.toXML()).toBe(slow.parent.toXML());
      expect(fast.parent.getChildCount()).toBe(slow.parent.getChildCount());
    });
  }

  it('adopts a node that is not yet a child, exactly as the loop did', () => {
    const fast = build(4);
    const slow = build(4);
    const adoptFast = new Element('adopted');
    const adoptSlow = new Element('adopted');
    fast.parent.reorderChildren([adoptFast, ...fast.children]);
    byRemoveInsertLoop(slow.parent, [adoptSlow, ...slow.children]);
    expect(fast.parent.toXML()).toBe(slow.parent.toXML());
    expect(adoptFast.getParent()).toBe(fast.parent);
  });

  it('hands a duplicated entry back to the loop rather than duplicating the child', () => {
    const fast = build(3);
    const slow = build(3);
    const dup = (c: Element[]): Element[] => [c[0], c[1], c[0]];
    fast.parent.reorderChildren(dup(fast.children));
    byRemoveInsertLoop(slow.parent, dup(slow.children));
    expect(fast.parent.toXML()).toBe(slow.parent.toXML());
  });

  it('leaves every reordered child parented to the element', () => {
    const { parent, children } = build(5);
    parent.reorderChildren([...children].reverse());
    for (const child of children) expect(child.getParent()).toBe(parent);
  });

  it('keeps indexOf correct afterwards', () => {
    const { parent, children } = build(5);
    const order = [...children].reverse();
    parent.reorderChildren(order);
    for (let i = 0; i < order.length; ++i) expect(parent.indexOf(order[i])).toBe(i);
  });
});

// ---------------------------------------------------------------------------
// A guard on the shape of the whole thing: these are linear, not quadratic.
// ---------------------------------------------------------------------------
describe('the rewritten primitives are linear in the size of the document', () => {
  /** Build a map of `n` dated children, the shape a `<score>` has. */
  function scoreOf(n: number): Element {
    const score = new Element('score');
    for (let i = 0; i < n; ++i) {
      const note = new Element('note');
      note.addAttribute(new Attribute('date', `${i * 360}.0`));
      score.appendChild(note);
    }
    return score;
  }

  /**
   * Cost of one call, in milliseconds — the measurement these guards stand on.
   *
   * A single call here takes a few microseconds, which no wall clock can time: the first
   * version of these tests compared one call against one call and was flaky on a loaded
   * machine, in both directions. So the work is repeated until a batch is long enough to
   * measure (20 ms), and the reported figure is the *fastest* such batch, because noise
   * only ever adds time — the minimum is the closest a wall clock gets to the work itself,
   * where an average follows whichever batch met the garbage collector.
   */
  function perOperation(work: () => void, targetMs = 20, samples = 3): number {
    let batch = 1;
    let best = Infinity;
    for (;;) {
      const before = performance.now();
      for (let i = 0; i < batch; ++i) work();
      const elapsed = performance.now() - before;
      if (elapsed >= targetMs) {
        best = elapsed / batch;
        break;
      }
      batch *= 2;
    }
    for (let sample = 1; sample < samples; ++sample) {
      const before = performance.now();
      for (let i = 0; i < batch; ++i) work();
      best = Math.min(best, (performance.now() - before) / batch);
    }
    return best;
  }

  /**
   * How much dearer one call gets when the score gets {@link STEP} times longer. Linear
   * work lands at {@link STEP}; the quadratic shapes these functions used to have land near
   * `STEP²`.
   *
   * Calibrated rather than guessed. Measured on this machine, idle and under sixfold CPU
   * oversubscription: the shipped implementations land between 14 and 27, and the
   * formulations they replaced — the backward sibling scan and the remove-then-insert
   * reorder — between 199 and 261. {@link THRESHOLD} sits between those bands with room on
   * both sides, so a loaded CI machine does not go red and a reintroduced quadratic cannot
   * pass.
   */
  const STEP = 16;
  const THRESHOLD = 64;

  function growth(work: (score: Element) => void, n: number): number {
    const small = scoreOf(n);
    const large = scoreOf(n * STEP);
    work(small); // warm the shapes before either measurement
    work(large);
    return perOperation(() => work(large)) / perOperation(() => work(small));
  }

  it('walking a score note by note with getNextSiblingElement', () => {
    const ratio = bestGrowthRatio(
      () =>
        growth((score) => {
          let note = firstChildElementOf(score, 'note');
          let seen = 0;
          while (note !== null) {
            seen++;
            note = getNextSiblingElement('note', note);
          }
          expect(seen).toBe(score.getChildCount());
        }, 400),
      THRESHOLD,
    );
    expect(ratio).toBeLessThan(THRESHOLD);
  });

  it('collecting every dated descendant', () => {
    const ratio = bestGrowthRatio(
      () =>
        growth((score) => {
          descendantElements(score, (e) => e.getAttribute('date') !== null);
        }, 400),
      THRESHOLD,
    );
    expect(ratio).toBeLessThan(THRESHOLD);
  });

  it('reordering a whole score', () => {
    const ratio = bestGrowthRatio(
      () =>
        growth((score) => {
          score.reorderChildren([...allChildElements(score)].reverse());
        }, 400),
      THRESHOLD,
    );
    expect(ratio).toBeLessThan(THRESHOLD);
  });

  /**
   * Filling a map with `addToMap`, which is how the converter builds every `<score>`.
   *
   * This one cannot use {@link growth}: `addToMap` mutates, so each measured call has to
   * start from an empty map and build its own notes rather than reuse a prebuilt score.
   * The normalisation is the same — one "call" processes the whole score, so linear work
   * lands at {@link STEP} and the array-building formulation this replaced, which scanned
   * the whole map per insertion, lands near `STEP²`.
   */
  it('filling a score note by note with addToMap', () => {
    const fill = (n: number) => {
      const map = new Element('score');
      for (let i = 0; i < n; ++i) {
        const note = new Element('note');
        note.addAttribute(new Attribute('date', `${i * 360}.0`));
        addToMap(note, map);
      }
      expect(map.getChildCount()).toBe(n);
    };
    fill(400); // warm the shapes before either measurement
    fill(400 * STEP);
    const ratio = bestGrowthRatio(
      () => perOperation(() => fill(400 * STEP)) / perOperation(() => fill(400)),
      THRESHOLD,
    );
    expect(ratio).toBeLessThan(THRESHOLD);
  });
});

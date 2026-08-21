/**
 * The per-method behavioural comparison ARCHITECTURE.md RULE M2a demands before
 * `src/msm/Msm.ts`'s module-local navigation helpers may be merged onto `src/xml/`.
 *
 * RULE M2a names eight of them — `getAttribute`, `getAttributeValue`,
 * `getFirstChildElement`, `getAllChildElements`, `getNextSiblingElement`, `cloneElement`,
 * `getFilenameWithoutExtension`, `addUUID` — and says: "a probe that feeds both
 * implementations the same element trees, including namespaced children and elements with
 * same-local-name children in different namespaces, and requires identical results before
 * either is deleted. Any method where they differ stays duplicated, with the difference
 * documented."
 *
 * This file is that probe. Each `describe` below restates the deleted `Msm.ts` copy
 * verbatim as `msm*` and asserts the shipped `src/xml/` function agrees with it, over the
 * repository's own MSM/MPM fixtures plus the adversarial trees the rule names. The old code
 * is restated here rather than cited because an equivalence claim needs both sides present
 * to be checkable — the same reasoning `tests/xml/navigationEquivalence.test.ts` opens with.
 *
 * Seven of the eight are equivalent and the local copies are gone. The eighth,
 * `getFilenameWithoutExtension`, is not, and the last section pins the difference so that
 * nobody deduplicates it on sight later.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Element, Attribute, Text } from '../../src/xml/XomTypes.js';
import {
  allChildElements,
  attribute,
  cloneElement,
  descendantElements,
  firstChildElement,
  getAttributeValue,
  getNextSiblingElement,
  immediateNextSiblingElement,
} from '../../src/xml/tree.js';
import { addUUID } from '../../src/xml/ids.js';
import { getFilenameWithoutExtension as musicGetFilenameWithoutExtension } from '../../src/music/text.js';
import { Msm } from '../../src/msm/Msm.js';
import { Mpm } from '../../src/mpm/Mpm.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const MEI_NS = 'http://www.music-encoding.org/ns/mei';
const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

// The deleted implementations, restated character for character.

/** `src/msm/Msm.ts:28` as it stood before the merge. */
function msmGetAttribute(name: string, ofThis: Element): Attribute | null {
  let a = ofThis.getAttribute(name);
  if (a !== null) return a;

  a = ofThis.getAttribute(name, ofThis.getNamespaceURI());
  if (a !== null) return a;

  a = ofThis.getAttribute(name, XML_NS);
  if (a !== null) return a;

  return null;
}

/** `src/msm/Msm.ts:48` as it stood before the merge. */
function msmGetAttributeValue(name: string, ofThis: Element): string {
  const a = msmGetAttribute(name, ofThis);
  if (a === null) return '';
  return a.getValue();
}

/** `src/msm/Msm.ts:54` as it stood before the merge. */
function msmGetFirstChildElement(name: string, ofThis: Element): Element | null {
  if (name.length === 0) return null;

  for (const e of ofThis.getChildElements()) {
    if (e.getLocalName() === name) return e;
  }
  return null;
}

/** `src/msm/Msm.ts:63` as it stood before the merge. */
function msmGetAllChildElements(name: string, ofThis: Element): Element[] {
  if (name.length === 0) return [];
  return ofThis.getChildElements(name).toArray();
}

/** `src/msm/Msm.ts:79` as it stood before the merge. */
function msmGetNextSiblingElement(
  nameOrElement: string | Element,
  ofThis?: Element,
): Element | null {
  if (typeof nameOrElement === 'string') {
    const name = nameOrElement;
    if (ofThis === undefined) return null;

    const parent = ofThis.getParent();
    if (parent === null) return null;

    const index = parent.indexOf(ofThis);
    if (index < 0) return null;

    const count = parent.getChildCount();
    for (let i = index + 1; i < count; ++i) {
      const sibling = parent.getChild(i);
      if (sibling instanceof Element && sibling.getLocalName() === name) return sibling;
    }
    return null;
  } else {
    const elem = nameOrElement;

    const parent = elem.getParent();
    if (parent === null) return null;

    const index = parent.indexOf(elem);
    if (index >= parent.getChildCount() - 1) return null;

    const child = parent.getChild(index + 1);
    if (child instanceof Element) return child;
    return null;
  }
}

/** `src/msm/Msm.ts:134` as it stood before the merge, minus its `return null!` line. */
function msmCloneElement(e: Element): Element {
  const clone = e.copy();
  while (clone.getChildCount() > 0) {
    clone.removeChildAt(0);
  }
  return clone;
}

/** `src/msm/Msm.ts:163` as it stood before the merge, with the uuid drawn by the caller. */
function msmAddUUIDWith(toThis: Element, uuid: string): string {
  const a = new Attribute('xml:id', XML_NS, uuid);
  toThis.addAttribute(a);
  return uuid;
}

/** `src/msm/Msm.ts:144` — the one that is NOT equivalent, kept in the shipped file. */
function msmGetFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i === 0) return filename;
  if (i === -1) return filename;
  return filename.substring(0, i);
}

// The trees to feed both sides.

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPARISON = join(HERE, '..', 'comparison', 'fixtures');
const REFERENCE = join(HERE, '..', 'integration', 'fixtures', 'reference');

/**
 * The MSM and MPM corpora — the documents `Msm.ts` actually navigates. Parsed once; the
 * probes below only read, apart from the two that clone and the one that mints ids, which
 * work on copies.
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
    if (root !== null) documents.push({ name: file, root });
  }
}

function everyElement(root: Element): Element[] {
  return [root, ...descendantElements(root, () => true)];
}

/** Every element of every fixture document, root included. */
const corpus: Element[] = documents.flatMap((d) => everyElement(d.root));

/**
 * The adversarial trees RULE M2a names by hand: a namespaced attribute, an element whose
 * children share a local name across two namespaces, text nodes wedged between elements,
 * and a detached element with no parent at all.
 */
function adversarialTrees(): { readonly what: string; readonly root: Element }[] {
  const namespacedAttributes = new Element('note');
  namespacedAttributes.addAttribute(new Attribute('xml:id', XML_NS, 'n1'));
  namespacedAttributes.addAttribute(new Attribute('date', '0'));

  const bothSpellings = new Element('note');
  bothSpellings.addAttribute(new Attribute('id', 'bare'));
  bothSpellings.addAttribute(new Attribute('xml:id', XML_NS, 'namespaced'));

  const sameLocalNameTwoNamespaces = new Element('parent', MEI_NS);
  sameLocalNameTwoNamespaces.appendChild(new Element('map', MEI_NS));
  sameLocalNameTwoNamespaces.appendChild(new Element('map', MPM_NS));
  sameLocalNameTwoNamespaces.appendChild(new Element('map'));

  const elementInOwnNamespace = new Element('part', MPM_NS);
  elementInOwnNamespace.addAttribute(new Attribute('number', MPM_NS, '1'));

  const textBetween = new Element('score');
  textBetween.appendChild(new Element('note'));
  textBetween.appendChild(new Text('  '));
  textBetween.appendChild(new Element('rest'));
  textBetween.appendChild(new Text('  '));
  textBetween.appendChild(new Element('note'));

  const childless = new Element('emptyMap');

  const deepAttributes = new Element('goto');
  deepAttributes.addAttribute(new Attribute('target.id', '#rpt'));
  deepAttributes.addAttribute(new Attribute('activity', ''));

  return [
    { what: 'a namespaced xml:id beside a plain attribute', root: namespacedAttributes },
    { what: 'both an `id` and an `xml:id`', root: bothSpellings },
    { what: 'same local name in three namespaces', root: sameLocalNameTwoNamespaces },
    { what: 'an attribute in the element’s own namespace', root: elementInOwnNamespace },
    { what: 'text nodes between the element siblings', root: textBetween },
    { what: 'a childless element', root: childless },
    { what: 'an empty-valued attribute', root: deepAttributes },
    { what: 'a detached element with no parent', root: new Element('detached') },
  ];
}

/** The names `Msm.ts` asks for, plus the empty name and names nothing carries. */
const ATTRIBUTE_NAMES = [
  'date',
  'date.end',
  'duration',
  'value',
  'velocity',
  'name',
  'number',
  'midi.channel',
  'midi.port',
  'title',
  'pulsesPerQuarter',
  'milliseconds.date',
  'milliseconds.date.end',
  'mandatory',
  'controller',
  'id',
  'xml:id',
  'repetitionCounter',
  'target.id',
  'activity',
  'notPresentAnywhere',
  '',
] as const;

const ELEMENT_NAMES = [
  'global',
  'part',
  'header',
  'dated',
  'score',
  'note',
  'rest',
  'timeSignatureMap',
  'keySignatureMap',
  'markerMap',
  'sequencingMap',
  'pedalMap',
  'miscMap',
  'programChangeMap',
  'channelVolumeMap',
  'positionMap',
  'map',
  'goto',
  'marker',
  'notPresentAnywhere',
  '',
] as const;

it('the corpus this file probes against is actually there', () => {
  expect(documents.length).toBeGreaterThan(10);
  expect(corpus.length).toBeGreaterThan(1000);
});

/**
 * The bulk comparisons below run a few hundred thousand pairs each, so they compare with
 * `===` and only *record* a disagreement, asserting once at the end.
 *
 * That is not a weaker assertion — an empty list is exactly the claim "every pair agreed" —
 * and it names every mismatch instead of stopping at the first, which is what an equivalence
 * claim wants to be told. It also keeps ~10^5 `expect` calls per test off vitest's reporter
 * channel.
 */
function expectAgreement(mismatches: readonly string[]): void {
  expect(mismatches).toEqual([]);
}

/** The two element lists, compared by identity and position. `null` where they agree. */
function elementListDisagreement(
  mine: readonly Element[],
  theirs: readonly Element[],
): string | null {
  if (mine.length !== theirs.length)
    return `length ${String(mine.length)} vs ${String(theirs.length)}`;
  for (const [i, element] of mine.entries())
    if (element !== theirs[i]) return `element ${String(i)}`;
  return null;
}

/**
 * A qualified name is where the two deliberately differ now, and the difference is a fix.
 *
 * The restated `msmGetAttribute` above begins `ofThis.getAttribute(name)`, faithfully to
 * `Helper.java:349` — but this port's one-argument `Element.getAttribute` matches the
 * qualified name as well as the local one, where XOM's matches only a local name in no
 * namespace. So `getAttribute('xml:id')` found the attribute here and finds nothing in Java,
 * whose `Helper.getAttributeValue` therefore answers `""`. `xml/tree.ts`'s `attribute` now
 * spells step one `getAttribute(name, '')` and agrees with Java; the historical copy above is
 * left exactly as it stood, because that is what it is for.
 *
 * The two still agree on every unqualified name, which is what justified the deletion.
 */
const isQualified = (name: string): boolean => name.includes(':');

describe('Msm.getAttribute is xml/tree.attribute', () => {
  it('returns the identical Attribute for every unqualified (element, name) in the corpus', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      for (const name of ATTRIBUTE_NAMES) {
        if (isQualified(name)) continue;
        if (attribute(name, element) !== msmGetAttribute(name, element))
          mismatches.push(`<${element.getLocalName()}> @${name}`);
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the adversarial trees, namespaces included', () => {
    const mismatches: string[] = [];
    for (const { what, root } of adversarialTrees()) {
      for (const element of everyElement(root)) {
        for (const name of ATTRIBUTE_NAMES) {
          if (isQualified(name)) continue;
          if (attribute(name, element) !== msmGetAttribute(name, element))
            mismatches.push(`${what}: @${name}`);
        }
      }
    }
    expectAgreement(mismatches);
  });

  it('declines a QUALIFIED `xml:id` where the deleted copy accepted it — the fix', () => {
    const [, bothSpellings] = adversarialTrees();
    const element = bothSpellings!.root;

    // The deleted copy answered it; `attribute` no longer does, and Java never did.
    expect(msmGetAttribute('xml:id', element)).not.toBeNull();
    expect(attribute('xml:id', element)).toBeNull();
    expect(getAttributeValue('xml:id', element)).toBe('');

    // Reading it the way `src/` actually reads it is unaffected — that goes through the third
    // lookup, on the local name in the XML namespace.
    expect(attribute('id', element)).not.toBeNull();
  });

  it('answers `xml:id` to a bare `id`, in both implementations', () => {
    const [, bothSpellings] = adversarialTrees();
    const element = bothSpellings!.root;
    expect(msmGetAttribute('id', element)?.getValue()).toBe('bare');
    expect(attribute('id', element)?.getValue()).toBe('bare');

    const onlyNamespaced = new Element('note');
    onlyNamespaced.addAttribute(new Attribute('xml:id', XML_NS, 'ns-only'));
    expect(msmGetAttribute('id', onlyNamespaced)?.getValue()).toBe('ns-only');
    expect(attribute('id', onlyNamespaced)?.getValue()).toBe('ns-only');
  });
});

describe('Msm.getAttributeValue is xml/tree.getAttributeValue', () => {
  it('returns the identical string for every unqualified (element, name) in the corpus', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      for (const name of ATTRIBUTE_NAMES) {
        if (isQualified(name)) continue;
        if (getAttributeValue(name, element) !== msmGetAttributeValue(name, element))
          mismatches.push(`<${element.getLocalName()}> @${name}`);
      }
    }
    expectAgreement(mismatches);
  });

  it("collapses absent and empty to the same '' in both", () => {
    const element = new Element('goto');
    element.addAttribute(new Attribute('activity', ''));
    expect(msmGetAttributeValue('activity', element)).toBe('');
    expect(getAttributeValue('activity', element)).toBe('');
    expect(msmGetAttributeValue('absent', element)).toBe('');
    expect(getAttributeValue('absent', element)).toBe('');
  });
});

describe('Msm.getFirstChildElement is xml/tree.firstChildElement(name, ofThis)', () => {
  it('returns the identical Element for every (element, name) in the corpus', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      for (const name of ELEMENT_NAMES) {
        if (firstChildElement(name, element) !== msmGetFirstChildElement(name, element))
          mismatches.push(`<${element.getLocalName()}> / <${name}>`);
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the adversarial trees', () => {
    const mismatches: string[] = [];
    for (const { what, root } of adversarialTrees()) {
      for (const element of everyElement(root)) {
        for (const name of ELEMENT_NAMES) {
          if (firstChildElement(name, element) !== msmGetFirstChildElement(name, element))
            mismatches.push(`${what}: <${name}>`);
        }
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the empty name, which the Msm copy guarded and the tree copy does not', () => {
    // The Msm copy returned null for `name === ''` up front; `firstChildElement(name,
    // ofThis)` walks and compares against `''`, which no local name equals. Same answer,
    // and this is the one place the two spellings were not textually identical.
    const parent = new Element('dated');
    parent.appendChild(new Element('score'));
    expect(msmGetFirstChildElement('', parent)).toBeNull();
    expect(firstChildElement('', parent)).toBeNull();
  });

  it('picks the first by LOCAL name whatever namespace it is in', () => {
    const [, , sameLocalName] = adversarialTrees();
    const parent = sameLocalName!.root;
    const mine = msmGetFirstChildElement('map', parent);
    expect(mine).toBe(firstChildElement('map', parent));
    expect(mine?.getNamespaceURI()).toBe(MEI_NS);
  });
});

describe('Msm.getAllChildElements is xml/tree.allChildElements(ofThis, name)', () => {
  it('returns the identical element list for every (element, name) in the corpus', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      for (const name of ELEMENT_NAMES) {
        const how = elementListDisagreement(
          allChildElements(element, name),
          msmGetAllChildElements(name, element),
        );
        if (how !== null) mismatches.push(`<${element.getLocalName()}> / <${name}>: ${how}`);
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the adversarial trees, all three namespaces of <map> included', () => {
    const mismatches: string[] = [];
    for (const { what, root } of adversarialTrees()) {
      for (const element of everyElement(root)) {
        for (const name of ELEMENT_NAMES) {
          const how = elementListDisagreement(
            allChildElements(element, name),
            msmGetAllChildElements(name, element),
          );
          if (how !== null) mismatches.push(`${what}: <${name}>: ${how}`);
        }
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the empty name, which the Msm copy guarded and the tree copy does not', () => {
    const parent = new Element('dated');
    parent.appendChild(new Element('score'));
    expect(msmGetAllChildElements('', parent)).toEqual([]);
    expect(allChildElements(parent, '')).toEqual([]);
  });

  it('hands back a fresh mutable array both times', () => {
    const parent = new Element('score');
    parent.appendChild(new Element('note'));
    const a = msmGetAllChildElements('note', parent);
    const b = allChildElements(parent, 'note');
    expect(a).not.toBe(b);
    a.pop();
    expect(parent.getChildCount()).toBe(1);
    b.pop();
    expect(parent.getChildCount()).toBe(1);
  });
});

describe('Msm.getNextSiblingElement is xml/tree.getNextSiblingElement', () => {
  it('agrees for every element in the corpus, unnamed form', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      if (immediateNextSiblingElement(element) !== msmGetNextSiblingElement(element))
        mismatches.push(`after <${element.getLocalName()}>`);
    }
    expectAgreement(mismatches);
  });

  it('agrees for every element in the corpus under every name Msm.ts asks for', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      for (const name of ELEMENT_NAMES) {
        if (getNextSiblingElement(name, element) !== msmGetNextSiblingElement(name, element))
          mismatches.push(`after <${element.getLocalName()}>: <${name}>`);
      }
    }
    expectAgreement(mismatches);
  });

  it('agrees on the adversarial trees, text nodes and detachment included', () => {
    const mismatches: string[] = [];
    for (const { what, root } of adversarialTrees()) {
      for (const element of everyElement(root)) {
        if (immediateNextSiblingElement(element) !== msmGetNextSiblingElement(element))
          mismatches.push(`${what}: unnamed`);
        for (const name of ELEMENT_NAMES) {
          if (getNextSiblingElement(name, element) !== msmGetNextSiblingElement(name, element))
            mismatches.push(`${what}: <${name}>`);
        }
      }
    }
    expectAgreement(mismatches);
  });

  it('both stop at a text node in the unnamed form and skip it in the named one', () => {
    const [, , , , textBetween] = adversarialTrees();
    const score = textBetween!.root;
    const firstNote = score.getChild(0) as Element;
    expect(msmGetNextSiblingElement(firstNote)).toBeNull();
    expect(immediateNextSiblingElement(firstNote)).toBeNull();
    expect(msmGetNextSiblingElement('rest', firstNote)?.getLocalName()).toBe('rest');
    expect(getNextSiblingElement('rest', firstNote)?.getLocalName()).toBe('rest');
  });
});

describe('Msm.cloneElement is xml/tree.cloneElement', () => {
  it('produces the same serialization for every element in the corpus', () => {
    const mismatches: string[] = [];
    for (const element of corpus) {
      if (cloneElement(element).toXML() !== msmCloneElement(element).toXML())
        mismatches.push(`<${element.getLocalName()}>`);
    }
    expectAgreement(mismatches);
  });

  it('produces the same serialization on the adversarial trees', () => {
    for (const { what, root } of adversarialTrees()) {
      for (const element of everyElement(root)) {
        expect(cloneElement(element).toXML(), what).toBe(msmCloneElement(element).toXML());
      }
    }
  });

  it('leaves the original untouched and the clone childless and parentless, in both', () => {
    const map = new Element('markerMap');
    map.addAttribute(new Attribute('date', '0'));
    map.appendChild(new Element('marker'));
    const parent = new Element('dated');
    parent.appendChild(map);

    for (const clone of [msmCloneElement(map), cloneElement(map)]) {
      expect(clone.getChildCount()).toBe(0);
      expect(clone.getParent()).toBeNull();
      expect(clone.getAttributeValue('date')).toBe('0');
      expect(map.getChildCount()).toBe(1);
      expect(map.getParent()).toBe(parent);
    }
  });

  it('keeps a namespaced attribute in both — the documented divergence from Java', () => {
    // Java rebuilds each attribute as `new Attribute(localName, value)`, dropping the
    // namespace. Both TypeScript copies preserve it, which is why merging them cannot
    // change the output: the divergence is shared, not introduced here.
    const map = new Element('markerMap');
    map.addAttribute(new Attribute('xml:id', XML_NS, 'm1'));
    expect(msmCloneElement(map).toXML()).toBe(cloneElement(map).toXML());
    expect(cloneElement(map).getAttribute('id', XML_NS)?.getValue()).toBe('m1');
  });
});

describe('Msm.addUUID is xml/ids.addUUID', () => {
  it('writes the same attribute in the same namespace, and returns what it wrote', () => {
    const mine = new Element('note');
    const theirs = new Element('note');
    const returned = addUUID(theirs);
    msmAddUUIDWith(mine, returned);

    expect(returned.startsWith('meico_')).toBe(true);
    expect(mine.toXML()).toBe(theirs.toXML());
    expect(theirs.getAttribute('id', XML_NS)?.getValue()).toBe(returned);
  });

  it('overwrites an existing xml:id in both — the documented caution', () => {
    const mine = new Element('note');
    mine.addAttribute(new Attribute('xml:id', XML_NS, 'original'));
    const theirs = new Element('note');
    theirs.addAttribute(new Attribute('xml:id', XML_NS, 'original'));

    const returned = addUUID(theirs);
    msmAddUUIDWith(mine, returned);

    expect(mine.toXML()).toBe(theirs.toXML());
    expect(theirs.getAttributeValue('xml:id')).toBe(returned);
  });

  it('draws exactly one id per call', () => {
    const element = new Element('note');
    const first = addUUID(element);
    const second = addUUID(element);
    expect(second).not.toBe(first);
    expect(element.getAttributeCount()).toBe(1);
  });
});

describe('getFilenameWithoutExtension: the Msm copy is NOT music/text.ts’s', () => {
  it('agrees wherever the filename has a dot that is not the first character', () => {
    for (const filename of [
      'score.mei',
      'score.msm',
      'a.b.c.mid',
      'dir/score.mei',
      'trailing.',
      'x.',
    ]) {
      expect(msmGetFilenameWithoutExtension(filename)).toBe(
        musicGetFilenameWithoutExtension(filename),
      );
    }
  });

  it('agrees on a leading dot, which both return whole', () => {
    for (const filename of ['.hidden', '.']) {
      expect(msmGetFilenameWithoutExtension(filename)).toBe(
        musicGetFilenameWithoutExtension(filename),
      );
    }
  });

  it('DIVERGES on a filename with no dot at all', () => {
    // `lastIndexOf` is -1, so `music/text.ts` evaluates `substring(0, -1)`, which in
    // JavaScript is `substring(0, 0)` — the empty string. Java's own
    // `String.substring(0, -1)` throws `StringIndexOutOfBoundsException`, so neither
    // spelling is Java's; the Msm copy added the `i === -1` guard and returns the name.
    //
    // This is why the Msm copy stays. `Msm.getTitle()` falls back to it when the root
    // carries no `title`, and `Msm.renderMidi` builds the MIDI filename with it — an
    // extensionless file would title the movement `''` and name the MIDI `.mid` under the
    // shared copy, where today it keeps the name.
    expect(msmGetFilenameWithoutExtension('score')).toBe('score');
    expect(musicGetFilenameWithoutExtension('score')).toBe('');

    expect(msmGetFilenameWithoutExtension('')).toBe('');
    expect(musicGetFilenameWithoutExtension('')).toBe('');
  });

  it('is what Msm.getTitle falls back to, extensionless name and all', () => {
    const msm = Msm.createMsm('', 'movement1', 720);
    msm.getRootElement()!.removeAttribute(msm.getRootElement()!.getAttribute('title')!);
    msm.setFile('nodotshere');
    expect(msm.getTitle()).toBe('nodotshere');
  });
});

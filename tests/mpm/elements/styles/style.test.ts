import { describe, it, expect } from 'vitest';
import { silenceConsoleError } from '../../../support/console.js';
import { okValue } from '../../../support/result.js';
import { Mpm } from '../../../../src/mpm/Mpm.js';
import { Header } from '../../../../src/mpm/elements/Header.js';
import { GenericMap } from '../../../../src/mpm/elements/maps/GenericMap.js';
import {
  collectionNameOfKind,
  createStyle,
  describeStyleError,
  numericBpmValue,
  numericDynamicsValue,
  parseStyle,
  styleKindOfCollection,
  styleOfKind,
} from '../../../../src/mpm/elements/styles/style.js';
import type {
  AnyStyle,
  StyleKind,
  StyleOfKind,
} from '../../../../src/mpm/elements/styles/style.js';
import { TempoDef } from '../../../../src/mpm/elements/styles/defs/TempoDef.js';
import { DynamicsDef } from '../../../../src/mpm/elements/styles/defs/DynamicsDef.js';
import { Element, Attribute } from '../../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/{GenericStyle,TempoStyle,DynamicsStyle,
 * ArticulationStyle,RubatoStyle,MetricalAccentuationStyle}.java
 *
 * These tests are the only guard on half of the style→def wiring, measured. Point the
 * `tempo` row's `defChildName` at `'dynamicsDef'`, so every `tempoStyles` collection in every
 * document indexes no defs at all, and `npm run gate` stays green; only unit tests see it,
 * 11 red across this file and the four map suites. Do the same to the `metricalAccentuation`
 * row and 4 gate tests go red. The difference is which documents are parsed:
 *
 * - The only `.mpm` files any gate suite reads into an `Mpm` are
 *   `fixtures/all-maps-reference/*.mpm` (`all-maps-equivalence:143`,
 *   `midi-byte-equivalence:253`). Between them those eight documents carry exactly three
 *   style collections — `articulationStyles`, `metricalAccentuationStyles`,
 *   `ornamentationStyles` — so three of the six rows of `STYLE_SHAPE` are never consulted.
 * - The documents that do carry `tempoDef`s, `fixtures/reference/*.mpm`, are Java-generated
 *   outputs that `cross-validation` and `full-xml-equivalence` compare as text; nothing ever
 *   reads one back. The MEI path that produces them builds styles through
 *   `Header.addStyleDef` + `Style.addDef`, which never touches `defChildName`, and
 *   serialization comes off the live element tree, which a style's lookup index does not
 *   participate in — an unindexed def is still a child element and still comes out verbatim.
 *
 * So the byte gate covers the parse path for three style kinds and not for the other three,
 * and the split is a property of the fixture corpus rather than of the code. Do not delete a
 * unit test here on the grounds that the gate covers it: for tempo, dynamics and rubato
 * styles, it does not.
 */
function element(
  name: string,
  attributes: Record<string, string>,
  children: Element[] = [],
): Element {
  const e = new Element(name, Mpm.MPM_NAMESPACE);
  for (const [attName, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(attName, value));
  for (const c of children) e.appendChild(c);
  return e;
}

function styleDefElement(name: string, children: Element[] = []): Element {
  return element('styleDef', { name }, children);
}

/** Runs body with console.error silenced. */
function quiet<T>(body: () => T): T {
  const err = silenceConsoleError();
  try {
    return body();
  } finally {
    err.mockRestore();
  }
}

/**
 * The style, or a throw naming the reason — a throw rather than an `expect` so the return
 * type narrows and the tests below read without a `!` on every parse.
 */
function parsed<K extends StyleKind>(kind: K, xml: Element): StyleOfKind<K> {
  const result = parseStyle(kind, xml);
  if (!result.ok) throw new Error(`expected a style: ${describeStyleError(result.error)}`);
  return result.value;
}

describe('the style kind table', () => {
  /**
   * The seven kinds, spelled out rather than derived from the module, so that adding an
   * eighth to `DefOfStyleKind` fails here as well as in the source's mapped types. A test
   * that read the table it is testing would agree with any table at all.
   */
  const ALL_KINDS: readonly StyleKind[] = [
    'tempo',
    'dynamics',
    'articulation',
    'metricalAccentuation',
    'rubato',
    'ornamentation',
    'generic',
  ];

  it('round-trips every kind through its collection name', () => {
    for (const kind of ALL_KINDS) {
      const collection = collectionNameOfKind(kind);
      if (kind === 'generic') {
        expect(collection).toBeNull();
        continue;
      }
      expect(collection).not.toBeNull();
      expect(styleKindOfCollection(collection!)).toBe(kind);
    }
  });

  it('maps each Mpm.*_STYLE constant to the kind that parses it', () => {
    expect(styleKindOfCollection(Mpm.TEMPO_STYLE)).toBe('tempo');
    expect(styleKindOfCollection(Mpm.DYNAMICS_STYLE)).toBe('dynamics');
    expect(styleKindOfCollection(Mpm.ARTICULATION_STYLE)).toBe('articulation');
    expect(styleKindOfCollection(Mpm.METRICAL_ACCENTUATION_STYLE)).toBe('metricalAccentuation');
    expect(styleKindOfCollection(Mpm.RUBATO_STYLE)).toBe('rubato');
    expect(styleKindOfCollection(Mpm.ORNAMENTATION_STYLE)).toBe('ornamentation');
  });

  it('answers "generic" for a collection name it does not know', () => {
    expect(styleKindOfCollection('somethingStyles')).toBe('generic');
    expect(styleKindOfCollection('')).toBe('generic');
  });

  it('carries the kind on the style, so a kind-erased style can be narrowed back', () => {
    const tempo: AnyStyle = createStyle('tempo', 'default');
    expect(styleOfKind(tempo, 'tempo')).toBe(tempo);
    expect(styleOfKind(tempo, 'rubato')).toBeNull();
    expect(styleOfKind(null, 'tempo')).toBeNull();
  });

  /**
   * `Header.addStyleDef(type, style)` files a style under whatever collection name it is
   * given and never checks that the style is of that collection's kind, so a rubato style
   * genuinely can end up under `tempoStyles`; `getStyle` checks and answers null.
   *
   * Replacing that check with a cast leaves the whole suite green — every style in every
   * fixture is filed under the collection that decided its kind, so nothing in the corpus
   * distinguishes the two. This is the control.
   */
  it('does not hand back a style filed under the wrong collection', () => {
    const header = okValue(Header.createHeader());
    header.addStyleDef(Mpm.TEMPO_STYLE, createStyle('rubato', 'misfiled'));

    const map = okValue(GenericMap.createGenericMap('tempoMap'));
    map.setHeaders(header, null);

    expect(map.getStyle('tempo', 'misfiled')).toBeNull();
    // …and it is really there under that name, so the null above is the kind check firing
    // and not a lookup that missed.
    expect(header.getStyleDef(Mpm.TEMPO_STYLE, 'misfiled')).not.toBeNull();
  });
});

describe('Style, whatever the kind', () => {
  describe('createStyle', () => {
    it('creates an empty styleDef from a name', () => {
      const gs = createStyle('generic', 'myStyle');
      expect(gs.getName()).toBe('myStyle');
      expect(gs.getId()).toBeNull();
      expect(gs.size()).toBe(0);
      expect(gs.isEmpty()).toBe(true);
      expect(gs.getXml()!.getLocalName()).toBe('styleDef');
      expect(gs.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
      expect(gs.getXml()!.getAttributeValue('name')).toBe('myStyle');
    });

    it('accepts an id as third argument', () => {
      const gs = createStyle('generic', 'myStyle', 'style-1');
      expect(gs.getId()).toBe('style-1');
      const idAtt = gs.getXml()!.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAtt!.getValue()).toBe('style-1');
    });
  });

  describe('parseStyle', () => {
    it('creates a style from an existing element', () => {
      const xml = styleDefElement('fromXml');
      const gs = parsed('generic', xml);
      expect(gs.getXml()).toBe(xml);
      expect(gs.getName()).toBe('fromXml');
    });

    it('picks up an existing xml:id', () => {
      const xml = styleDefElement('fromXml');
      xml.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'style-9'));
      expect(parsed('generic', xml).getId()).toBe('style-9');
    });

    it('reports a missing name attribute, with the element that lacks it', () => {
      const xml = element('styleDef', {});
      expect(parseStyle('generic', xml)).toEqual({
        ok: false,
        error: { kind: 'missingName', element: xml },
      });
    });

    it('reports a null element as its own failure', () => {
      expect(parseStyle('generic', null)).toEqual({ ok: false, error: { kind: 'noElement' } });
    });

    it('says which of the two failures it was, in words', () => {
      expect(describeStyleError({ kind: 'noElement' })).toContain('null');
      expect(
        describeStyleError({ kind: 'missingName', element: element('styleDef', {}) }),
      ).toContain('no name attribute');
    });

    it('indexes nothing for the generic kind, whatever children it is given', () => {
      const xml = styleDefElement('generic', [new Element('tempoDef', Mpm.MPM_NAMESPACE)]);
      expect(parsed('generic', xml).size()).toBe(0);
    });
  });

  describe('setName', () => {
    it('renames the styleDef in the object and in the xml', () => {
      const gs = createStyle('generic', 'myStyle');
      gs.setName('renamed');
      expect(gs.getName()).toBe('renamed');
      expect(gs.getXml()!.getAttributeValue('name')).toBe('renamed');
    });
  });

  describe('id handling', () => {
    it('replaces an existing id instead of adding a second attribute', () => {
      const gs = createStyle('generic', 'myStyle', 'first');
      const count = gs.getXml()!.getAttributeCount();
      gs.setId('second');
      expect(gs.getId()).toBe('second');
      expect(gs.getXml()!.getAttributeCount()).toBe(count);
    });

    it('clears the id when set to null', () => {
      const gs = createStyle('generic', 'myStyle', 'first');
      gs.setId(null);
      expect(gs.getId()).toBeNull();
    });

    it('tolerates clearing an id that was never set', () => {
      const gs = createStyle('generic', 'myStyle');
      gs.setId(null);
      expect(gs.getId()).toBeNull();
    });
  });

  describe('def management', () => {
    it('adds a def and appends its xml as a child', () => {
      const gs = createStyle('tempo', 'myStyle');
      const td = okValue(TempoDef.fromNameValue('Allegro', 147.0));
      gs.addDef(td);

      expect(gs.size()).toBe(1);
      expect(gs.isEmpty()).toBe(false);
      expect(gs.getDef('Allegro')).toBe(td);
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0)).toBe(td.getXml());
    });

    it('replaces a def of the same name, in the map and in the xml', () => {
      const gs = createStyle('tempo', 'myStyle');
      const first = okValue(TempoDef.fromNameValue('Allegro', 147.0));
      const second = okValue(TempoDef.fromNameValue('Allegro', 132.0));
      gs.addDef(first);
      gs.addDef(second);

      expect(gs.size()).toBe(1);
      expect(gs.getDef('Allegro')).toBe(second);
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0)).toBe(second.getXml());
    });

    it('keeps defs with different names side by side', () => {
      const gs = createStyle('tempo', 'myStyle');
      gs.addDef(okValue(TempoDef.fromNameValue('Allegro', 147.0)));
      gs.addDef(okValue(TempoDef.fromNameValue('Largo', 50.0)));
      expect(gs.size()).toBe(2);
      expect(gs.getAllDefs().size).toBe(2);
      expect(gs.getXml()!.getChildElements().size()).toBe(2);
    });

    it('reports undefined for an unknown def name', () => {
      const gs = createStyle('tempo', 'myStyle');
      expect(gs.getDef('nope')).toBeUndefined();
    });

    it('logs and does nothing when asked to add null', () => {
      const err = silenceConsoleError();
      const gs = createStyle('tempo', 'myStyle');
      gs.addDef(null as never);
      expect(gs.size()).toBe(0);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('removes a def from the map and the xml', () => {
      const gs = createStyle('tempo', 'myStyle');
      gs.addDef(okValue(TempoDef.fromNameValue('Allegro', 147.0)));
      gs.addDef(okValue(TempoDef.fromNameValue('Largo', 50.0)));
      gs.removeDef('Allegro');

      expect(gs.size()).toBe(1);
      expect(gs.getDef('Allegro')).toBeUndefined();
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0).getAttributeValue('name')).toBe('Largo');
    });

    it('ignores removal of an unknown def name', () => {
      const gs = createStyle('tempo', 'myStyle');
      gs.addDef(okValue(TempoDef.fromNameValue('Allegro', 147.0)));
      gs.removeDef('nope');
      expect(gs.size()).toBe(1);
    });
  });
});

describe("Style<'tempo'>", () => {
  it('creates an empty style from a name', () => {
    const ts = createStyle('tempo', 'default');
    expect(ts.getName()).toBe('default');
    expect(ts.size()).toBe(0);
    expect(ts.getXml()!.getLocalName()).toBe('styleDef');
  });

  it('accepts an id as third argument', () => {
    expect(createStyle('tempo', 'default', 'ts-1').getId()).toBe('ts-1');
  });

  it('parses tempoDef children into the lookup table', () => {
    const ts = parsed(
      'tempo',
      styleDefElement('default', [
        element('tempoDef', { name: 'Allegro', value: '147.0' }),
        element('tempoDef', { name: 'Largo', value: '50.0' }),
      ]),
    );
    expect(ts.size()).toBe(2);
    expect(ts.getDef('Allegro')!.getValue()).toBe(147.0);
    expect(ts.getDef('Largo')!.getValue()).toBe(50.0);
  });

  it('skips malformed tempoDef children', () => {
    const ts = quiet(() =>
      parsed(
        'tempo',
        styleDefElement('default', [
          element('tempoDef', { name: 'Broken' }),
          element('tempoDef', { name: 'Allegro', value: '147.0' }),
        ]),
      ),
    );
    expect(ts.size()).toBe(1);
    expect(ts.getDef('Allegro')).toBeDefined();
  });

  it('ignores children that are not tempoDefs', () => {
    const ts = parsed(
      'tempo',
      styleDefElement('default', [element('dynamicsDef', { name: 'f', value: '97.0' })]),
    );
    expect(ts.size()).toBe(0);
  });

  it('reports a missing name attribute', () => {
    expect(parseStyle('tempo', element('styleDef', {})).ok).toBe(false);
  });

  describe('numericBpmValue', () => {
    function style() {
      const ts = createStyle('tempo', 'default');
      ts.addDef(okValue(TempoDef.fromNameValue('Allegro', 147.0)));
      return ts;
    }

    it('resolves a known tempoDef name', () => {
      expect(numericBpmValue('Allegro', style())).toBe(147.0);
    });

    it('parses a plain numeric string when no def matches', () => {
      expect(numericBpmValue('132.5', style())).toBe(132.5);
    });

    it('falls back to 100 bpm for an unresolvable string', () => {
      expect(quiet(() => numericBpmValue('schnell', style()))).toBe(100.0);
    });

    it('prefers the def over a numeric reading of the same string', () => {
      const ts = createStyle('tempo', 'default');
      ts.addDef(okValue(TempoDef.fromNameValue('60', 90.0)));
      expect(numericBpmValue('60', ts)).toBe(90.0);
    });

    it('still parses numbers when the style is null', () => {
      expect(numericBpmValue('132.5', null)).toBe(132.5);
    });

    it('falls back to 100 bpm when the style is null and the string is not numeric', () => {
      expect(quiet(() => numericBpmValue('Allegro', null))).toBe(100.0);
    });

    it('falls back to 100 bpm when the style has no matching def', () => {
      expect(quiet(() => numericBpmValue('Allegro', createStyle('tempo', 'default')))).toBe(100.0);
    });
  });
});

describe("Style<'dynamics'>", () => {
  it('creates an empty style from a name', () => {
    const ds = createStyle('dynamics', 'default');
    expect(ds.getName()).toBe('default');
    expect(ds.size()).toBe(0);
  });

  it('accepts an id as third argument', () => {
    expect(createStyle('dynamics', 'default', 'ds-1').getId()).toBe('ds-1');
  });

  it('parses dynamicsDef children into the lookup table', () => {
    const ds = parsed(
      'dynamics',
      styleDefElement('default', [
        element('dynamicsDef', { name: 'ff', value: '111.0' }),
        element('dynamicsDef', { name: 'pp', value: '36.0' }),
      ]),
    );
    expect(ds.size()).toBe(2);
    expect(ds.getDef('ff')!.getValue()).toBe(111.0);
  });

  it('skips malformed dynamicsDef children', () => {
    const ds = quiet(() =>
      parsed(
        'dynamics',
        styleDefElement('default', [
          element('dynamicsDef', { name: 'broken' }),
          element('dynamicsDef', { name: 'pp', value: '36.0' }),
        ]),
      ),
    );
    expect(ds.size()).toBe(1);
  });

  it('reports a missing name attribute', () => {
    expect(parseStyle('dynamics', element('styleDef', {})).ok).toBe(false);
  });

  describe('numericDynamicsValue', () => {
    function style() {
      const ds = createStyle('dynamics', 'default');
      ds.addDef(okValue(DynamicsDef.fromNameValue('ff', 111.0)));
      return ds;
    }

    it('resolves a known dynamicsDef name', () => {
      expect(numericDynamicsValue('ff', style())).toBe(111.0);
    });

    it('parses a plain numeric string when no def matches', () => {
      expect(numericDynamicsValue('64', style())).toBe(64.0);
    });

    it('falls back to 100 for an unresolvable string', () => {
      expect(quiet(() => numericDynamicsValue('laut', style()))).toBe(100.0);
    });

    it('still parses numbers when the style is null', () => {
      expect(numericDynamicsValue('64', null)).toBe(64.0);
    });

    it('falls back to 100 when the style is null and the string is not numeric', () => {
      expect(quiet(() => numericDynamicsValue('ff', null))).toBe(100.0);
    });

    it('falls back to 100 when the style has no matching def', () => {
      expect(quiet(() => numericDynamicsValue('ff', createStyle('dynamics', 'default')))).toBe(
        100.0,
      );
    });
  });
});

describe("Style<'articulation'>", () => {
  it('creates an empty style from a name', () => {
    const as = createStyle('articulation', 'default');
    expect(as.getName()).toBe('default');
    expect(as.size()).toBe(0);
  });

  it('accepts an id as third argument', () => {
    expect(createStyle('articulation', 'default', 'as-1').getId()).toBe('as-1');
  });

  it('parses articulationDef children into the lookup table', () => {
    const as = parsed(
      'articulation',
      styleDefElement('default', [
        element('articulationDef', { name: 'staccato', absoluteDurationMs: '160.0' }),
        element('articulationDef', { name: 'tenuto', relativeDuration: '0.9' }),
      ]),
    );
    expect(as.size()).toBe(2);
    expect(as.getDef('staccato')!.getAbsoluteDurationMs()).toBe(160.0);
    expect(as.getDef('tenuto')!.getRelativeDuration()).toBe(0.9);
  });

  it('skips articulationDef children without a name', () => {
    const as = quiet(() =>
      parsed(
        'articulation',
        styleDefElement('default', [
          element('articulationDef', { relativeDuration: '0.9' }),
          element('articulationDef', { name: 'tenuto', relativeDuration: '0.9' }),
        ]),
      ),
    );
    expect(as.size()).toBe(1);
  });

  it('reports a missing name attribute', () => {
    expect(parseStyle('articulation', element('styleDef', {})).ok).toBe(false);
  });
});

describe("Style<'rubato'>", () => {
  it('creates an empty style from a name', () => {
    const rs = createStyle('rubato', 'default');
    expect(rs.getName()).toBe('default');
    expect(rs.size()).toBe(0);
    expect(rs.getXml()!.getLocalName()).toBe('styleDef');
  });

  it('accepts an id as third argument', () => {
    expect(createStyle('rubato', 'default', 'rs-1').getId()).toBe('rs-1');
  });

  it('parses rubatoDef children into the lookup table', () => {
    const rs = parsed(
      'rubato',
      styleDefElement('default', [
        element('rubatoDef', {
          name: 'gentle',
          frameLength: '720.0',
          intensity: '1.2',
          lateStart: '0.1',
          earlyEnd: '0.9',
        }),
        element('rubatoDef', { name: 'plain', frameLength: '360.0' }),
      ]),
    );
    expect(rs.size()).toBe(2);

    const gentle = rs.getDef('gentle')!;
    expect(gentle.getFrameLength()).toBe(720.0);
    expect(gentle.getIntensity()).toBe(1.2);
    expect(gentle.getLateStart()).toBe(0.1);
    expect(gentle.getEarlyEnd()).toBe(0.9);

    const plain = rs.getDef('plain')!;
    expect(plain.getIntensity()).toBe(1.0);
    expect(plain.getLateStart()).toBe(0.0);
    expect(plain.getEarlyEnd()).toBe(1.0);
  });

  it('skips rubatoDef children without a frameLength', () => {
    const rs = quiet(() =>
      parsed(
        'rubato',
        styleDefElement('default', [
          element('rubatoDef', { name: 'broken' }),
          element('rubatoDef', { name: 'plain', frameLength: '360.0' }),
        ]),
      ),
    );
    expect(rs.size()).toBe(1);
    expect(rs.getDef('plain')).toBeDefined();
  });

  it('ignores children that are not rubatoDefs', () => {
    const rs = parsed(
      'rubato',
      styleDefElement('default', [element('tempoDef', { name: 'Allegro', value: '147.0' })]),
    );
    expect(rs.size()).toBe(0);
  });

  it('reports a missing name attribute', () => {
    expect(parseStyle('rubato', element('styleDef', {})).ok).toBe(false);
  });
});

describe("Style<'metricalAccentuation'>", () => {
  it('creates an empty style from a name', () => {
    const mas = createStyle('metricalAccentuation', 'default');
    expect(mas.getName()).toBe('default');
    expect(mas.size()).toBe(0);
    expect(mas.getXml()!.getLocalName()).toBe('styleDef');
  });

  it('accepts an id as third argument', () => {
    expect(createStyle('metricalAccentuation', 'default', 'mas-1').getId()).toBe('mas-1');
  });

  it('parses accentuationPatternDef children including their accentuations', () => {
    const mas = parsed(
      'metricalAccentuation',
      styleDefElement('default', [
        element('accentuationPatternDef', { name: '4/4', length: '4.0' }, [
          element('accentuation', {
            beat: '1.0',
            value: '1.0',
            'transition.from': '0.0',
            'transition.to': '1.0',
          }),
          element('accentuation', { beat: '3.0', value: '0.5' }),
        ]),
        element('accentuationPatternDef', { name: '3/4', length: '3.0' }),
      ]),
    );

    expect(mas.size()).toBe(2);
    const fourFour = mas.getDef('4/4')!;
    expect(fourFour.getLength()).toBe(4.0);
    expect(fourFour.size()).toBe(2);
    expect(fourFour.getAccentuationAt(1.0)).toBe(1.0);
    // Reaches getAccentuationAt's segment-end logic through the parse path, which is the route
    // the reference fixtures take. Beat 1 has a successor at beat 3, so segmentEnd = 3 and
    // ((2-1) * (1-0)) / (3-1) + 0 = 0.5 (AccentuationPatternDef.java:316-320, fixed in
    // meico@1d662105). The upstream spelling would leave segmentEnd at length + 1 = 5 => 0.25.
    expect(fourFour.getAccentuationAt(2.0)).toBe(0.5);
    expect(mas.getDef('3/4')!.size()).toBe(0);
  });

  it('skips accentuationPatternDef children without a name', () => {
    const mas = quiet(() =>
      parsed(
        'metricalAccentuation',
        styleDefElement('default', [
          element('accentuationPatternDef', { length: '4.0' }),
          element('accentuationPatternDef', { name: '3/4', length: '3.0' }),
        ]),
      ),
    );
    expect(mas.size()).toBe(1);
    expect(mas.getDef('3/4')).toBeDefined();
  });

  it('ignores children that are not accentuationPatternDefs', () => {
    const mas = parsed(
      'metricalAccentuation',
      styleDefElement('default', [element('rubatoDef', { name: 'plain', frameLength: '360.0' })]),
    );
    expect(mas.size()).toBe(0);
  });

  it('reports a missing name attribute', () => {
    expect(parseStyle('metricalAccentuation', element('styleDef', {})).ok).toBe(false);
  });
});

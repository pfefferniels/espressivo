import { describe, it, expect } from 'vitest';
import { silenceConsoleError } from '../../support/console.js';
import { errOf, okValue } from '../../support/result.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Header } from '../../../src/mpm/elements/Header.js';
import { createStyle, styleOfKind } from '../../../src/mpm/elements/styles/style.js';
import type { StyleKind } from '../../../src/mpm/elements/styles/style.js';
import { TempoDef } from '../../../src/mpm/elements/styles/defs/TempoDef.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/Header.java
 */
function element(
  name: string,
  attributes: Record<string, string> = {},
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

/** local names of the header's child elements, in document order */
function childNames(header: Header): string[] {
  const children = header.getXml()!.getChildElements();
  const names: string[] = [];
  for (let i = 0; i < children.size(); ++i) names.push(children.get(i).getLocalName());
  return names;
}

describe('Header', () => {
  describe('createHeader', () => {
    it('creates an empty header element', () => {
      const h = okValue(Header.createHeader());
      expect(h.getXml()!.getLocalName()).toBe('header');
      expect(h.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
      expect(h.getAllStyleTypes().size).toBe(0);
    });

    it('parses every ...Styles collection found below the header element', () => {
      const xml = element('header', {}, [
        element(Mpm.TEMPO_STYLE, {}, [
          styleDefElement('default', [element('tempoDef', { name: 'Allegro', value: '147.0' })]),
        ]),
        element(Mpm.DYNAMICS_STYLE, {}, [
          styleDefElement('default', [element('dynamicsDef', { name: 'ff', value: '111.0' })]),
        ]),
      ]);
      const h = okValue(Header.createHeader(xml));

      expect(h.getAllStyleTypes().size).toBe(2);
      // `styleOfKind` where this used to be `as TempoStyle` + `toBeInstanceOf(TempoStyle)`:
      // one class now serves every kind, so what identifies a tempo style is its `kind`
      // discriminant, and `styleOfKind` returning non-null IS that assertion — plus it is
      // what gives `getDef` the `TempoDef` return type the cast used to supply.
      const tempoStyle = styleOfKind(h.getStyleDef(Mpm.TEMPO_STYLE, 'default'), 'tempo');
      expect(tempoStyle).not.toBeNull();
      expect(tempoStyle!.getDef('Allegro')!.getValue()).toBe(147.0);
      expect(styleOfKind(h.getStyleDef(Mpm.DYNAMICS_STYLE, 'default'), 'dynamics')).not.toBeNull();
    });

    it('ignores header children whose name does not contain "Styles"', () => {
      const h = okValue(Header.createHeader(element('header', {}, [element('metadata')])));
      expect(h.getAllStyleTypes().size).toBe(0);
    });

    // Was: spy on `console.error`, assert the factory returned null, assert something was
    // printed. The assertion that something was printed is what the `Result` replaces, and
    // the replacement is stronger — "printed at all" could not tell a null element from any
    // other exception the catch-all absorbed, and this names which one it was.
    it('reports a null element rather than printing it', () => {
      expect(errOf(Header.createHeader(null))).toEqual({
        kind: 'noElement',
        what: 'Header',
      });
    });
  });

  describe('addStyleType', () => {
    it('creates an empty collection for a type name', () => {
      const h = okValue(Header.createHeader());
      const map = h.addStyleType(Mpm.TEMPO_STYLE)!;
      expect(map.size).toBe(0);
      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)).toBe(map);
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
    });

    it('rejects an empty type name', () => {
      expect(okValue(Header.createHeader()).addStyleType('')).toBeNull();
    });

    it('builds a style of the matching kind for each known type, and indexes its defs', () => {
      const cases: [string, StyleKind, Element[]][] = [
        [
          Mpm.ARTICULATION_STYLE,
          'articulation',
          [element('articulationDef', { name: 'staccato' })],
        ],
        [Mpm.TEMPO_STYLE, 'tempo', [element('tempoDef', { name: 'Allegro', value: '147.0' })]],
        [Mpm.DYNAMICS_STYLE, 'dynamics', [element('dynamicsDef', { name: 'ff', value: '111.0' })]],
        [
          Mpm.METRICAL_ACCENTUATION_STYLE,
          'metricalAccentuation',
          [element('accentuationPatternDef', { name: '4/4', length: '4.0' })],
        ],
        [Mpm.RUBATO_STYLE, 'rubato', [element('rubatoDef', { name: 'r', frameLength: '720.0' })]],
        [Mpm.ORNAMENTATION_STYLE, 'ornamentation', [element('ornamentDef', { name: 'trill' })]],
      ];

      for (const [type, kind, defs] of cases) {
        const h = okValue(Header.createHeader());
        h.adoptStyleType(element(type, {}, [styleDefElement('default', defs)]));
        const style = h.getStyleDef(type, 'default')!;
        // Was `toBeInstanceOf(<the subclass>)`. The kind discriminant is what the six
        // subclasses were carrying, so this is the same claim about the same fact — and the
        // `size()` check below still proves the kind picked the right def parser, which is
        // the part `instanceof` never actually established.
        expect(style.kind).toBe(kind);
        expect(style.size()).toBe(1);
      }
    });

    it('falls back to the generic kind for an unknown type', () => {
      const h = okValue(Header.createHeader());
      h.adoptStyleType(element('somethingStyles', {}, [styleDefElement('default')]));
      const style = h.getStyleDef('somethingStyles', 'default')!;
      expect(style.kind).toBe('generic');
      expect(style.getName()).toBe('default');
    });

    it('skips styleDef children without a name', () => {
      const err = silenceConsoleError();
      const h = okValue(Header.createHeader());
      const map = h.adoptStyleType(
        element(Mpm.TEMPO_STYLE, {}, [element('styleDef'), styleDefElement('default')]),
      );
      expect(map.size).toBe(1);
      expect(map.has('default')).toBe(true);
      err.mockRestore();
    });

    it('replaces a style type that is already present', () => {
      const h = okValue(Header.createHeader());
      h.adoptStyleType(element(Mpm.TEMPO_STYLE, {}, [styleDefElement('first')]));
      h.adoptStyleType(element(Mpm.TEMPO_STYLE, {}, [styleDefElement('second')]));

      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'first')).toBeNull();
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'second')).not.toBeNull();
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
    });

    it('does not re-append a collection that is already a child of the header', () => {
      const collection = element(Mpm.TEMPO_STYLE, {}, [styleDefElement('default')]);
      const h = okValue(Header.createHeader(element('header', {}, [collection])));
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
      h.adoptStyleType(collection);
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
    });

    /**
     * The gap between how a style-type collection is FOUND and how it is later LOOKED UP.
     *
     * `parseData` discovers `…Styles` collections by local name in any namespace — that is
     * what makes vendor types work at all — but `addStyleDef` and `removeStyleDef` reach for
     * the collection with a namespace-EXACT `getFirstChildElement(type, MPM_NAMESPACE)`. So
     * a foreign-namespace `<tempoStyles>` is indexed under `tempoStyles` and then cannot be
     * found again, and both writers used to fail with "Cannot read properties of null".
     *
     * `Header.java:141,163` dereference the same lookup unguarded, so this is Java's
     * behaviour and not a divergence; the two `!`s that used to spell it here are gone and
     * the throw now names the missing collection. This test is what stops either half from
     * being "tidied" into agreement with the other without a deliberate decision.
     */
    it('indexes a foreign-namespace ...Styles collection that the writers cannot find again', () => {
      const foreign = new Element(Mpm.TEMPO_STYLE, 'http://example.com/not-mpm');
      const foreignDef = new Element('styleDef', 'http://example.com/not-mpm');
      foreignDef.addAttribute(new Attribute('name', 'default'));
      foreign.appendChild(foreignDef);
      const headerElt = new Element('header', Mpm.MPM_NAMESPACE);
      headerElt.appendChild(foreign);
      const h = okValue(Header.createHeader(headerElt));

      expect([...h.getAllStyleTypes().keys()]).toEqual([Mpm.TEMPO_STYLE]);
      expect(h.getXml().getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)).toBeNull();

      expect(() => h.addStyleDef(Mpm.TEMPO_STYLE, createStyle('tempo', 'x'))).toThrow(
        /no <tempoStyles> collection in the MPM namespace/,
      );
      h.addStyleType(Mpm.RUBATO_STYLE);
      h.addStyleDef(Mpm.RUBATO_STYLE, createStyle('rubato', 'r'));
      expect(() => h.removeStyleDef(Mpm.RUBATO_STYLE, 'r')).not.toThrow();
    });
  });

  describe('removeStyleType', () => {
    it('removes the collection from the map and the xml', () => {
      const h = okValue(Header.createHeader());
      h.addStyleType(Mpm.TEMPO_STYLE);
      h.addStyleType(Mpm.DYNAMICS_STYLE);
      h.removeStyleType(Mpm.TEMPO_STYLE);

      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)).toBeUndefined();
      expect(childNames(h)).toEqual([Mpm.DYNAMICS_STYLE]);
    });

    it('ignores an unknown type', () => {
      const h = okValue(Header.createHeader());
      h.addStyleType(Mpm.TEMPO_STYLE);
      h.removeStyleType(Mpm.RUBATO_STYLE);
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
    });
  });

  describe('getStyleDef', () => {
    it('returns null for an unknown type', () => {
      expect(okValue(Header.createHeader()).getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBeNull();
    });

    it('returns null for an unknown name within a known type', () => {
      const h = okValue(Header.createHeader());
      h.addStyleType(Mpm.TEMPO_STYLE);
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBeNull();
    });
  });

  describe('addStyleDef by name', () => {
    it('creates the style type on the fly and returns the new styleDef', () => {
      const h = okValue(Header.createHeader());
      const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'default');

      expect(style.kind).toBe('tempo');
      expect(style.getName()).toBe('default');
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(style);
      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);

      const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
      expect(collection.getChildElements().size()).toBe(1);
      expect(collection.getChildElements().get(0)).toBe(style.getXml());
    });

    it('creates a style of the matching kind for each known type', () => {
      const cases: [string, StyleKind][] = [
        [Mpm.DYNAMICS_STYLE, 'dynamics'],
        [Mpm.ARTICULATION_STYLE, 'articulation'],
        [Mpm.METRICAL_ACCENTUATION_STYLE, 'metricalAccentuation'],
        [Mpm.TEMPO_STYLE, 'tempo'],
        [Mpm.RUBATO_STYLE, 'rubato'],
        [Mpm.ORNAMENTATION_STYLE, 'ornamentation'],
        ['somethingStyles', 'generic'],
      ];
      const h = okValue(Header.createHeader());
      for (const [type, kind] of cases) expect(h.addStyleDef(type, 'default').kind).toBe(kind);
    });

    it('replaces a styleDef of the same name', () => {
      const h = okValue(Header.createHeader());
      const first = h.addStyleDef(Mpm.TEMPO_STYLE, 'default');
      styleOfKind(first, 'tempo')!.addDef(okValue(TempoDef.fromNameValue('Allegro', 147.0)));
      const second = h.addStyleDef(Mpm.TEMPO_STYLE, 'default');

      expect(second).not.toBe(first);
      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(second);

      const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
      expect(collection.getChildElements().size()).toBe(1);
      expect(collection.getChildElements().get(0)).toBe(second.getXml());
    });
  });

  describe('addStyleDef by instance', () => {
    it('adds an existing style object', () => {
      const h = okValue(Header.createHeader());
      const style = createStyle('tempo', 'default');
      h.addStyleDef(Mpm.TEMPO_STYLE, style);
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'default')).toBe(style);
    });

    it('ignores an empty type', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef('', createStyle('tempo', 'default'));
      expect(h.getAllStyleTypes().size).toBe(0);
    });

    it('reuses an existing style type element', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef(Mpm.TEMPO_STYLE, createStyle('tempo', 'a'));
      h.addStyleDef(Mpm.TEMPO_STYLE, createStyle('tempo', 'b'));

      expect(childNames(h)).toEqual([Mpm.TEMPO_STYLE]);
      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(2);
    });
  });

  describe('removeStyleDef', () => {
    it('removes the styleDef from the map and the xml', () => {
      const h = okValue(Header.createHeader());
      const a = h.addStyleDef(Mpm.TEMPO_STYLE, 'a');
      h.addStyleDef(Mpm.TEMPO_STYLE, 'b');
      h.removeStyleDef(Mpm.TEMPO_STYLE, 'a');

      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'a')).toBeNull();
      const collection = h.getXml()!.getFirstChildElement(Mpm.TEMPO_STYLE, Mpm.MPM_NAMESPACE)!;
      expect(collection.getChildElements().size()).toBe(1);
      expect(collection.getChildElements().get(0)).not.toBe(a.getXml());
    });

    it('ignores an empty type, an unknown type and an unknown name', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef(Mpm.TEMPO_STYLE, 'a');
      h.removeStyleDef('', 'a');
      h.removeStyleDef(Mpm.RUBATO_STYLE, 'a');
      h.removeStyleDef(Mpm.TEMPO_STYLE, 'nope');
      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
    });
  });

  describe('renameStyleDef', () => {
    it('renames the styleDef in the map and in the xml', () => {
      const h = okValue(Header.createHeader());
      const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'old');
      const renamed = h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new');

      expect(renamed).toBe(style);
      expect(style.getName()).toBe('new');
      expect(style.getXml()!.getAttributeValue('name')).toBe('new');
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'old')).toBeNull();
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'new')).toBe(style);
    });

    it('returns the unchanged styleDef when old and new name are equal', () => {
      const h = okValue(Header.createHeader());
      const style = h.addStyleDef(Mpm.TEMPO_STYLE, 'same');
      expect(h.renameStyleDef(Mpm.TEMPO_STYLE, 'same', 'same')).toBe(style);
      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
    });

    it('overwrites a styleDef that already carries the new name', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef(Mpm.TEMPO_STYLE, 'victim');
      const survivor = h.addStyleDef(Mpm.TEMPO_STYLE, 'old');
      h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'victim');

      expect(h.getAllStyleDefs(Mpm.TEMPO_STYLE)!.size).toBe(1);
      expect(h.getStyleDef(Mpm.TEMPO_STYLE, 'victim')).toBe(survivor);
    });

    it('returns null for an unknown style type', () => {
      expect(
        okValue(Header.createHeader()).renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new'),
      ).toBeNull();
    });

    it('returns null for an unknown current name', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef(Mpm.TEMPO_STYLE, 'other');
      expect(h.renameStyleDef(Mpm.TEMPO_STYLE, 'old', 'new')).toBeNull();
    });
  });

  describe('clear', () => {
    it('drops every style type and every header child', () => {
      const h = okValue(Header.createHeader());
      h.addStyleDef(Mpm.TEMPO_STYLE, 'a');
      h.addStyleDef(Mpm.DYNAMICS_STYLE, 'b');
      h.clear();

      expect(h.getAllStyleTypes().size).toBe(0);
      expect(h.getXml()!.getChildCount()).toBe(0);
    });
  });
});

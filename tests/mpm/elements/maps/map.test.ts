import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { errOf, okValue } from '../../../support/result.js';
import { Attribute, Element } from '../../../../src/xml/XomTypes.js';
import {
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  MPM_NAMESPACE,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
} from '../../../../src/mpm/names.js';
import { GenericMap } from '../../../../src/mpm/elements/maps/GenericMap.js';
import {
  MAP_KINDS,
  isMapKind,
  mapOfKind,
  parseTypedMap,
  type MapKind,
} from '../../../../src/mpm/elements/maps/map.js';
import { Dated } from '../../../../src/mpm/elements/Dated.js';
import { ImprecisionMap } from '../../../../src/mpm/elements/maps/ImprecisionMap.js';
import { TempoMap } from '../../../../src/mpm/elements/maps/TempoMap.js';

/**
 * The oracle for the dispatch table of `maps/map.ts`: an independent transcription of the
 * thirteen name ⇒ class pairs, checked by name string rather than by `instanceof`, so a row
 * pointing at the wrong factory is a failure rather than a tautology. Driven off
 * `MAP_KINDS`, so a fourteenth kind is covered the moment its row is added.
 */
const EXPECTED_CLASS: Record<MapKind, string> = {
  [ARTICULATION_MAP]: 'ArticulationMap',
  [ASYNCHRONY_MAP]: 'AsynchronyMap',
  [DYNAMICS_MAP]: 'DynamicsMap',
  [IMPRECISION_MAP]: 'ImprecisionMap',
  [IMPRECISION_MAP_TIMING]: 'ImprecisionMap',
  [IMPRECISION_MAP_DYNAMICS]: 'ImprecisionMap',
  [IMPRECISION_MAP_TONEDURATION]: 'ImprecisionMap',
  [IMPRECISION_MAP_TUNING]: 'ImprecisionMap',
  [METRICAL_ACCENTUATION_MAP]: 'MetricalAccentuationMap',
  [MOVEMENT_MAP]: 'MovementMap',
  [ORNAMENTATION_MAP]: 'OrnamentationMap',
  [RUBATO_MAP]: 'RubatoMap',
  [TEMPO_MAP]: 'TempoMap',
};

/** The thirteen names `mpm/names.ts` publishes, listed here so drift between them shows. */
const NAME_CONSTANTS = [
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the map dispatch table', () => {
  it('covers exactly the thirteen map names the MPM vocabulary publishes', () => {
    expect([...MAP_KINDS].sort()).toEqual([...NAME_CONSTANTS].sort());
  });

  it.each(MAP_KINDS)('reads a <%s> into its own class', (kind) => {
    const xml = new Element(kind, MPM_NAMESPACE);
    const map = okValue(parseTypedMap(xml));

    expect(map.constructor.name).toBe(EXPECTED_CLASS[kind]);
    expect(map.getType()).toBe(kind);
    // The element is adopted, not copied — the map and the document are the same tree.
    expect(map.getXml()).toBe(xml);
  });

  it.each(MAP_KINDS)('recognises a freshly parsed <%s> as its own kind', (kind) => {
    const map = okValue(parseTypedMap(new Element(kind, MPM_NAMESPACE)));
    expect(mapOfKind(map, kind)).toBe(map);
  });

  it('answers isMapKind for the thirteen and for nothing else', () => {
    for (const kind of MAP_KINDS) expect(isMapKind(kind)).toBe(true);
    expect(isMapKind('vendorMap')).toBe(false);
    expect(isMapKind('score')).toBe(false);
    expect(isMapKind('imprecisionMap.pedalling')).toBe(false);
    // Not a prototype walk: `toString` is on Object.prototype but is not a map kind.
    expect(isMapKind('toString')).toBe(false);
  });

  it('falls back to a plain GenericMap for a name it does not know', () => {
    const map = okValue(parseTypedMap(new Element('vendorMap')));
    expect(map.constructor.name).toBe('GenericMap');
    expect(map.getType()).toBe('vendorMap');
  });

  it('reports an element that is no map at all', () => {
    expect(errOf(parseTypedMap(new Element('note')))).toEqual({
      kind: 'wrongLocalName',
      what: 'GenericMap',
      localName: 'note',
      requirement: 'must contain "Map" or equal "score"',
    });
  });
});

describe('mapOfKind', () => {
  it('rejects a plain GenericMap filed under a typed name — the check the cast could not do', () => {
    // The object a tree-shaken bundle produces: right element name, wrong class. A cast to
    // `TempoMap | null` accepts it and the first `getTempoDataOf` call throws.
    const impostor = okValue(GenericMap.createGenericMap(TEMPO_MAP));
    expect(impostor.getType()).toBe(TEMPO_MAP);
    expect(mapOfKind(impostor, TEMPO_MAP)).toBeNull();
  });

  it('rejects a typed map asked for as a different kind', () => {
    const tempoMap = TempoMap.createTempoMap();
    expect(mapOfKind(tempoMap, RUBATO_MAP)).toBeNull();
    expect(mapOfKind(tempoMap, TEMPO_MAP)).toBe(tempoMap);
  });

  it('passes null through', () => {
    expect(mapOfKind(null, TEMPO_MAP)).toBeNull();
  });

  it('accepts any imprecision domain as any other — the domain is the Dated key, not the class', () => {
    // Deliberate: five kinds share one class, so the class test cannot tell them apart. What
    // does is the key the caller looked under, which `Dated.getMapOfKind` supplies.
    const timing = ImprecisionMap.createImprecisionMap('timing');
    expect(mapOfKind(timing, IMPRECISION_MAP_TUNING)).toBe(timing);
  });
});

describe('Dated.getMapOfKind', () => {
  it('returns the typed map for a kind it holds, and null for one it does not', () => {
    const dated = okValue(Dated.createDated());
    dated.addMapByType(TEMPO_MAP);

    const tempoMap = dated.getMapOfKind(TEMPO_MAP);
    expect(tempoMap).not.toBeNull();
    expect(tempoMap!.constructor.name).toBe('TempoMap');
    expect(dated.getMapOfKind(RUBATO_MAP)).toBeNull();
  });

  it('returns null where getMap returns a map of the wrong class', () => {
    const dated = okValue(Dated.createDated());
    const impostor = okValue(GenericMap.createGenericMap(TEMPO_MAP));
    dated.addMap(impostor);

    expect(dated.getMap(TEMPO_MAP)).toBe(impostor);
    expect(dated.getMapOfKind(TEMPO_MAP)).toBeNull();
  });

  it('keeps the four imprecision domains apart', () => {
    const dated = okValue(Dated.createDated());
    for (const kind of [
      IMPRECISION_MAP_TIMING,
      IMPRECISION_MAP_DYNAMICS,
      IMPRECISION_MAP_TONEDURATION,
      IMPRECISION_MAP_TUNING,
    ] as const) {
      dated.addMapByType(kind);
    }

    expect(dated.getMapOfKind(IMPRECISION_MAP_TIMING)!.getDomain()).toBe('timing');
    expect(dated.getMapOfKind(IMPRECISION_MAP_DYNAMICS)!.getDomain()).toBe('dynamics');
    expect(dated.getMapOfKind(IMPRECISION_MAP_TONEDURATION)!.getDomain()).toBe('toneduration');
    expect(dated.getMapOfKind(IMPRECISION_MAP_TUNING)!.getDomain()).toBe('tuning');
  });
});

/**
 * A green suite proves nothing about tree-shaking — vitest does not tree-shake. The evidence
 * is a bundle: rollup over the facade with `treeshake.moduleSideEffects: false` yields 13/13
 * typed classes, where registration-by-import yielded 13/13 plain `GenericMap`s. That
 * measurement needs a bundler and so does not live in this suite.
 *
 * What lives here is the invariant behind it: nothing in `src/` may be imported for its side
 * effects alone, so a bare `import './x.js';` anywhere in the tree reds these.
 */
describe('the sideEffects deletion', () => {
  const root = join(import.meta.dirname, '..', '..', '..', '..');

  /** Every `.ts` under `src/`, path and text. */
  function sourceFiles(dir: string): { path: string; text: string }[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      if (!entry.name.endsWith('.ts')) return [];
      return [{ path: full.slice(root.length + 1), text: readFileSync(full, 'utf8') }];
    });
  }

  it('leaves package.json with no sideEffects field to maintain', () => {
    const pkg: Record<string, unknown> = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(pkg).not.toHaveProperty('sideEffects');
  });

  it('leaves no module in src/ that is imported for its side effects alone', () => {
    const offenders = sourceFiles(join(root, 'src'))
      .filter(({ text }) => /^import\s+['"]/m.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('reaches every map class from the dispatch table by an ordinary value import', () => {
    // A bundler may drop a module nothing uses, and what uses these nine is MAP_SHAPE.
    // Checked as text because an `import type` regression would leave the runtime behaviour
    // right and only the bundle wrong.
    const table = readFileSync(join(root, 'src/mpm/elements/maps/map.ts'), 'utf8');
    for (const cls of new Set(Object.values(EXPECTED_CLASS))) {
      expect(table).toContain(`import { ${cls} } from './${cls}.js';`);
    }
  });
});

describe('construction without a virtual call from the base constructor', () => {
  /**
   * `ImprecisionMap`'s name check runs in its factory, after construction — so after
   * `GenericMap`'s generic name-shape check. These two pin that it fires and that the two
   * validations fire in that order.
   */
  it('rejects an element whose name is not an imprecisionMap', () => {
    expect(
      errOf(ImprecisionMap.createImprecisionMap(new Element(TEMPO_MAP, MPM_NAMESPACE))),
    ).toEqual({
      kind: 'wrongLocalName',
      what: 'ImprecisionMap',
      localName: TEMPO_MAP,
      requirement: 'must contain "imprecisionMap"',
    });
  });

  it('lets the generic name-shape check fire first for a name that is no map at all', () => {
    expect(errOf(ImprecisionMap.createImprecisionMap(new Element('bogus')))).toEqual({
      kind: 'wrongLocalName',
      what: 'GenericMap',
      localName: 'bogus',
      requirement: 'must contain "Map" or equal "score"',
    });
  });

  /**
   * `GenericMap`'s constructor indexes and re-sorts the element's children before
   * `ImprecisionMap`'s name test runs, so an element that is a map but not an imprecision map
   * comes back with its children reordered and no map to show for it. Moving the test up
   * beside its sibling would quietly stop touching the caller's document; this notices.
   */
  it('has already re-sorted the element it then rejects', () => {
    const xml = new Element(TEMPO_MAP, MPM_NAMESPACE);
    for (const date of ['2', '0', '1']) {
      const tempo = new Element('tempo', MPM_NAMESPACE);
      tempo.addAttribute(new Attribute('date', date));
      xml.appendChild(tempo);
    }
    expect(ImprecisionMap.createImprecisionMap(xml).ok).toBe(false);
    expect(
      xml
        .getChildElements()
        .toArray()
        .map((e) => e.getAttributeValue('date')),
    ).toEqual(['0', '1', '2']);
  });

  it('refuses parseData as an entry point', () => {
    // Protected and reachable only through this cast: nothing in the tree calls it, and a
    // caller that finds it should get the reason rather than a map whose element and index
    // have drifted apart.
    const map = okValue(GenericMap.createGenericMap(TEMPO_MAP)) as unknown as {
      parseData: (xml: Element) => void;
    };
    expect(() => {
      map.parseData(new Element(TEMPO_MAP, MPM_NAMESPACE));
    }).toThrow('not an entry point');
  });
});

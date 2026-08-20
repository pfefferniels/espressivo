import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Element } from '../../../../src/xml/XomTypes.js';
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
 * The dispatch table of `maps/map.ts`, which replaced `GenericMap`'s static mutable factory
 * registry.
 *
 * The oracle here is {@link EXPECTED_CLASS}: an independent transcription of the thirteen
 * name ⇒ class pairs, checked by *name string* rather than by `instanceof`, so a row of the
 * table pointing at the wrong factory is a failure rather than a tautology. It is driven off
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
    const map = parseTypedMap(xml);

    expect(map).not.toBeNull();
    expect(map!.constructor.name).toBe(EXPECTED_CLASS[kind]);
    expect(map!.getType()).toBe(kind);
    // The element is adopted, not copied — the map and the document are the same tree.
    expect(map!.getXml()).toBe(xml);
  });

  it.each(MAP_KINDS)('recognises a freshly parsed <%s> as its own kind', (kind) => {
    const map = parseTypedMap(new Element(kind, MPM_NAMESPACE));
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
    const map = parseTypedMap(new Element('vendorMap'));
    expect(map).not.toBeNull();
    expect(map!.constructor.name).toBe('GenericMap');
    expect(map!.getType()).toBe('vendorMap');
  });

  it('returns null for an element that is no map at all', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(parseTypedMap(new Element('note'))).toBeNull();
  });
});

describe('mapOfKind', () => {
  it('rejects a plain GenericMap filed under a typed name — the check the cast could not do', () => {
    // This is exactly the object the tree-shaken bundle used to produce for every map: the
    // right element name, the wrong class. `as TempoMap | null` accepted it and the first
    // `getTempoDataOf` call then threw.
    const impostor = GenericMap.createGenericMap(TEMPO_MAP)!;
    expect(impostor.getType()).toBe(TEMPO_MAP);
    expect(mapOfKind(impostor, TEMPO_MAP)).toBeNull();
  });

  it('rejects a typed map asked for as a different kind', () => {
    const tempoMap = TempoMap.createTempoMap()!;
    expect(mapOfKind(tempoMap, RUBATO_MAP)).toBeNull();
    expect(mapOfKind(tempoMap, TEMPO_MAP)).toBe(tempoMap);
  });

  it('passes null through', () => {
    expect(mapOfKind(null, TEMPO_MAP)).toBeNull();
  });

  it('accepts any imprecision domain as any other — the domain is the Dated key, not the class', () => {
    // Deliberate and documented: five kinds share one class, so the class test cannot tell
    // them apart. What tells them apart is which key the caller looked under, which
    // `Dated.getMapOfKind` supplies. The test below pins that end of it.
    const timing = ImprecisionMap.createImprecisionMap('timing')!;
    expect(mapOfKind(timing, IMPRECISION_MAP_TUNING)).toBe(timing);
  });
});

describe('Dated.getMapOfKind', () => {
  it('returns the typed map for a kind it holds, and null for one it does not', () => {
    const dated = Dated.createDated()!;
    dated.addMapByType(TEMPO_MAP);

    const tempoMap = dated.getMapOfKind(TEMPO_MAP);
    expect(tempoMap).not.toBeNull();
    expect(tempoMap!.constructor.name).toBe('TempoMap');
    expect(dated.getMapOfKind(RUBATO_MAP)).toBeNull();
  });

  it('returns null where getMap returns a map of the wrong class', () => {
    const dated = Dated.createDated()!;
    const impostor = GenericMap.createGenericMap(TEMPO_MAP)!;
    dated.addMap(impostor);

    expect(dated.getMap(TEMPO_MAP)).toBe(impostor);
    expect(dated.getMapOfKind(TEMPO_MAP)).toBeNull();
  });

  it('keeps the four imprecision domains apart', () => {
    const dated = Dated.createDated()!;
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
 * The guard on the `sideEffects` deletion.
 *
 * A green suite proves nothing about tree-shaking — vitest does not tree-shake, which is
 * precisely why the incumbent's hazard survived unnoticed. The real evidence is a bundle:
 * rollup over the facade with `treeshake.moduleSideEffects: false` used to yield 13/13
 * plain `GenericMap`s and now yields 13/13 typed classes. That measurement needs a bundler
 * and so does not live in this suite.
 *
 * What DOES live here is the invariant that makes it stay true, and it is cheap to state:
 * nothing in `src/` may be imported for its side effects alone. Registration-by-import is
 * the only reason the `sideEffects` field ever existed, so a bare `import './x.js';`
 * reappearing anywhere in the tree is the regression, and this reds on it.
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
    // The load-bearing half: a bundler may drop a module nothing *uses*, and what uses these
    // nine is MAP_SHAPE. Checked as text because the alternative — that they are imported —
    // is exactly what a `import type` regression would leave true at runtime and false in
    // the bundle.
    const table = readFileSync(join(root, 'src/mpm/elements/maps/map.ts'), 'utf8');
    for (const cls of new Set(Object.values(EXPECTED_CLASS))) {
      expect(table).toContain(`import { ${cls} } from './${cls}.js';`);
    }
  });
});

describe('construction without a virtual call from the base constructor', () => {
  /**
   * `ImprecisionMap`'s name check used to live in a `parseData` override that
   * `GenericMap`'s constructor reached by virtual dispatch. It now runs in
   * `ImprecisionMap`'s own constructor after `super(...)` returns. These two pin that the
   * check still fires and that the two validations still fire in the same ORDER — the
   * generic name-shape one first — which is the observable the move could have changed.
   */
  it('rejects an element whose name is not an imprecisionMap', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(ImprecisionMap.createImprecisionMap(new Element(TEMPO_MAP, MPM_NAMESPACE))).toBeNull();
    expect(String(spy.mock.calls[0][0])).toContain('must contain "imprecisionMap"');
  });

  it('lets the generic name-shape check fire first for a name that is no map at all', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(ImprecisionMap.createImprecisionMap(new Element('bogus'))).toBeNull();
    expect(String(spy.mock.calls[0][0])).toContain('must contain "Map" or equal "score"');
  });

  it('refuses parseData as an entry point', () => {
    // Protected, and reachable only through this cast — which is the point: nothing in the
    // tree calls it, and a caller that finds it should get the reason rather than a map
    // whose element and index have silently drifted apart.
    const map = GenericMap.createGenericMap(TEMPO_MAP)! as unknown as {
      parseData: (xml: Element) => void;
    };
    expect(() => {
      map.parseData(new Element(TEMPO_MAP, MPM_NAMESPACE));
    }).toThrow('not an entry point');
  });
});

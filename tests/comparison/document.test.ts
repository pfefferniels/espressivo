/**
 * The comparison document layer, against the vendored corpus and against inline XML for the
 * rules no real document happens to exercise.
 *
 * Real fixtures pin what a corpus actually does — a 720/480 ppq disagreement, three named
 * performances in one file, a BOM in front of the declaration. Inline documents pin the
 * renderer rules that matter most and appear least: an empty part-local map shadowing a
 * populated global one, a level name nothing defines, a `<part>` the renderer discards whole.
 * `tests/integration/fixtures/**` is touched by neither (charter invariant 2).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { readPerformances } from '../../src/expression/mpmTree.js';
import {
  documentDateToQuarters,
  readComparisonPair,
  readScopeMapViews,
} from '../../src/comparison/document.js';
import {
  PerformanceSelectionAmbiguousError,
  PerformanceSelectionNotFoundError,
  PerformanceSelectorInvalidError,
} from '../../src/comparison/errors.js';
import { DEFAULT_PPQ, normalizePpq, readPpq } from '../../src/comparison/ppq.js';
import { matchScopes, readScopes } from '../../src/comparison/parts.js';
import { spanEndRuleOf } from '../../src/comparison/spanEnds.js';
import { computeWindow } from '../../src/comparison/window.js';
import {
  RENDERER_DEFAULT_LEVEL,
  bottom,
  isBottom,
  resolveComparisonLevel,
  valued,
} from '../../src/comparison/values.js';
import { elementAt } from '../../src/prelude/index.js';

/** The sole performance of a hand-built document, checked. */
const solePerformance = (text: string) =>
  elementAt(readPerformances(parseMpmRoot(text)), 0, 'the document’s performances');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.mpm`), 'utf-8');

const TELEMANN = fixture('telemann-grave'); // 3 performances, ppq 720, BOM
const VULPIUS = fixture('vulpius-die-helle-sonn'); // 3 performances, ppq 480, BOM
const ALBERT = fixture('albert-du-mein-einzig-licht'); // 2 performances, ppq 720
const MINIMAL = fixture('minimal'); // 1 performance, no maps

/** A one-performance document with whatever global `<dated>` content is supplied. */
const globalDoc = (dated: string, ppq = '720') =>
  `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="${ppq}">` +
  `<global><header/><dated>${dated}</dated></global></performance></mpm>`;

describe('ppq normalization', () => {
  it('reads a declared grid and reports it as declared', () => {
    const performance = solePerformance(globalDoc(''));
    expect(readPpq(performance.element)).toEqual({
      value: 720,
      declared: true,
      unusableDeclaration: null,
    });
  });

  it('falls back to 720 and flags it when no grid is declared', () => {
    const text =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p"><global/></performance></mpm>';
    const performance = solePerformance(text);
    expect(readPpq(performance.element)).toEqual({
      value: DEFAULT_PPQ,
      declared: false,
      unusableDeclaration: null,
    });
  });

  it('keeps "declared but unusable" distinct from "not declared"', () => {
    // §5.0/A21: fallbackUsed means exactly "declared none". A document that wrote something
    // unusable did declare one, so it must not be reported as silent.
    const performance = solePerformance(globalDoc('', 'lots'));
    expect(readPpq(performance.element)).toEqual({
      value: DEFAULT_PPQ,
      declared: true,
      unusableDeclaration: 'lots',
    });
  });

  it('computes the lcm grid with integer factors on the real 720/480 pair', () => {
    const pair = readComparisonPair({
      a: TELEMANN,
      b: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Baroque',
    });
    expect(pair.ppq).toEqual({
      a: 720,
      b: 480,
      lcm: 1440,
      factorA: 2,
      factorB: 3,
      fallbackUsed: false,
      assumed: null,
    });
    expect(Number.isInteger(pair.ppq.factorA)).toBe(true);
    expect(Number.isInteger(pair.ppq.factorB)).toBe(true);
  });

  it('maps a date from each own grid onto the same quarter', () => {
    const pair = readComparisonPair({
      a: TELEMANN,
      b: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Baroque',
    });
    // One quarter note is 720 ticks in A and 480 in B; both are quarter 1 on the lcm grid.
    expect(documentDateToQuarters(720, pair.a, pair.ppq)).toBe(1);
    expect(documentDateToQuarters(480, pair.b, pair.ppq)).toBe(1);
  });

  it('is the identity when both grids agree', () => {
    const equal = normalizePpq(
      { value: 720, declared: true, unusableDeclaration: null },
      { value: 720, declared: true, unusableDeclaration: null },
    );
    expect(equal.lcm).toBe(720);
    expect(equal.factorA).toBe(1);
    expect(equal.factorB).toBe(1);
  });

  it('flags the fallback when either side is undeclared', () => {
    const declared = { value: 720, declared: true, unusableDeclaration: null } as const;
    const assumed = { value: 720, declared: false, unusableDeclaration: null } as const;
    expect(normalizePpq(declared, assumed).fallbackUsed).toBe(true);
    expect(normalizePpq(assumed, declared).assumed).toBe(DEFAULT_PPQ);
    expect(normalizePpq(declared, declared).assumed).toBeNull();
  });
});

describe('performance selection', () => {
  it('needs no selector for a single-performance document', () => {
    expect(() => readComparisonPair({ a: MINIMAL, b: MINIMAL })).not.toThrow();
  });

  it('throws naming every candidate when a multi-performance document has no selector', () => {
    expect(() => readComparisonPair({ a: TELEMANN, b: MINIMAL })).toThrow(
      PerformanceSelectionAmbiguousError,
    );
    try {
      readComparisonPair({ a: TELEMANN, b: MINIMAL });
      expect.unreachable('should have thrown');
    } catch (error) {
      const ambiguous = error as PerformanceSelectionAmbiguousError;
      expect(ambiguous.role).toBe('a');
      expect(ambiguous.candidates).toEqual(['Baroque', 'Fast', 'Romantic']);
      expect(ambiguous.message).toContain('"Baroque"');
    }
  });

  it('names the offending document role, not just the problem', () => {
    try {
      readComparisonPair({ a: MINIMAL, b: VULPIUS });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as PerformanceSelectionAmbiguousError).role).toBe('b');
    }
  });

  it('selects by name and by index, and they agree', () => {
    const byName = readComparisonPair({
      a: TELEMANN,
      performanceA: 'Romantic',
      performanceB: 'Baroque',
    });
    const byIndex = readComparisonPair({ a: TELEMANN, performanceA: 2, performanceB: 0 });
    expect(byName.a.performance.name).toBe('Romantic');
    expect(byIndex.a.performance.name).toBe('Romantic');
    expect(byName.b.performance.name).toBe('Baroque');
    expect(byIndex.b.performance.name).toBe('Baroque');
  });

  it('throws not-found for an unknown name or an out-of-range index', () => {
    expect(() =>
      readComparisonPair({ a: TELEMANN, performanceA: 'Nonesuch', performanceB: 0 }),
    ).toThrow(PerformanceSelectionNotFoundError);
    expect(() => readComparisonPair({ a: TELEMANN, performanceA: 9, performanceB: 0 })).toThrow(
      PerformanceSelectionNotFoundError,
    );
  });

  it('separates an invalid selector from a not-found one', () => {
    // §9.4 splits these because the caller could have known about -1 without reading a file.
    expect(() => readComparisonPair({ a: TELEMANN, performanceA: -1, performanceB: 0 })).toThrow(
      PerformanceSelectorInvalidError,
    );
    expect(() => readComparisonPair({ a: TELEMANN, performanceA: 1.5, performanceB: 0 })).toThrow(
      PerformanceSelectorInvalidError,
    );
  });

  it('routes a zero-performance document to not-found (C8)', () => {
    const empty = '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"/>';
    expect(() => readComparisonPair({ a: empty, b: MINIMAL })).toThrow(
      PerformanceSelectionNotFoundError,
    );
  });

  it('defaults b to a, so one document can compare two of its own performances (C16)', () => {
    const pair = readComparisonPair({
      a: ALBERT,
      performanceA: 'Axel Berndt',
      performanceB: 'Like a robot',
    });
    expect(pair.a.performance.name).toBe('Axel Berndt');
    expect(pair.b.performance.name).toBe('Like a robot');
    expect(pair.ppq.factorA).toBe(1);
  });
});

describe('scopes, matching and map resolution', () => {
  it('matches parts by @number and reports a name disagreement', () => {
    const withPart = (number: string, name: string) =>
      `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">` +
      `<global><header/><dated/></global>` +
      `<part name="${name}" number="${number}" midi.channel="0" midi.port="0">` +
      `<header/><dated/></part></performance></mpm>`;

    const pair = readComparisonPair({ a: withPart('1', 'Violin'), b: withPart('1', 'Fiddle') });
    const part = pair.scopes.find((scope) => scope.scope === 'part');
    expect(part?.matched).toBe(true);
    expect(part?.nameA).toBe('Violin');
    expect(part?.nameB).toBe('Fiddle');
    expect(part?.nameDisagreement).toBe(true);
  });

  it('keeps an unmatched part as a row against neutral rather than dropping it (R6)', () => {
    const one =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated/></global>' +
      '<part name="V" number="1" midi.channel="0" midi.port="0"><header/><dated/></part>' +
      '</performance></mpm>';
    const two = one.replace(
      '</performance>',
      '<part name="C" number="2" midi.channel="1" midi.port="0"><header/><dated/></part></performance>',
    );

    const pair = readComparisonPair({ a: one, b: two });
    const parts = pair.scopes.filter((scope) => scope.scope === 'part');
    expect(parts).toHaveLength(2);
    const partAt = (index: number) => elementAt(parts, index, 'the pair’s part scopes');
    expect(partAt(0).matched).toBe(true);
    expect(partAt(1).matched).toBe(false);
    expect(partAt(1).numberA).toBeNull();
    expect(partAt(1).numberB).toBe(2);
    expect(pair.comparability.partNumbersMatched).toBe(false);
  });

  it('orders part rows by number, independently of which document is a (R2)', () => {
    const parts = (numbers: readonly string[]) =>
      numbers
        .map(
          (n) =>
            `<part name="p${n}" number="${n}" midi.channel="0" midi.port="0"><header/><dated/></part>`,
        )
        .join('');
    const doc = (numbers: readonly string[]) =>
      `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">` +
      `<global><header/><dated/></global>${parts(numbers)}</performance></mpm>`;

    const forward = readComparisonPair({ a: doc(['3', '1']), b: doc(['1', '3']) });
    const reverse = readComparisonPair({ a: doc(['1', '3']), b: doc(['3', '1']) });
    const numbers = (pair: typeof forward) =>
      pair.scopes.filter((s) => s.scope === 'part').map((s) => s.numberA ?? s.numberB);
    expect(numbers(forward)).toEqual([1, 3]);
    expect(numbers(reverse)).toEqual([1, 3]);
  });

  it('drops a <part> the renderer itself discards, rather than charging its content', () => {
    // Part.parseData throws without @number/@midi.channel/@midi.port, Part.createPart returns
    // null, and Performance.parseData continues past it — so nothing in it is ever performed.
    const broken =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated/></global>' +
      '<part name="no number"><header/><dated>' +
      '<tempoMap><tempo date="0.0" bpm="200" beatLength="0.25"/></tempoMap>' +
      '</dated></part></performance></mpm>';

    const scopes = readScopes(solePerformance(broken));
    const part = scopes.find((scope) => scope.scope === 'part');
    expect(part?.renderable).toBe(false);

    const pairings = matchScopes(scopes, scopes);
    expect(pairings.filter((pairing) => pairing.scope === 'part')).toHaveLength(0);

    const pair = readComparisonPair({ a: broken, b: broken });
    expect(pair.comparability.instructionCountA).toBe(0);
  });

  it('compares a RENDERABLE part with an unusable @number against neutral, never against its twin', () => {
    /**
     * A blind spot closed by a negative control on `matchScopes`, which splits renderable parts
     * into numbered and unnumbered, pairs the numbered ones by number, and pushes each
     * unnumbered one against neutral — A-side block first, then B-side, which is what makes the
     * result symmetric under a swap. Keying the unnumbered ones at `-1` instead, which pairs
     * the two documents' unnumbered parts with each other, left the whole suite green: no test
     * in the tree reached that code with an unnumbered part.
     *
     * The case is reachable, and only just. `Part.parseData` throws only when `@number` /
     * `@midi.channel` / `@midi.port` are absent or empty, never on their value, while the
     * scope's `number` is `parseInt`, which answers NaN here and is reported as null. So
     * `number="abc"` is a part the renderer really does construct (with `this.number = NaN`,
     * matching no MSM part) and that this module has to place against neutral.
     */
    const unnumbered =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated/></global>' +
      '<part name="V" number="abc" midi.channel="0" midi.port="0"><header/><dated>' +
      '<tempoMap><tempo date="0.0" bpm="200" beatLength="0.25"/></tempoMap>' +
      '</dated></part></performance></mpm>';

    // Destructured and checked rather than indexed: `tests/` runs with
    // `noUncheckedIndexedAccess`, under which `[0]` is an error.
    const [performance] = readPerformances(parseMpmRoot(unnumbered));
    if (performance === undefined) throw new Error('no performance');

    const scopes = readScopes(performance);
    const part = scopes.find((scope) => scope.scope === 'part');
    // Renderable — the renderer builds this part — but with no usable number.
    expect({ renderable: part?.renderable, number: part?.number }).toEqual({
      renderable: true,
      number: null,
    });

    const parts = matchScopes(scopes, scopes).filter((pairing) => pairing.scope === 'part');
    // Two pairings, each against neutral — not one pairing of the part with itself.
    expect(
      parts.map((pairing) => ({
        matched: pairing.matched,
        numberA: pairing.numberA,
        numberB: pairing.numberB,
        hasA: pairing.a !== null,
        hasB: pairing.b !== null,
      })),
    ).toEqual([
      { matched: false, numberA: null, numberB: null, hasA: true, hasB: false },
      { matched: false, numberA: null, numberB: null, hasA: false, hasB: true },
    ]);
  });

  it('lets an EMPTY part-local map shadow a populated global one (AD-16)', () => {
    const text =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated>' +
      '<dynamicsMap><dynamics date="0.0" volume="40"/></dynamicsMap>' +
      '</dated></global>' +
      '<part name="V" number="1" midi.channel="0" midi.port="0"><header/><dated>' +
      '<dynamicsMap/>' +
      '</dated></part></performance></mpm>';

    const scopes = readScopes(solePerformance(text));
    const part = scopes.find((scope) => scope.scope === 'part');
    const resolved = part?.maps.get('dynamicsMap');
    expect(resolved).toBeDefined();
    // The part's own empty element, not the global one with an instruction in it.
    expect(readScopeMapViews(part!).get('dynamicsMap')?.entries).toHaveLength(0);
    expect(resolved?.getChildElements().size()).toBe(0);
  });

  it('inherits the global map wholesale where the part declares none', () => {
    const text =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header/><dated>' +
      '<tempoMap><tempo date="0.0" bpm="90" beatLength="0.25"/></tempoMap>' +
      '</dated></global>' +
      '<part name="V" number="1" midi.channel="0" midi.port="0"><header/><dated/></part>' +
      '</performance></mpm>';

    const scopes = readScopes(solePerformance(text));
    const part = scopes.find((scope) => scope.scope === 'part');
    expect(readScopeMapViews(part!).get('tempoMap')?.entries).toHaveLength(1);
  });

  it('reads maps of the real three-performance fixture per performance', () => {
    const pair = readComparisonPair({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
    });
    const global = pair.a.scopes.find((scope) => scope.scope === 'global');
    expect(global?.maps.has('tempoMap')).toBe(true);
    expect(readScopeMapViews(global!).get('tempoMap')?.entries.length).toBeGreaterThan(0);
    expect(pair.comparability.instructionCountA).toBeGreaterThan(0);
    expect(pair.comparability.instructionCountB).toBeGreaterThan(0);
  });
});

describe('ordered instruction views', () => {
  it('uses the renderer date order, not document order', () => {
    const text = globalDoc(
      '<tempoMap>' +
        '<tempo date="960.0" bpm="90" beatLength="0.25"/>' +
        '<tempo date="0.0" bpm="60" beatLength="0.25"/>' +
        '</tempoMap>',
    );
    const scopes = readScopes(solePerformance(text));
    const view = readScopeMapViews(elementAt(scopes, 0, 'the document’s scopes')).get('tempoMap');
    expect(view?.entries.map((entry) => entry.date)).toEqual([0, 960]);
    // documentIndex survives, so the site locator still points into the untouched tree
    expect(view?.entries.map((entry) => entry.documentIndex)).toEqual([1, 0]);
  });

  it('resolves the style in scope positionally, not by date', () => {
    // An instruction preceding a <style> at the same date has no style in scope — what the
    // renderer's findStyleSwitchAt does, and where getStyleAt(date) disagrees.
    const text = globalDoc(
      '<dynamicsMap>' +
        '<dynamics date="0.0" volume="f"/>' +
        '<style date="0.0" name.ref="MEI export"/>' +
        '<dynamics date="720.0" volume="p"/>' +
        '</dynamicsMap>',
    );
    const scopes = readScopes(solePerformance(text));
    const view = readScopeMapViews(elementAt(scopes, 0, 'the document’s scopes')).get(
      'dynamicsMap',
    );
    expect(view?.styleNames).toEqual([null, 'MEI export', 'MEI export']);
  });
});

describe('span-end rules (AD-14ii / R12)', () => {
  it('gives the span maps that really name-test the same-local-name rule', () => {
    for (const name of [
      'tempoMap',
      'rubatoMap',
      'dynamicsMap',
      'metricalAccentuationMap',
      'movementMap',
    ])
      expect(spanEndRuleOf(name)).toBe('same-local-name');
  });

  it('gives asynchronyMap the ANY-ENTRY rule, against §5.0 and with §5.7', () => {
    // DESIGN contradicts itself; the renderer settles it. AsynchronyMap takes
    // `this.elements[asynIndex + 1].key` with no name test, and GenericMap indexes every
    // dated child including <style>, while TempoMap.getEndDate does test
    // getLocalName() === 'tempo'.
    expect(spanEndRuleOf('asynchronyMap')).toBe('any-entry');
  });

  it('gives every imprecision spelling the any-entry rule', () => {
    for (const name of [
      'imprecisionMap',
      'imprecisionMap.timing',
      'imprecisionMap.dynamics',
      'imprecisionMap.toneduration',
      'imprecisionMap.tuning',
    ])
      expect(spanEndRuleOf(name)).toBe('any-entry');
  });

  it('marks the atom maps as events, not spans', () => {
    expect(spanEndRuleOf('articulationMap')).toBe('event');
    expect(spanEndRuleOf('ornamentationMap')).toBe('event');
  });

  it('returns null for a map the model does not define', () => {
    // The surveyed Daten corpus contains one of these; Dated indexes it because its
    // predicate is localName.includes('Map'), and it has no renderer and so no span law.
    expect(spanEndRuleOf('gestureMap')).toBeNull();
  });
});

describe('window rules and stamps (AD-4)', () => {
  const base = { lastDateQuartersA: 10, lastDateQuartersB: 20 };

  it('falls back to the max last instruction, stamped window-restricted', () => {
    expect(computeWindow(base)).toEqual({
      startQuarters: 0,
      endQuarters: 20,
      rule: 'pair-derived',
      metricGuarantee: 'window-restricted',
    });
  });

  it('prefers an explicit window and stamps it unconditional', () => {
    expect(computeWindow({ ...base, explicit: { start: 2, end: 8 } })).toEqual({
      startQuarters: 2,
      endQuarters: 8,
      rule: 'explicit',
      metricGuarantee: 'unconditional',
    });
  });

  it('prefers the corpus window over the pair-derived floor', () => {
    const window = computeWindow({ ...base, corpusEndQuarters: 64 });
    expect(window.rule).toBe('corpus');
    expect(window.metricGuarantee).toBe('unconditional');
  });

  it('lets an EXPLICIT window outrank the MSM score end (AD-27.1)', () => {
    // AD-27.1 reverses §5.0's list, which put MSM first: an explicit caller choice outranks
    // the MSM end, as it does every other option here.
    const window = computeWindow({
      ...base,
      msmEndQuarters: 32,
      explicit: { start: 0, end: 8 },
      corpusEndQuarters: 64,
    });
    expect(window.rule).toBe('explicit');
    expect(window.endQuarters).toBe(8);
  });

  it('still uses the MSM score end when no explicit window is given', () => {
    const window = computeWindow({ ...base, msmEndQuarters: 32, corpusEndQuarters: 64 });
    expect(window.rule).toBe('msm');
    expect(window.endQuarters).toBe(32);
    expect(window.metricGuarantee).toBe('unconditional');
  });

  it('stamps the real fixture pair as window-restricted with no MSM', () => {
    const pair = readComparisonPair({
      a: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Fast',
    });
    expect(pair.window.rule).toBe('pair-derived');
    expect(pair.window.metricGuarantee).toBe('window-restricted');
    expect(pair.window.startQuarters).toBe(0);
    expect(pair.window.endQuarters).toBeGreaterThan(0);
  });

  it('does not let an empty document produce a NaN or inverted window', () => {
    const pair = readComparisonPair({ a: MINIMAL, b: MINIMAL });
    expect(pair.window.endQuarters).toBe(0);
    expect(Number.isFinite(pair.window.endQuarters)).toBe(true);
  });
});

describe('renderer-default level resolution (R8 / AD-1)', () => {
  const resolveIn = (
    dated: string,
    header: string,
    level: string,
    domain: 'tempo' | 'dynamics',
  ) => {
    const text =
      `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">` +
      `<global><header>${header}</header><dated>${dated}</dated></global></performance></mpm>`;
    const performance = solePerformance(text);
    const scopes = readScopes(performance);
    const styleName = readScopeMapViews(elementAt(scopes, 0, 'the document’s scopes')).get(
      domain === 'tempo' ? 'tempoMap' : 'dynamicsMap',
    )?.styleNames[0];
    return resolveComparisonLevel(
      level,
      domain,
      styleName ?? null,
      elementAt(scopes, 0, 'the document’s scopes').environment,
      performance.global,
    );
  };

  it('resolves a named level through its styleDef', () => {
    const resolved = resolveIn(
      '<tempoMap><style date="0.0" name.ref="T"/><tempo date="0.0" bpm="Andante" beatLength="0.25"/></tempoMap>',
      '<tempoStyles><styleDef name="T"><tempoDef name="Andante" value="101.0"/></styleDef></tempoStyles>',
      'Andante',
      'tempo',
    );
    expect(resolved.source).toBe('def');
    expect(resolved.value).toBe(101);
  });

  it('resolves a numeric level as a literal', () => {
    const resolved = resolveIn(
      '<tempoMap><tempo date="0.0" bpm="72" beatLength="0.25"/></tempoMap>',
      '',
      '72',
      'tempo',
    );
    expect(resolved.source).toBe('literal');
    expect(resolved.value).toBe(72);
  });

  it('performs an UNRESOLVABLE tempo level at the renderer default of 100, not as a gap', () => {
    // AD-1: styleScope refuses to invent a level, which is right for a write transform and
    // wrong for a read of what is performed.
    const resolved = resolveIn(
      '<tempoMap><tempo date="0.0" bpm="Allegrissimo" beatLength="0.25"/></tempoMap>',
      '',
      'Allegrissimo',
      'tempo',
    );
    expect(resolved.source).toBe('renderer-default');
    expect(resolved.value).toBe(RENDERER_DEFAULT_LEVEL);
    expect(resolved.raw).toBe('Allegrissimo');
  });

  it('performs an unresolvable dynamics level at 100 too', () => {
    const resolved = resolveIn(
      '<dynamicsMap><dynamics date="0.0" volume="?"/></dynamicsMap>',
      '',
      '?',
      'dynamics',
    );
    expect(resolved.source).toBe('renderer-default');
    expect(resolved.value).toBe(RENDERER_DEFAULT_LEVEL);
  });

  it('makes volume="?" and volume="100" agree, which is what the renderer does', () => {
    const unresolvable = resolveIn(
      '<dynamicsMap><dynamics date="0.0" volume="?"/></dynamicsMap>',
      '',
      '?',
      'dynamics',
    );
    const literal = resolveIn(
      '<dynamicsMap><dynamics date="0.0" volume="100"/></dynamicsMap>',
      '',
      '100',
      'dynamics',
    );
    expect(unresolvable.value).toBe(literal.value);
  });

  it('honours per-name styleDef shadowing through styleScope, not a header scan', () => {
    // A part styleDef "T" hides the global "T" entirely, defs and all, so resolving "Andante"
    // under it finds no def and falls through to the renderer default.
    const text =
      '<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720">' +
      '<global><header><tempoStyles><styleDef name="T">' +
      '<tempoDef name="Andante" value="101.0"/></styleDef></tempoStyles></header><dated/></global>' +
      '<part name="V" number="1" midi.channel="0" midi.port="0"><header>' +
      '<tempoStyles><styleDef name="T"><tempoDef name="Largo" value="50.0"/></styleDef></tempoStyles>' +
      '</header><dated/></part></performance></mpm>';

    const performance = solePerformance(text);
    const scopes = readScopes(performance);
    const part = scopes.find((scope) => scope.scope === 'part')!;

    expect(
      resolveComparisonLevel('Andante', 'tempo', 'T', part.environment, performance.global).source,
    ).toBe('renderer-default');
    expect(
      resolveComparisonLevel('Largo', 'tempo', 'T', part.environment, performance.global).value,
    ).toBe(50);
  });
});

describe('⊥ plumbing', () => {
  it('carries a marker that is distinguishable from every value', () => {
    const missing = bottom('renderer-error');
    expect(isBottom(missing)).toBe(true);
    expect(missing.cause).toBe('renderer-error');
    expect(isBottom(valued(0))).toBe(false);
    // 0 is a perfectly good value and must not read as absence
    const zero = valued(0);
    expect(zero.kind === 'value' && zero.value).toBe(0);
  });
});

describe('comparability evidence (C7)', () => {
  it('reports the length ratio and the grids for a cross-ppq pair', () => {
    const pair = readComparisonPair({
      a: TELEMANN,
      b: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Baroque',
    });
    expect(pair.comparability.ppqA).toBe(720);
    expect(pair.comparability.ppqB).toBe(480);
    expect(pair.comparability.lengthRatio).toBeGreaterThan(0);
    expect(pair.comparability.lengthRatio).toBeLessThanOrEqual(1);
  });

  it('calls two empty documents the same length rather than dividing by zero', () => {
    const pair = readComparisonPair({ a: MINIMAL, b: MINIMAL });
    expect(pair.comparability.lengthRatio).toBe(1);
    expect(pair.comparability.lastDateA).toBe(0);
  });

  it('is symmetric in the length ratio', () => {
    const forward = readComparisonPair({
      a: TELEMANN,
      b: VULPIUS,
      performanceA: 'Baroque',
      performanceB: 'Baroque',
    });
    const reverse = readComparisonPair({
      a: VULPIUS,
      b: TELEMANN,
      performanceA: 'Baroque',
      performanceB: 'Baroque',
    });
    expect(forward.comparability.lengthRatio).toBe(reverse.comparability.lengthRatio);
  });
});

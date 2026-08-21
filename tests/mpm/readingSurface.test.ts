/**
 * The MPM object model as a *reading* API, `docs/reading.md`.
 *
 * `Mpm` was exported long before the classes below it were, so `mpm.getPerformance(0)` answered
 * a type no consumer could name and reading an MPM for display meant deep-importing past
 * `dist/`. What is pinned here is the walk that fixes: root import only, from document text
 * down to a drawable curve, plus the three renderer behaviours a hand-rolled reader gets wrong.
 *
 * Every import is from `src/index.js` **deliberately** — a deep import would pass while the
 * public surface was broken, which is the exact regression this file exists to catch. The
 * guide's code blocks are typechecked by being written the same way here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  Mpm,
  DYNAMICS_MAP,
  METRICAL_ACCENTUATION_MAP,
  TEMPO_MAP,
  dynamicsAt,
  innerControlPointsXPositions,
  isConstantDynamics,
  tempoAt,
  type Dynamics,
  type GenericMap,
  type Performance,
  type Tempo,
} from '../../src/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const allMaps = readFileSync(join(FIXTURES, 'all-maps-reference', 'all_maps.mpm'), 'utf-8');

/** The fixture's sole performance, as a consumer reaches it. */
function performanceOf(text: string): Performance {
  const performance = new Mpm(text).getPerformance(0);
  if (performance === null) throw new Error('fixture has no performance');
  return performance;
}

/**
 * The map of `kind` governing `part`, with the shadowing rule applied: a part's own map wins
 * outright over the global one, rather than merging with it.
 */
function mapInScope<K extends 'tempoMap' | 'dynamicsMap' | 'metricalAccentuationMap'>(
  performance: Performance,
  partIndex: number | null,
  kind: K,
) {
  const part = partIndex === null ? null : (performance.getAllParts()[partIndex] ?? null);
  return (
    part?.getDated()?.getMapOfKind(kind) ??
    performance.getGlobal()?.getDated()?.getMapOfKind(kind) ??
    null
  );
}

describe('the MPM object model is reachable and nameable from the package root', () => {
  it('walks performance → environment → map → instruction without a deep import', () => {
    const performance = performanceOf(allMaps);
    expect(performance.getName()).toBe('test performance');
    expect(performance.getPulsesPerQuarter()).toBe(720);

    // Global and part are both readable, and each answers its own maps.
    const globalMaps = performance.getGlobal()?.getDated()?.getAllMaps();
    expect([...(globalMaps?.keys() ?? [])]).toEqual(['tempoMap', 'rubatoMap']);

    const partMaps = performance.getAllParts()[0]?.getDated()?.getAllMaps();
    expect([...(partMaps?.keys() ?? [])]).toContain('dynamicsMap');
  });

  it('takes an inventory of every dated entry, style switches included', () => {
    const performance = performanceOf(allMaps);
    const rows: { container: string; type: string; date: number; xmlId: string | null }[] = [];

    for (const environment of [performance.getGlobal(), ...performance.getAllParts()]) {
      for (const [name, map] of environment?.getDated()?.getAllMaps() ?? []) {
        const generic: GenericMap = map;
        for (const { key: date, value: element } of generic.getAllElements())
          rows.push({
            container: name,
            type: element.getLocalName(),
            date,
            xmlId: element.getAttributeValue('id'),
          });
      }
    }

    expect(rows.length).toBeGreaterThan(10);
    // A `<style>` switch is a dated entry like any other — the guide warns readers not to
    // assume every entry is an instruction, and this is the evidence for that sentence.
    expect(rows.some((row) => row.type === 'style')).toBe(true);
    // …and this fixture carries no ids at all, which is why `docs/reading.md` tells a viewer to
    // locate by (container, index) and treat `xml:id` as the nicety it is.
    expect(rows.every((row) => row.xmlId === null)).toBe(true);
  });

  it('resolves one instruction into the renderer’s own arithmetic', () => {
    const performance = performanceOf(allMaps);
    const tempoMap = mapInScope(performance, null, TEMPO_MAP);
    const tempo: Tempo | null = tempoMap?.getTempoDataOf(0) ?? null;

    expect(tempo).not.toBeNull();
    expect(tempo?.kind).toBe('constant');
    expect(tempo?.bpm).toBe(120);
    // `@bpm` as written survives beside the resolved number, so a popover can print what the
    // document says rather than what it means.
    expect(tempo?.bpmString).toBe('120');
    expect(tempo?.beatLength).toBe(0.25);
    expect(tempo?.startDate).toBe(0);
    expect(tempo?.endDate).toBe(2880);

    if (tempo !== null) expect(tempoAt(tempo, 1440)).toBe(120);
  });

  it('samples an instruction into a polyline, which is what a chart draws', () => {
    const performance = performanceOf(allMaps);
    const tempo = mapInScope(performance, null, TEMPO_MAP)?.getTempoDataOf(0) ?? null;
    if (tempo === null) throw new Error('fixture lost its first tempo');

    const points = Array.from({ length: 100 }, (_, k) => {
      const date = tempo.startDate + ((tempo.endDate - tempo.startDate) * k) / 99;
      return [date, tempoAt(tempo, date)] as const;
    });

    expect(points).toHaveLength(100);
    expect(points.every(([, bpm]) => Number.isFinite(bpm))).toBe(true);
    expect(points[0]?.[0]).toBe(0);
  });

  it('hands back the Bézier already derived, and the geometry behind it', () => {
    const performance = performanceOf(allMaps);
    const dynamicsMap = mapInScope(performance, 0, DYNAMICS_MAP);
    const d: Dynamics | null = dynamicsMap?.getDynamicsDataOf(0) ?? null;

    expect(d).not.toBeNull();
    expect(d?.volume).toBe(80);
    expect(isConstantDynamics(d!)).toBe(true);
    // `x1`/`x2` are computed once at read time, so a caller never re-derives them per sample.
    expect(Number.isFinite(d!.x1)).toBe(true);
    expect(Number.isFinite(d!.x2)).toBe(true);
    expect(dynamicsAt(d!, 0)).toBe(80);

    expect(innerControlPointsXPositions(0.5, 0.2)).toEqual([0.6, 0.6]);
  });

  it('resolves an accentuationPattern’s def, length and all, in one call', () => {
    const performance = performanceOf(allMaps);
    const accentuation = mapInScope(performance, 0, METRICAL_ACCENTUATION_MAP);
    // Entry 0 is the `<style>` switch; the instruction is entry 1.
    const md = accentuation?.getMetricalAccentuationDataOf(1) ?? null;

    expect(md).not.toBeNull();
    expect(md?.accentuationPatternDefName).toBe('4/4');
    // `@name.ref` is resolved through the style in scope for the caller — the reason
    // `docs/reading.md` does not publish a separate def reader.
    expect(md?.accentuationPatternDef).not.toBeNull();
    expect(md?.accentuationPatternDef?.getLength()).toBe(2880);
    expect(md?.loop).toBe(true);
  });
});

describe('the renderer behaviours a hand-rolled reader gets wrong (docs/reading.md)', () => {
  it('performs a TRAILING transition as a constant, not as a ramp', () => {
    const performance = performanceOf(allMaps);
    const tempoMap = mapInScope(performance, null, TEMPO_MAP);
    // The fixture's last <tempo> declares `bpm="120" transition.to="90"`. Reading that as a
    // ritardando would invent the most audible gesture in the file; the renderer's span-end for
    // a trailing instruction is MAX_VALUE, so it never leaves 120.
    const trailing = tempoMap?.getTempoDataOf(1) ?? null;

    expect(trailing?.kind).toBe('transitioning');
    expect(trailing?.endDate).toBe(Number.MAX_VALUE);
    for (const date of [2880, 3600, 5760, 100_000])
      expect(tempoAt(trailing!, date)).toBeCloseTo(120, 9);
  });

  it('performs a trailing <dynamics> transition flat, by the same rule', () => {
    const performance = performanceOf(allMaps);
    const d = mapInScope(performance, 0, DYNAMICS_MAP)?.getDynamicsDataOf(1) ?? null;

    // `volume="80" transition.to="110"` on the map's last instruction.
    expect(d?.volume).toBe(80);
    expect(d?.transitionTo).toBe(110);
    expect(d?.endDate).toBe(Number.MAX_VALUE);
    for (const date of [2880, 3600, 5760]) expect(dynamicsAt(d!, date)).toBeCloseTo(80, 9);
  });

  it('returns null for an instruction the renderer SKIPS, rather than guessing', () => {
    // `@bpm` present but `@beatLength` absent: `getTempoDataOf` is null, and the renderer times
    // the following notes at the 100-quarter-bpm default instead of extending anything.
    const text = `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720"><global><header /><dated><tempoMap><tempo date="0.0" bpm="120" /></tempoMap></dated></global></performance></mpm>`;
    const tempoMap = mapInScope(performanceOf(text), null, TEMPO_MAP);

    expect(tempoMap?.size()).toBe(1);
    expect(tempoMap?.getTempoDataOf(0)).toBeNull();
  });

  it('resolves an unresolvable level to a number, not to an absence', () => {
    // `volume="-"` names no dynamicsDef and parses as no number, so the renderer fabricates
    // 100.0 and logs. A viewer that wants to SHOW the document is broken must compare
    // `volumeString` against the resolved value, because the value alone cannot say.
    const text = `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0"><performance name="p" pulsesPerQuarter="720"><global><header /><dated><dynamicsMap><dynamics date="0.0" volume="-" /></dynamicsMap></dated></global></performance></mpm>`;
    const d = mapInScope(performanceOf(text), null, DYNAMICS_MAP)?.getDynamicsDataOf(0) ?? null;

    expect(d?.volume).toBe(100);
    expect(d?.volumeString).toBe('-');
  });
});

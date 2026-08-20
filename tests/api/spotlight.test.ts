/**
 * `spotlightMpm` as a caller meets it: what a selection spares, what it damps, and the error
 * surface that keeps a stale selection from becoming a silently flattened performance.
 *
 * Almost everything here runs against the **reference corpus** rather than hand-built documents,
 * because what spotlight adds to the engine is selection, and selection is the one part of this
 * campaign the real fixtures can exercise end to end: `all_maps.mpm` carries an instruction of
 * every selectable type except `<ornament>`, `ornamentation.mpm` carries four `<ornament>`s that
 * already have ids, `movement.mpm` carries the only pedal curve in the corpus that is not the
 * last of its map, and `comprehensive.mpm` is the piecewise-constant named-level shape A7's
 * inertness rule exists for. The single exception is `imprecisionMap.toneduration`, which no
 * fixture in the corpus has at all, so `imprecisionDuration` gets a hand-built document.
 *
 * The fixtures on disk are never edited (charter invariant 2). Where one lacks an `xml:id` —
 * `all_maps.mpm` has none at all — the id is grafted into the **text** at read time, the same
 * technique `tests/integration/expression-transform.test.ts` uses to de-vacuize its R5 pins.
 * The graft adds an attribute to an element that already exists; it never adds an element, so
 * what is spotlit is the fixture's own instruction.
 *
 * The table in the first block is closed against `EXPRESSION_DIMENSIONS`: every dimension must
 * be spared by some row, so a sixteenth dimension — or a row that stops sparing what it used to
 * — fails the suite rather than quietly shrinking the coverage.
 *
 * The rendered direction claim — background gesture shrinks, foreground does not move — needs a
 * performance and lives in `tests/integration/expression-spotlight.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  EXPRESSION_DIMENSIONS,
  InvalidOptionError,
  MeicoError,
  ParseError,
  PerformanceNotFoundError,
  SelectionNotFoundError,
  canonicalMpm,
  spotlightMpm,
  type ExpressionDimension,
  type SpotlightOptions,
  type XmlText,
} from '../../src/api/index.js';

import { elementAt } from '../../src/prelude/index.js';
import type { ExaggerationReport } from '../../src/api/index.js';

/** The sole performance sub-report of a spotlight run, checked. */
const soleReport = (report: ExaggerationReport) =>
  elementAt(report.performances, 0, 'the report’s performances');

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const reference = (name: string) =>
  readFileSync(join(FIXTURES, 'reference', `${name}.mpm`), 'utf-8') as XmlText;
const allMaps = (name: string) =>
  readFileSync(join(FIXTURES, 'all-maps-reference', `${name}.mpm`), 'utf-8') as XmlText;

/**
 * Put an `xml:id` on the fixture's own element, by textual graft at read time.
 *
 * `anchor` is matched once and must be unique in the file; a miss throws rather than silently
 * producing a document with no selectable id, which would make every assertion below vacuous.
 */
function withId(mpm: XmlText, anchor: string, id: string): XmlText {
  const occurrences = mpm.split(anchor).length - 1;
  if (occurrences !== 1)
    throw new Error(`graft anchor ${JSON.stringify(anchor)} matched ${occurrences} times, want 1`);
  return mpm.replace(anchor, `${anchor} xml:id="${id}"`) as XmlText;
}

/** `all_maps.mpm` with one instruction of every selectable type in it given an id. */
const ALL_MAPS = (
  [
    ['<tempo date="2880.0"', 'pickTempo'],
    ['<dynamics date="2880.0"', 'pickDynamics'],
    ['<rubato date="0.0"', 'pickRubato'],
    ['<articulation date="720.0"', 'pickArticulation'],
    ['<accentuationPattern date="0.0"', 'pickAccentuation'],
    ['<asynchrony date="0.0"', 'pickAsynchrony'],
    ['<imprecisionMap.timing><distribution.uniform date="0.0"', 'pickImprecisionTiming'],
    ['<imprecisionMap.dynamics><distribution.uniform date="0.0"', 'pickImprecisionDynamics'],
  ] as const
).reduce<XmlText>((mpm, [anchor, id]) => withId(mpm, anchor, id), allMaps('all_maps'));

/** The corpus's only pedal curve that is not the last of its map, and so not inert (§7.14). */
const MOVEMENT = withId(
  allMaps('movement'),
  '<movement xmlns="http://www.cemfi.de/mpm/ns/1.0" date="0.0"',
  'pickMovement',
);

/** Named levels throughout, and a `<tempo>` transition whose endpoints resolve to one value. */
const COMPREHENSIVE = reference('comprehensive');

/**
 * The same document with its `<tempoMap>`'s style switch given an id.
 *
 * A `<style>` is the ordinary caller mistake this error exists for: it sits in the map beside
 * the instructions, it carries a `@date`, and nothing about it looks unselectable.
 */
const WITH_STYLE_ID = withId(
  COMPREHENSIVE,
  '<tempoMap><style date="0.0" name.ref="MEI export"',
  'sty',
);

/** Four `<ornament>`s that already carry ids — the corpus's only selectable ornaments. */
const ORNAMENTATION = allMaps('ornamentation');

/** The same, with its lone `<tempo>` given an id so the ornament dimensions can be background. */
const ORNAMENTATION_TEMPO = withId(ORNAMENTATION, '<tempo date="0.0"', 'pickTempo');

/**
 * The one shape the corpus does not have: an `imprecisionMap.toneduration`.
 *
 * `grep -rl 'imprecisionMap.toneduration' tests/integration/fixtures/` is empty, so
 * `imprecisionDuration` would otherwise never reach `spotlightMpm` at all. The sibling timing
 * map is what gives the case a background to damp.
 */
const TONEDURATION = ('<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
  '<performance name="P" pulsesPerQuarter="720"><global><header/><dated>' +
  '<imprecisionMap.toneduration>' +
  '<distribution.uniform xml:id="pickImprecisionDuration" date="0.0" limit.lower="-8.0" limit.upper="8.0"/>' +
  '</imprecisionMap.toneduration>' +
  '<imprecisionMap.timing>' +
  '<distribution.uniform date="0.0" limit.lower="-5.0" limit.upper="5.0"/>' +
  '</imprecisionMap.timing>' +
  '</dated></global></performance></mpm>') as XmlText;

const spotlight = (mpm: XmlText, ids: readonly string[], attenuation = 0.5) =>
  spotlightMpm(mpm, { ids, attenuation });

/** The whole serialized start tag of the element carrying `id`, attributes and spelling intact. */
function startTagAt(mpm: XmlText, id: string): string {
  const tag = new RegExp(`<[^<>]*xml:id="${id}"[^<>]*>`).exec(mpm)?.[0];
  // Throws rather than returning null, for `withId`'s reason: a silent miss would turn every
  // assertion built on it into a comparison of two empty strings.
  if (tag === undefined) throw new Error(`no element carrying xml:id="${id}" in the output`);
  return tag;
}

/** The text of one attribute on that element, as the document spells it. */
function attributeAt(mpm: XmlText, id: string, name: string): string {
  const pattern = new RegExp(`\\s${name.replaceAll('.', '\\.')}="([^"]*)"`);
  const value = pattern.exec(startTagAt(mpm, id))?.[1];
  if (value === undefined) throw new Error(`element xml:id="${id}" carries no @${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// What a selection spares (D-I's table, end to end)
// ---------------------------------------------------------------------------

/**
 * One row per selectable element type, each naming a document, an id in it, and what D-I says
 * that id spares. The union of the spared sets is closed against `EXPRESSION_DIMENSIONS` below.
 */
const TABLE: readonly [XmlText, string, readonly ExpressionDimension[]][] = [
  [ALL_MAPS, 'pickTempo', ['tempo', 'tempoShape']],
  [ALL_MAPS, 'pickDynamics', ['dynamics', 'dynamicsShape']],
  [ALL_MAPS, 'pickRubato', ['rubato']],
  [ALL_MAPS, 'pickArticulation', ['articulation']],
  [ALL_MAPS, 'pickAccentuation', ['accentuation']],
  [ALL_MAPS, 'pickAsynchrony', ['asynchrony']],
  [ALL_MAPS, 'pickImprecisionTiming', ['imprecisionTiming']],
  [ALL_MAPS, 'pickImprecisionDynamics', ['imprecisionDynamics']],
  [MOVEMENT, 'pickMovement', ['pedalShape']],
  [TONEDURATION, 'pickImprecisionDuration', ['imprecisionDuration']],
  // The one row where D-I's selection vocabulary and the registry's write vocabulary
  // deliberately disagree: an `<ornament>` carries none of these attributes itself — they live
  // on the `<temporalSpread>`/`<dynamicsGradient>` children of the def it names.
  [ORNAMENTATION, 'orn1', ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics']],
];

describe('spotlightMpm: a selection spares its dimensions and damps the rest', () => {
  it.each(TABLE)('%# spares %s → %s and holds it at 1', (mpm, id, spared) => {
    const result = spotlight(mpm, [id]);
    expect(result.spared).toEqual(spared);
    for (const dimension of EXPRESSION_DIMENSIONS)
      expect(result.report.appliedFactors[dimension], dimension).toBe(
        spared.includes(dimension) ? 1 : 0.5,
      );
  });

  it('covers every dimension — the table cannot silently shrink or fall behind the set', () => {
    // Without this, adding a sixteenth dimension, or a row quietly ceasing to spare what it
    // used to, leaves the facade's coverage smaller and the suite green.
    const covered = new Set(TABLE.flatMap(([, , spared]) => spared));
    expect([...EXPRESSION_DIMENSIONS].filter((dimension) => !covered.has(dimension))).toEqual([]);
  });

  it('reports what each id resolved to, in first-mention order', () => {
    const { resolvedIds } = spotlight(ALL_MAPS, ['pickDynamics', 'pickAsynchrony']);
    expect(resolvedIds).toEqual([
      {
        id: 'pickDynamics',
        element: 'dynamics',
        dimensions: ['dynamics', 'dynamicsShape'],
      },
      { id: 'pickAsynchrony', element: 'asynchrony', dimensions: ['asynchrony'] },
    ]);
  });

  it('unions several selections and keeps the spared list in registry order', () => {
    const { spared } = spotlight(ALL_MAPS, ['pickAsynchrony', 'pickTempo', 'pickRubato']);
    expect(spared).toEqual(['tempo', 'tempoShape', 'rubato', 'asynchrony']);
  });

  it('damps everything the selection does not cover, and only that', () => {
    const { report } = spotlight(ALL_MAPS, ['pickTempo']);
    const dimensions = soleReport(report).dimensions;
    expect(dimensions.tempo.state).toBe('skipped'); // A2's identity short-circuit: not walked
    expect(dimensions.tempoShape.state).toBe('skipped');
    expect(report.totalWrites).toBeGreaterThan(0);
    for (const dimension of ['dynamics', 'rubato', 'articulation', 'asynchrony'] as const)
      expect(dimensions[dimension].writes, dimension).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The exact-byte claim, in both directions
// ---------------------------------------------------------------------------

describe('spotlightMpm: the spotlit instruction does not move while the background does', () => {
  /*
   * `all_maps.mpm` is the fixture that makes this symmetric: its tempo pair
   * (`bpm="120" transition.to="90" meanTempoAt="0.5"`) and its dynamics pair
   * (`volume="80" transition.to="110"`) are both NUMERIC, so both are writable under `gesture`
   * scope and each can play foreground to the other's background.
   */
  it('a spotlit tempo keeps every one of its attributes byte for byte', () => {
    // The whole start tag, not a chosen few of its attributes: the element carries five
    // (`date`, `bpm`, `transition.to`, `beatLength`, `meanTempoAt`) and "every one" has to mean
    // every one, including the two no registry row writes. Compared against the same tag in the
    // canonical baseline, which is what A2 makes the reference for any byte claim.
    const { mpm } = spotlight(ALL_MAPS, ['pickTempo']);
    expect(startTagAt(mpm, 'pickTempo')).toBe(startTagAt(canonicalMpm(ALL_MAPS), 'pickTempo'));
    expect(attributeAt(mpm, 'pickTempo', 'bpm')).toBe('120');
    expect(attributeAt(mpm, 'pickTempo', 'transition.to')).toBe('90');
    expect(attributeAt(mpm, 'pickTempo', 'meanTempoAt')).toBe('0.5');
  });

  it('…while the unselected dynamics gesture contracts toward its own geometric mean', () => {
    const { mpm } = spotlight(ALL_MAPS, ['pickTempo']);
    const volume = Number(attributeAt(mpm, 'pickDynamics', 'volume'));
    const to = Number(attributeAt(mpm, 'pickDynamics', 'transition.to'));
    // 80 → 110 attenuated by 0.5 around √(80·110) = 93.8: the endpoints move toward the mean
    // from both sides, and the mean itself — the passage's level — stays put (§1.3/A7).
    expect(volume).toBeGreaterThan(80);
    expect(to).toBeLessThan(110);
    expect(Math.sqrt(volume * to)).toBeCloseTo(Math.sqrt(80 * 110), 10);
  });

  it('and the same document with the roles swapped swaps the outcome', () => {
    const { mpm } = spotlight(ALL_MAPS, ['pickDynamics']);
    expect(startTagAt(mpm, 'pickDynamics')).toBe(
      startTagAt(canonicalMpm(ALL_MAPS), 'pickDynamics'),
    );
    expect(Number(attributeAt(mpm, 'pickTempo', 'bpm'))).toBeLessThan(120);
    expect(Number(attributeAt(mpm, 'pickTempo', 'transition.to'))).toBeGreaterThan(90);
  });

  it('a spotlit <movement> spares pedalShape, which is a live dimension since W2 (A9)', () => {
    // D-G excluded the whole `<movement>` element until the panel's twin-of-dynamics argument
    // carried the curve parameters back in. Without that, this selection would derive an empty
    // spare set and be the prototype's flatten-everything.
    const spotlit = spotlight(MOVEMENT, ['pickMovement']);
    expect(spotlit.spared).toEqual(['pedalShape']);
    expect(startTagAt(spotlit.mpm, 'pickMovement')).toBe(
      startTagAt(canonicalMpm(MOVEMENT), 'pickMovement'),
    );
    expect(attributeAt(spotlit.mpm, 'pickMovement', 'curvature')).toBe('0.4');

    const damped = spotlightMpm(MOVEMENT, { ids: ['pickMovement'], attenuation: 1 });
    expect(damped.mpm).toBe(canonicalMpm(MOVEMENT));
  });

  it('a spotlit <ornament> spares the three dimensions that live on the def it names', () => {
    // The asymmetric row: the attributes held at 1 are on `<temporalSpread>` and
    // `<dynamicsGradient>` inside `<ornamentDef>`, an element away from the one selected.
    const { mpm, resolvedIds } = spotlight(ORNAMENTATION, ['orn1']);
    expect(resolvedIds).toEqual([
      {
        id: 'orn1',
        element: 'ornament',
        dimensions: ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics'],
      },
    ]);
    expect(mpm).toContain('frame.start="-22.0" frameLength="44.0"');
    expect(mpm).toContain('transition.from="-1.0" transition.to="1.0"');
  });

  it('…and spotlighting its <tempo> instead damps all three, an element away', () => {
    // The de-vacuizing half. Without it the row above would be satisfied by an engine that
    // never reached an ornament def at all, since `ornamentation.mpm`'s only other map is a
    // lone constant tempo and the spared run writes nothing.
    const { mpm, report } = spotlight(ORNAMENTATION_TEMPO, ['pickTempo']);
    const dimensions = soleReport(report).dimensions;
    for (const dimension of ['ornamentSpread', 'ornamentSpacing', 'ornamentDynamics'] as const)
      expect(dimensions[dimension].writes, dimension).toBeGreaterThan(0);
    // frame (−22, 44) halves, the spacing exponent 2.0 → √2, the gradient ±1.0 → ±0.5.
    expect(mpm).toContain('frame.start="-11" frameLength="22"');
    expect(mpm).toContain('intensity="1.4142135623730951"');
    expect(mpm).toContain('transition.from="-0.5" transition.to="0.5"');
  });

  it('a spotlit toneduration distribution keeps its widths while its timing sibling narrows', () => {
    const { mpm } = spotlight(TONEDURATION, ['pickImprecisionDuration']);
    expect(startTagAt(mpm, 'pickImprecisionDuration')).toBe(
      startTagAt(canonicalMpm(TONEDURATION), 'pickImprecisionDuration'),
    );
    expect(mpm).toContain('limit.lower="-8.0" limit.upper="8.0"');
    expect(mpm).toContain('limit.lower="-2.5" limit.upper="2.5"');
  });
});

// ---------------------------------------------------------------------------
// A7 — level dimensions on a piecewise-constant map
// ---------------------------------------------------------------------------

describe('spotlightMpm: gesture scope has nothing to shrink on a constant map (A7)', () => {
  it('reports the level dimensions inert rather than claiming them transformed', () => {
    // `comprehensive.mpm` is the dominant corpus shape: every level is a named def, so under
    // `gesture` there is no writable numeric pair, and D-C forbids rewriting a name as a
    // number. Spotlighting an articulation leaves the level dimensions attenuated on paper and
    // idle in fact — which the report has to say, or a caller sampling spotlights would count
    // this as a tempo transform that happened to change nothing.
    const { report } = spotlight(COMPREHENSIVE, ['n4']);
    const dimensions = soleReport(report).dimensions;
    expect(dimensions.tempo.state).toBe('inert');
    expect(dimensions.tempo.writes).toBe(0);
    expect(dimensions.tempo.sitesInert).toBeGreaterThan(0);
    expect(soleReport(report).notes.some((note) => note.kind === 'constant-instruction')).toBe(
      true,
    );
  });

  it('leaves the whole document untouched when every dimension it damps is inert', () => {
    // `tempo.mpm` is nothing but three constant named tempi, so a spotlight on one of them has
    // no background to damp at all. R4's contract answers it exactly.
    const { mpm, report, spared } = spotlight(reference('tempo'), ['t2']);
    expect(spared).toEqual(['tempo', 'tempoShape']);
    expect(report.totalWrites).toBe(0);
    expect(mpm).toBe(canonicalMpm(reference('tempo')));
  });
});

// ---------------------------------------------------------------------------
// The two identities
// ---------------------------------------------------------------------------

describe('spotlightMpm: the identity cases', () => {
  it('an empty selection is the identity, never total suppression (D-I)', () => {
    // The prototype's worst defect: `bringOut` with nothing selected damped every field and
    // returned a flattened performance as a successful spotlight.
    const { mpm, report, spared, resolvedIds } = spotlight(ALL_MAPS, [], 0.1);
    expect(mpm).toBe(canonicalMpm(ALL_MAPS));
    expect(report.totalWrites).toBe(0);
    expect(spared).toEqual([]);
    expect(resolvedIds).toEqual([]);
    for (const dimension of EXPRESSION_DIMENSIONS)
      expect(report.appliedFactors[dimension], dimension).toBe(1);
  });

  it('an attenuation of 1 is the identity, whatever is selected', () => {
    const { mpm, report } = spotlightMpm(ALL_MAPS, { ids: ['pickTempo'], attenuation: 1 });
    expect(mpm).toBe(canonicalMpm(ALL_MAPS));
    expect(report.totalWrites).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The error surface
// ---------------------------------------------------------------------------

describe('spotlightMpm: SelectionNotFoundError, and never a partial run', () => {
  it('rejects an id nothing in the document carries', () => {
    expect(() => spotlight(ALL_MAPS, ['pickTempo', 'ghost'])).toThrow(SelectionNotFoundError);
    expect(() => spotlight(ALL_MAPS, ['ghost'])).toThrow(/unresolved/);
  });

  it('rejects an id on an element type that governs no dimension', () => {
    expect(() => spotlight(WITH_STYLE_ID, ['sty'])).toThrow(SelectionNotFoundError);
    expect(() => spotlight(WITH_STYLE_ID, ['sty'])).toThrow(/unmappable/);
    expect(() => spotlight(WITH_STYLE_ID, ['sty'])).toThrow(/<style>/);
  });

  it('lists every offender of both kinds in one throw', () => {
    const thrown = (() => {
      try {
        spotlight(WITH_STYLE_ID, ['t2', 'ghost', 'sty', 'phantom']);
        return null;
      } catch (error) {
        return error as Error;
      }
    })();
    expect(thrown).toBeInstanceOf(SelectionNotFoundError);
    for (const offender of ['ghost', 'sty', 'phantom'])
      expect(thrown?.message, offender).toContain(offender);
    expect(thrown?.message).toMatch(/3 of the 4 selected ids/);
  });

  it('refuses a run that had real writes to make, rather than half-applying it', () => {
    // The earlier form of this test compared a module-level `const` string against itself, which
    // is `Object.is(s, s)` and would have passed even if spotlightMpm had rewritten the whole
    // document before throwing. What gives the claim content is the same selection minus the
    // bad id: it writes, so the refused run is demonstrably one that would have written too.
    expect(() => spotlight(ALL_MAPS, ['pickTempo', 'ghost'])).toThrow(SelectionNotFoundError);

    const wouldHaveRun = spotlight(ALL_MAPS, ['pickTempo']);
    expect(wouldHaveRun.report.totalWrites).toBeGreaterThan(0);
    expect(wouldHaveRun.mpm).not.toBe(canonicalMpm(ALL_MAPS));
  });

  it('calls a score id unresolved rather than unmappable, because an MPM has no notes', () => {
    // The realistic version of a stale selection: a UI holding note ids from the MSM. There is
    // no `<note>` in an MPM at all, so the id resolves to nothing — which is a different fix
    // for the caller than "this element type is not selectable".
    const scoreId = readFileSync(join(FIXTURES, 'reference', 'comprehensive.msm'), 'utf-8').match(
      /xml:id="(n\d+)"/,
    )?.[1];
    expect(scoreId, 'the MSM fixture carries a note id to borrow').toBeDefined();
    expect(() => spotlight(ALL_MAPS, [scoreId as string])).toThrow(/unresolved/);
  });

  it('is a MeicoError, so a caller catching the root catches it', () => {
    expect(() => spotlight(ALL_MAPS, ['ghost'])).toThrow(MeicoError);
  });
});

describe('spotlightMpm: the option surface', () => {
  // Each row pins the message as well as the class. A rejection that says only "InvalidOption"
  // sends the caller back to the docs; the two branches here have different remedies — one is
  // "pick a number in the interval", the other "you passed the wrong kind of thing" — and the
  // wording is what distinguishes them.
  it.each<[string, unknown, RegExp]>([
    ['zero', 0, /\(0,1\]/],
    ['negative', -0.5, /\(0,1\]/],
    ['above 1', 1.5, /\(0,1\]/],
    ['NaN', NaN, /finite number in \(0,1\]/],
    ['Infinity', Infinity, /finite number in \(0,1\]/],
    ['missing', undefined, /required/],
    ['a string', '0.5', /finite number/],
  ])(
    'rejects an attenuation that is %s, and says what it wanted',
    (_why, attenuation, expected) => {
      const call = () =>
        spotlightMpm(ALL_MAPS, { ids: [], attenuation } as unknown as SpotlightOptions);
      expect(call).toThrow(InvalidOptionError);
      expect(call).toThrow(expected);
    },
  );

  it('explains why 0 is excluded rather than only rejecting it', () => {
    expect(() => spotlightMpm(ALL_MAPS, { ids: [], attenuation: 0 })).toThrow(
      /collapse every transition pair/,
    );
  });

  it.each<[string, unknown]>([
    ['not an array', 'pickTempo'],
    ['an array of non-strings', [1, 2]],
    ['missing', undefined],
  ])('rejects ids that are %s', (_why, ids) => {
    const call = () =>
      spotlightMpm(ALL_MAPS, { ids, attenuation: 0.5 } as unknown as SpotlightOptions);
    expect(call).toThrow(InvalidOptionError);
    expect(call).toThrow(/array of xml:id strings/);
  });

  it('rejects the options bag itself when it is not an object', () => {
    expect(() => spotlightMpm(ALL_MAPS, null as unknown as SpotlightOptions)).toThrow(
      InvalidOptionError,
    );
  });

  it('validates options before it parses, so a bad option outranks a bad document', () => {
    expect(() => spotlightMpm('<not-mpm/>' as XmlText, { ids: [], attenuation: 2 })).toThrow(
      InvalidOptionError,
    );
  });

  it('rejects a document that is not a well-formed MPM', () => {
    expect(() => spotlightMpm('<mpm' as XmlText, { ids: [], attenuation: 0.5 })).toThrow(
      ParseError,
    );
    expect(() => spotlightMpm('<msm/>' as XmlText, { ids: [], attenuation: 0.5 })).toThrow(
      ParseError,
    );
  });

  it('narrows to one performance, and says so when the selector matches nothing', () => {
    expect(
      spotlightMpm(ALL_MAPS, { ids: ['pickTempo'], attenuation: 0.5, performance: 0 }).report
        .performances,
    ).toHaveLength(1);
    expect(() =>
      spotlightMpm(ALL_MAPS, { ids: ['pickTempo'], attenuation: 0.5, performance: 'nope' }),
    ).toThrow(PerformanceNotFoundError);
  });

  it('returns plain data that survives a JSON round trip (RULE F1)', () => {
    const result = spotlight(ALL_MAPS, ['pickTempo', 'pickRubato']);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(structuredClone(result)).toEqual(result);
  });

  it("copies resolvedIds out of the resolver, so a caller cannot edit D-I's own table", () => {
    // CHARTER's public-API rule, and unpinned until now: replacing the facade's copy with
    // `resolvedIds: selection.resolved` left the whole suite green. It matters more than the
    // usual defensive copy, because `dimensions` comes straight out of the module-level
    // TYPE_DIMENSIONS map — a caller holding the result as `unknown[]` can push into what the
    // type calls readonly, and would be editing the mapping table for the rest of the process.
    const first = spotlight(ALL_MAPS, ['pickTempo']);
    const resolved = (run: {
      readonly resolvedIds: readonly { readonly dimensions: readonly ExpressionDimension[] }[];
    }) => elementAt(run.resolvedIds, 0, 'the ids this spotlight resolved');
    (resolved(first).dimensions as ExpressionDimension[]).push('rubato');

    const second = spotlight(ALL_MAPS, ['pickTempo']);
    expect(resolved(second).dimensions).toEqual(['tempo', 'tempoShape']);
    expect(second.spared).toEqual(['tempo', 'tempoShape']);
  });
});

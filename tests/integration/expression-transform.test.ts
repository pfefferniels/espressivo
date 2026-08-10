/**
 * The claims about {@link exaggerateMpm} that only a render can settle.
 *
 * **R5a structural invariance** is the universal half: the transform writes no `@date`, adds
 * or removes no element, and adds or removes no attribute. Only attribute *values* change.
 * Every fixture × every factor record is swept for it, at the document level, where a
 * violation is a diff of two strings rather than a note that landed a bar late.
 *
 * **R5b symbolic invariance** is the half mlign consumes: performing an exaggerated MPM
 * against the same MSM yields the same notes — same ids, same symbolic dates, same durations,
 * same pitches — and differs only in what a performance is *for*. It does **not** hold
 * universally, and the exception is pinned rather than excluded: see "MPM v3 note-generating
 * ornaments". R5 was adopted from mlign-57 before the v3 ornamentation program landed, and v3
 * introduced a renderer pass that *creates* notes whose symbolic geometry is derived from the
 * attributes two dimensions scale.
 *
 * Every invariance case carries an anti-vacuity guard. A document the engine writes nothing
 * into satisfies both halves trivially, so each case that claims invariance also asserts the
 * run moved something — which is why the three v3 tick-frame fixtures are enriched below
 * before being swept.
 *
 * **A14 expected direction** is the panel's answer to a gap the property suite cannot close
 * (DESIGN §1.1): P1–P5 hold for *any* monotone bijection with the right neutral, so they
 * validate no registry choice. What validates one is whether the effect moves the way the
 * dimension's name promises. All fifteen dimensions get a direction test; the table above the
 * A14 block records which observation level each uses and why.
 *
 * ## Seedless-safe assertions
 *
 * The charter forbids byte-comparing imprecision output: a distribution with no `@seed`
 * re-draws per render, and a polyphonic part reaches `shakePolyphonicPart`'s keeper pick,
 * which is a bare `Math.random()`. Neither condition holds anywhere in this file — the one
 * fixture carrying imprecision maps (`all_maps`) seeds both of its distributions explicitly
 * and has a single part — but the three imprecision dimensions are still asserted at the
 * **written-attribute** level rather than the rendered one, because their contract is about
 * the width the document declares and nothing here should depend on a render staying
 * reproducible.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  EXPRESSION_DIMENSIONS,
  canonicalMpm,
  exaggerateMpm,
  performMsmToData,
  type ExaggerationFactors,
  type ExpressionDimension,
  type PerformanceData,
  type PerformedNote,
  type XmlText,
} from '../../src/api/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (folder: string, name: string) =>
  readFileSync(join(HERE, folder, name), 'utf-8') as XmlText;

const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** A hand-built one-performance document, for the shapes no fixture in the corpus has. */
function document(dated: string, header = ''): XmlText {
  return (`<mpm xmlns="${MPM_NS}"><performance name="P" pulsesPerQuarter="720">` +
    `<global><header>${header}</header><dated>${dated}</dated></global>` +
    `</performance></mpm>`) as XmlText;
}

/**
 * The two ornament dimensions that lay notes out **in time inside a frame** — as opposed to
 * `ornamentDynamics`, which only shades them.
 *
 * They are named as a set because the divergence pinned at the bottom of the R5 section is a
 * property of that role, not of either attribute: on an MPM v3 ornament that GENERATES notes,
 * both the frame's width and its spacing curve decide where those notes land, and on a frame
 * that resolves into ticks that landing is a symbolic date.
 */
const ORNAMENT_TIMING_DIMENSIONS: readonly ExpressionDimension[] = [
  'ornamentSpread',
  'ornamentSpacing',
];

interface Pair {
  readonly name: string;
  readonly msm: XmlText;
  readonly mpm: XmlText;
  /** Dimensions this pair is NOT symbolically invariant under; see the pin below. */
  readonly symbolicallyMoving: readonly ExpressionDimension[];
}

function pair(folder: string, name: string, mpm?: XmlText): Pair {
  return {
    name,
    msm: read(folder, `${name}.msm`),
    mpm: mpm ?? read(folder, `${name}.mpm`),
    symbolicallyMoving: [],
  };
}

/**
 * A v3 tick-frame fixture, with two non-ornament maps grafted on.
 *
 * Without them the R5b sweep on these three would be VACUOUS: removing `ornamentSpread` and
 * `ornamentSpacing` from the factor record leaves the fixture with no site any dimension
 * writes, so the "invariance" assertion would render the canonical baseline twice and compare
 * it to itself. The graft is what gives the claim content — the reduced record now writes two
 * tempo instructions and an articulation def, i.e. a real transform whose symbolic invariance
 * is worth asserting on a document whose ornament generates notes.
 *
 * The fixtures themselves stay untouched (charter invariant 2): the maps are injected into the
 * text at read time, at three anchors every one of the three shares. `absoluteDelay` is in the
 * graft on purpose — it is a TICK-domain timing lever, so it is the strongest available test
 * that a non-ornament dimension leaves symbolic dates alone (it moves `date.perf`, not `@date`).
 */
const ARTICULATION_GRAFT_STYLE =
  '<articulationStyles><styleDef name="art">' +
  '<articulationDef name="soft" relativeVelocity="0.7" absoluteDelay="60.0"/>' +
  '</styleDef></articulationStyles>';
const ARTICULATION_GRAFT_MAP =
  '<articulationMap><style date="0.0" name.ref="art"/>' +
  '<articulation date="0.0" name.ref="soft"/></articulationMap>';

function generatingV3(name: string): Pair {
  const grafted = read('fixtures-v3', `${name}.mpm`)
    .replace('<ornamentationStyles>', `${ARTICULATION_GRAFT_STYLE}<ornamentationStyles>`)
    .replace('</tempoMap>', '<tempo date="1440.0" bpm="180" beatLength="0.25"/></tempoMap>')
    .replace('</ornamentationMap>', `</ornamentationMap>${ARTICULATION_GRAFT_MAP}`) as XmlText;
  return { ...pair('fixtures-v3', name, grafted), symbolicallyMoving: ORNAMENT_TIMING_DIMENSIONS };
}

/** Real Java-generated pairs, chosen for the dimensions they exercise between them. */
const PAIRS: readonly Pair[] = [
  // Level pairs on both sides: tempo defs (Andante/Adagio) and dynamics defs (p/ff/pp), with
  // transitions — the shape §1.3's `global` scope exists for.
  pair('fixtures/reference', 'tempo_dynamics_spans'),
  // Eight articulation defs, including the D-B-lopsided `stacc`.
  pair('fixtures/reference', 'articulations'),
  // Three maps over two parts — the multi-part path through the same code.
  pair('fixtures/reference', 'multi_part'),
  pair('fixtures/reference', 'comprehensive'),
  // The asynchrony map alone, so its offsets are the only millisecond mover.
  pair('fixtures/all-maps-reference', 'asynchrony'),
  pair('fixtures/all-maps-reference', 'metrical_accentuation'),
  pair('fixtures/all-maps-reference', 'rubato'),
  // MPM v2 ornamentation: tick-domain frames, but a v2 ornament SHIFTS notes the score
  // already has instead of generating new ones, so it is fully invariant.
  pair('fixtures/all-maps-reference', 'ornamentation'),
  pair('fixtures/all-maps-reference', 'movement'),
  // Nine maps at once, imprecision included: the widest single document there is. It stays in
  // the "really changed" control because its render IS reproducible — both distributions carry
  // `seed="42"` and its single part never reaches `shakePolyphonicPart`'s keeper pick.
  pair('fixtures/all-maps-reference', 'all_maps'),
  // MPM v3 with a MILLISECOND frame: its ornament generates notes too, and it IS invariant,
  // because a millisecond frame is folded in after the tempo map and never reaches a date.
  pair('fixtures-v3', 'spread-ms'),
  pair('fixtures-v3', 'v2-passthrough'),
  // MPM v3 with tick-resolved frames — the exception, narrowed to two dimensions.
  generatingV3('turn-atstart'),
  generatingV3('turn-atend'),
  generatingV3('trill-repetitions'),
];

function uniformFactors(s: number): ExaggerationFactors {
  return Object.fromEntries(EXPRESSION_DIMENSIONS.map((dimension) => [dimension, s]));
}

function without(
  factors: ExaggerationFactors,
  dimensions: readonly ExpressionDimension[],
): ExaggerationFactors {
  return Object.fromEntries(
    Object.entries(factors).filter(([key]) => !dimensions.includes(key as ExpressionDimension)),
  );
}

/**
 * The factor records every pair is swept with, from mild to well past any musical use.
 *
 * All are non-negative because several dimensions' scale spaces range over a half-line, where
 * a negative `s` leaves the domain and P3 fails — `resolveFactors` rejects those, and the
 * error-surface suite is where that belongs. `0` and `6` are here to make the sweep adversarial
 * rather than representative: `0` drives every dimension onto its closed-form neutral (the one
 * value §1 forbids computing as `0 · T(x)`) and `6` drives the level dimensions into
 * `velocityRange`'s clamp and the rubato window into A6's guard.
 *
 * `everyDimension` is what the anti-vacuity guard keys on. A record naming one dimension may
 * legitimately write nothing — `{tempo: 1.5}` on a document with no tempo map is an honest
 * no-op — but a record naming all fifteen must move something on every fixture here, or the
 * invariance it then claims is a comparison of the baseline with itself.
 */
const FACTOR_RECORDS = [
  {
    label: 'tempo only, 1.5',
    factors: { tempo: 1.5 } as ExaggerationFactors,
    everyDimension: false,
  },
  {
    label: 'dynamics only, 2',
    factors: { dynamics: 2 } as ExaggerationFactors,
    everyDimension: false,
  },
  { label: 'every dimension, 0.25', factors: uniformFactors(0.25), everyDimension: true },
  { label: 'every dimension, 2', factors: uniformFactors(2), everyDimension: true },
  { label: 'every dimension, 6', factors: uniformFactors(6), everyDimension: true },
  {
    label: 'every dimension, 0 (the closed-form neutral)',
    factors: uniformFactors(0),
    everyDimension: true,
  },
] as const;

// ---------------------------------------------------------------------------
// Readings taken off a document and off a rendered performance
// ---------------------------------------------------------------------------

const notesOf = (data: PerformanceData): readonly PerformedNote[] =>
  data.parts.flatMap((part) => part.notes);

/** Every `@date`-shaped attribute value in a document, in order. */
const datesIn = (mpm: XmlText): readonly string[] => mpm.match(/\sdate(?:\.end)?="[^"]*"/g) ?? [];

/**
 * The document with every attribute VALUE blanked: its elements, its attribute names, and
 * their order — everything R5a says the transform may not touch.
 *
 * Blanking rather than counting is deliberate. A count would pass a transform that deleted one
 * attribute and created another; this compares the whole skeleton, so any add, remove, rename
 * or reorder shows up as a string diff.
 */
const skeletonOf = (mpm: XmlText): string => mpm.replace(/="[^"]*"/g, '=""');

/**
 * A note's identity and its place in the score — everything R5b promises is untouched.
 *
 * Generated ids are canonicalised because an MPM v3 ornament draws a fresh `meico_<uuid>` per
 * render (`ornamentation-v3.test.ts`'s convention): two renders of the SAME document already
 * disagree on those bytes, so comparing them raw would fail R5b for a reason that has nothing
 * to do with the transform. What the canonicalisation preserves is exactly what matters — how
 * many generated notes there are and where each sits in the walk.
 */
function symbolicShape(data: PerformanceData): unknown {
  let generated = 0;
  const ids = new Map<string, string>();
  const canonical = (id: string | null): string | null => {
    if (id === null || !/meico_[0-9a-f-]{36}$/.test(id)) return id;
    if (!ids.has(id)) ids.set(id, `generated-${(generated += 1)}`);
    return ids.get(id)!;
  };

  return {
    ppq: data.ppq,
    parts: data.parts.map((part) => ({
      index: part.index,
      name: part.name,
      midiChannel: part.midiChannel,
      notes: part.notes.map((note) => ({
        id: canonical(note.id),
        date: note.date,
        duration: note.duration,
        pitch: note.pitch,
      })),
    })),
  };
}

/**
 * Every rendered quantity a performance is *for*: the half R5b expects to move.
 *
 * The control-change streams are in here rather than only the notes because one dimension —
 * `pedalShape` — renders exclusively into them. Without it the `movement` fixture would
 * "prove" that a run reporting writes changed nothing.
 */
function renderedShape(data: PerformanceData): unknown {
  return data.parts.map((part) => ({
    notes: part.notes.map((note) => [note.velocity, note.milliseconds.date, note.milliseconds.end]),
    controlChanges: part.controlChanges.map((stream) =>
      stream.points.map((point) => [point.milliseconds, point.value]),
    ),
  }));
}

const exaggerate = (mpm: XmlText, factors: ExaggerationFactors) => exaggerateMpm(mpm, { factors });

const performWith = (pairUnderTest: Pair, mpm: XmlText): PerformanceData =>
  performMsmToData({ msm: pairUnderTest.msm, mpm });

// ---------------------------------------------------------------------------
// R5a — the universal, document-level half
// ---------------------------------------------------------------------------

describe('R5a: the transform changes attribute values and nothing else', () => {
  it.each(PAIRS)('$name keeps its dates and its whole skeleton at every factor', (p) => {
    const canonical = canonicalMpm(p.mpm);
    const canonicalDates = datesIn(canonical);
    const canonicalSkeleton = skeletonOf(canonical);
    expect(canonicalDates.length).toBeGreaterThan(0);

    for (const { label, factors, everyDimension } of FACTOR_RECORDS) {
      const { mpm, report } = exaggerate(p.mpm, factors);
      // Anti-vacuity: an all-fifteen record that wrote nothing would make the two assertions
      // below a comparison of the baseline with itself.
      if (everyDimension) expect(report.totalWrites, label).toBeGreaterThan(0);
      expect(datesIn(mpm), label).toEqual(canonicalDates);
      expect(skeletonOf(mpm), label).toBe(canonicalSkeleton);
    }
  });
});

// ---------------------------------------------------------------------------
// R5b — the render-level half
// ---------------------------------------------------------------------------

describe('R5b: exaggeration is symbolically invariant end to end', () => {
  describe.each(PAIRS)('$name', (p) => {
    const baseline = performWith(p, p.mpm);

    it.each(FACTOR_RECORDS)(
      'keeps every note id, symbolic date, duration and pitch at $label',
      ({ factors, everyDimension }) => {
        const reduced = without(factors, p.symbolicallyMoving);
        const { mpm, report } = exaggerate(p.mpm, reduced);
        if (everyDimension)
          expect(
            report.totalWrites,
            'the invariance case must have moved something',
          ).toBeGreaterThan(0);
        expect(symbolicShape(performWith(p, mpm))).toEqual(symbolicShape(baseline));
      },
    );
  });

  /**
   * The anti-vacuity half at the render level: the report claims writes, and the render moves,
   * in the quantities R5b explicitly leaves free.
   */
  describe.each(PAIRS)('$name really changed', (p) => {
    it('moves milliseconds, velocities or control changes where the report says it wrote', () => {
      const { mpm, report } = exaggerate(p.mpm, uniformFactors(2));
      expect(report.totalWrites).toBeGreaterThan(0);
      expect(renderedShape(performWith(p, mpm))).not.toEqual(renderedShape(performWith(p, p.mpm)));
    });
  });

  /**
   * **The exception to R5b, pinned deliberately rather than excluded quietly.**
   *
   * MPM v3 ornamentation is a renderer pass that *generates* notes, and it computes their
   * symbolic `@date` and `@duration` from the `<temporalSpread>` frame — the same frame
   * `ornamentSpread` widens and `ornamentSpacing` reshapes. On `turn-atstart`, whose frame is
   * `frameLength="50%"` of the principal note, doubling the spread lays the turn's four notes
   * across the whole principal instead of half of it, and every one of them lands on a
   * different symbolic date. Nothing in the document was mis-transformed: this engine writes
   * no `@date` here either (R5a above covers these pairs too), and there is no way to both
   * widen the window an ornament's notes occupy and leave those notes where they were.
   *
   * The boundary is exactly two conditions, and each has a control here: the ornament must
   * GENERATE notes (a v2 ornament shifts notes the score already has, through `date.perf`),
   * and its frame must resolve into TICKS (a millisecond frame is folded in after the tempo
   * map, so it moves milliseconds only). `%` resolves into the tick domain, which is why a
   * fixture with no `ticks` suffix anywhere is nonetheless in scope.
   */
  describe('MPM v3 note-generating ornaments: where R5b does not reach', () => {
    const symbolic = (p: Pair, factors: ExaggerationFactors) =>
      symbolicShape(performWith(p, exaggerate(p.mpm, factors).mpm));

    it.each(ORNAMENT_TIMING_DIMENSIONS)(
      '%s moves the generated notes of a tick-resolved v3 frame',
      (dimension) => {
        // The raw fixture, not the grafted pair: the divergence is a property of the ornament.
        const raw = read('fixtures-v3', 'turn-atstart.mpm');
        // `turn-atstart` carries no `@intensity`, so the spacing half needs one to have a site
        // at all — the same frame, the same generated notes, the other lever on them.
        const mpm = (
          dimension === 'ornamentSpacing'
            ? raw.replace('frameLength="50%"', 'frameLength="50%" intensity="2.0"')
            : raw
        ) as XmlText;
        const turn: Pair = { ...pair('fixtures-v3', 'turn-atstart', mpm) };

        const { report } = exaggerate(mpm, { [dimension]: 2 });
        expect(report.totalWrites).toBeGreaterThan(0);
        expect(symbolic(turn, { [dimension]: 2 })).not.toEqual(symbolic(turn, {}));
      },
    );

    it('drives the carved head leftover to a zero-length note at s = 2 (§7.9 cliff)', () => {
      // The concrete shape of the divergence, so a change to it cannot pass unnoticed: the
      // turn's notes double in length and the principal's surviving leftover is carved to
      // nothing. §7.9 predicts exactly this class of outcome and calls the row's P5r `cliff`.
      const turn = pair('fixtures-v3', 'turn-atstart');
      const shapes = (factors: ExaggerationFactors) =>
        notesOf(performWith(turn, exaggerate(turn.mpm, factors).mpm))
          .map((note) => `${note.date}/${note.duration}`)
          .sort();

      expect(shapes({})).toEqual([
        '0/240',
        '1440/720',
        '2160/720',
        '240/240',
        '480/240',
        '720/720',
      ]);
      expect(shapes({ ornamentSpread: 2 })).toEqual([
        '0/480',
        '1440/0',
        '1440/720',
        '2160/720',
        '480/480',
        '960/480',
      ]);
    });

    it.each([
      ['a MILLISECOND v3 frame generates notes and stays invariant', 'fixtures-v3', 'spread-ms'],
      [
        'a v2 tick frame moves no symbolic date, because v2 generates no notes',
        'fixtures/all-maps-reference',
        'ornamentation',
      ],
    ])('control: %s', (_why, folder, name) => {
      const control = pair(folder, name);
      const { report } = exaggerate(control.mpm, uniformFactors(2));
      // BOTH boundary dimensions, not just the frame width: the exception these two cases
      // bound names them jointly, and a regression that made `ornamentSpacing` a no-op here
      // would otherwise leave the control green while it bounded a lever it no longer touched.
      for (const dimension of ORNAMENT_TIMING_DIMENSIONS)
        expect(report.performances[0].dimensions[dimension].writes, dimension).toBeGreaterThan(0);
      expect(symbolic(control, uniformFactors(2))).toEqual(
        symbolicShape(performWith(control, control.mpm)),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// A14 — expected direction, all fifteen dimensions
// ---------------------------------------------------------------------------

/**
 * Assert that a reading grows strictly across the factors, and that it is not growing from an
 * empty sample — a document where the dimension found nothing would report 0 at every factor
 * and satisfy a non-strict comparison.
 */
function assertMonotone(reading: (s: number) => number, factors: readonly number[]): void {
  const values = factors.map(reading);
  expect(values[0], `the reading at s = ${factors[0]} is positive`).toBeGreaterThan(0);
  for (let i = 1; i < values.length; ++i)
    expect(
      values[i],
      `s = ${factors[i]} (${values[i]}) exceeds s = ${factors[i - 1]} (${values[i - 1]})`,
    ).toBeGreaterThan(values[i - 1]);
}

/** The spread of a sample: max − min, the plainest reading of "how far apart". */
const spread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);

/** The largest distance between two renders' note onsets, note for note. */
function onsetDeviation(a: readonly PerformedNote[], b: readonly PerformedNote[]): number {
  return Math.max(...a.map((note, i) => Math.abs(note.milliseconds.date - b[i].milliseconds.date)));
}

/** The largest distance between two renders' velocities, note for note. */
function velocityDeviation(a: readonly PerformedNote[], b: readonly PerformedNote[]): number {
  return Math.max(...a.map((note, i) => Math.abs(note.velocity - b[i].velocity)));
}

/** The widest imprecision limit the document declares, which is what a distribution can draw. */
function widestLimit(mpm: XmlText): number {
  const values = [...mpm.matchAll(/limit\.(?:lower|upper)="([^"]*)"/g)].map((match) =>
    Math.abs(Number(match[1])),
  );
  expect(values.length, 'the fixture declares limits to read').toBeGreaterThan(0);
  return Math.max(...values);
}

describe('A14: the effect moves in the direction the dimension names', () => {
  /*
   * Which observation level each dimension is asserted at, and why. A14's whole point is that
   * a document-level assertion cannot validate a metric choice (DESIGN §1.1) — so `rendered`
   * is used wherever the rendered effect is deterministic and observable, and `written` only
   * where it provably is not.
   *
   * | dimension           | level    | reading                                              |
   * |---------------------|----------|------------------------------------------------------|
   * | tempo               | rendered | ratio of fastest to slowest milliseconds-per-tick    |
   * | tempoShape          | rendered | onset deviation from the s=0 (mean-at-centre) curve  |
   * | dynamics            | rendered | velocity spread across the piece                     |
   * | dynamicsShape       | rendered | velocity deviation from the s=0 (linear) ramp        |
   * | rubato              | rendered | onset deviation from the s=0 (untrimmed) window      |
   * | articulation        | rendered | velocity spread its defs impose                      |
   * | accentuation        | rendered | velocity spread of the metrical pattern              |
   * | ornamentSpread      | rendered | onset deviation of the ornament's generated notes    |
   * | ornamentSpacing     | rendered | same, under the spacing exponent                     |
   * | ornamentDynamics    | rendered | velocity deviation of those notes                    |
   * | asynchrony          | rendered | onset deviation from the s=0 (no-asynchrony) render  |
   * | pedalShape          | rendered | the instant the pedal curve crosses its threshold    |
   * | imprecisionTiming   | written  | widest limit the distribution declares               |
   * | imprecisionDynamics | written  | same                                                 |
   * | imprecisionDuration | written  | same                                                 |
   *
   * The three imprecision rows are `written` because their rendered offset is drawn from a
   * PRNG. `all_maps` happens to seed its distributions, but the charter forbids resting an
   * assertion on that, and the width a distribution declares is the quantity the dimension
   * actually scales — D-F's atomic group, scaled as one.
   *
   * `ornamentSpread` and `ornamentSpacing` use the MILLISECOND-frame fixture deliberately: on
   * a tick-resolved frame their rendered effect is the R5b divergence pinned above, and an
   * onset reading there would be measuring symbolic movement rather than performed movement.
   */

  const tempi = pair('fixtures/reference', 'tempo');
  const spans = pair('fixtures/reference', 'tempo_dynamics_spans');
  const articulations = pair('fixtures/reference', 'articulations');
  const asynchrony = pair('fixtures/all-maps-reference', 'asynchrony');
  const rubato = pair('fixtures/all-maps-reference', 'rubato');
  const movement = pair('fixtures/all-maps-reference', 'movement');
  const ornament = pair('fixtures-v3', 'spread-ms');

  /** A score to render the hand-built documents against: fourteen notes over ten bars. */
  const SCORE = read('fixtures/reference', 'tempo.msm');
  const against = (mpm: XmlText): readonly PerformedNote[] =>
    notesOf(performMsmToData({ msm: SCORE, mpm }));

  // --- the four dimensions with no fixture of their own -------------------------------------

  const TEMPO_SHAPE_DOCUMENT = document(
    '<tempoMap><tempo date="0.0" bpm="60" transition.to="180" meanTempoAt="0.25" beatLength="0.25"/>' +
      '<tempo date="7200.0" bpm="180" beatLength="0.25"/></tempoMap>',
  );
  const DYNAMICS_SHAPE_DOCUMENT = document(
    '<dynamicsMap><dynamics date="0.0" volume="20" transition.to="120" curvature="0.4" protraction="0.5"/>' +
      '<dynamics date="7200.0" volume="120"/></dynamicsMap>',
  );
  // The corpus fixture writes raw TICK values into `@beat`/`@length`, which §7.8 names as a
  // documented real-world no-op — it renders a nearly flat ramp worth 0.004 velocity units. A
  // pattern in BEATS is what makes the accent audible, and therefore what makes a direction
  // claim about it mean anything.
  const ACCENTUATION_DOCUMENT = document(
    '<dynamicsMap><dynamics date="0.0" volume="80"/></dynamicsMap>' +
      '<metricalAccentuationMap><style date="0.0" name.ref="acc"/>' +
      '<accentuationPattern date="0.0" name.ref="4/4" scale="1.0" loop="true" stickToMeasures="true"/>' +
      '</metricalAccentuationMap>',
    '<metricalAccentuationStyles><styleDef name="acc">' +
      '<accentuationPatternDef name="4/4" length="4.0">' +
      '<accentuation beat="1.0" value="12.0"/><accentuation beat="2.0" value="-6.0"/>' +
      '<accentuation beat="3.0" value="6.0"/><accentuation beat="4.0" value="-6.0"/>' +
      '</accentuationPatternDef></styleDef></metricalAccentuationStyles>',
  );
  const IMPRECISION_DURATION_DOCUMENT = document(
    '<imprecisionMap.toneduration>' +
      '<distribution.uniform date="0.0" limit.lower="-20.0" limit.upper="20.0"/>' +
      '</imprecisionMap.toneduration>',
  );

  // --- the readings -------------------------------------------------------------------------

  /** A note renders at its own tempo, so its milliseconds per tick IS the tempo it played at. */
  function tempoContrast(s: number): number {
    const rates = notesOf(performWith(tempi, exaggerate(tempi.mpm, { tempo: s }).mpm))
      .filter((note) => note.duration > 0)
      .map((note) => (note.milliseconds.end - note.milliseconds.date) / note.duration);
    // A ratio rather than a difference, because tempo is a log-space quantity — and dividing
    // by the symbolic duration first is what stops a long note from reading as a slow one.
    return Math.max(...rates) / Math.min(...rates);
  }

  const readings: readonly {
    dimension: ExpressionDimension;
    factors: readonly number[];
    reading: (s: number) => number;
  }[] = [
    { dimension: 'tempo', factors: [0.5, 1, 1.8], reading: (s) => tempoContrast(s) - 1 },
    {
      dimension: 'tempoShape',
      factors: [0.5, 1, 2],
      reading: (s) =>
        onsetDeviation(
          against(exaggerate(TEMPO_SHAPE_DOCUMENT, { tempoShape: s }).mpm),
          against(exaggerate(TEMPO_SHAPE_DOCUMENT, { tempoShape: 0 }).mpm),
        ),
    },
    {
      dimension: 'dynamics',
      factors: [0.25, 0.5, 1, 1.6],
      reading: (s) =>
        spread(
          notesOf(performWith(spans, exaggerate(spans.mpm, { dynamics: s }).mpm)).map(
            (note) => note.velocity,
          ),
        ),
    },
    {
      dimension: 'dynamicsShape',
      factors: [0.5, 1, 2],
      reading: (s) =>
        velocityDeviation(
          against(exaggerate(DYNAMICS_SHAPE_DOCUMENT, { dynamicsShape: s }).mpm),
          against(exaggerate(DYNAMICS_SHAPE_DOCUMENT, { dynamicsShape: 0 }).mpm),
        ),
    },
    {
      dimension: 'rubato',
      factors: [0.5, 1, 2],
      reading: (s) =>
        onsetDeviation(
          notesOf(performWith(rubato, exaggerate(rubato.mpm, { rubato: s }).mpm)),
          notesOf(performWith(rubato, exaggerate(rubato.mpm, { rubato: 0 }).mpm)),
        ),
    },
    {
      // Every def in this fixture carries EITHER `@relativeVelocity` or
      // `@absoluteVelocityChange` and none carries both, so §7.7's non-monotone affine pair is
      // out of the picture — which is what makes a monotonicity claim admissible here at all.
      dimension: 'articulation',
      factors: [0.5, 1, 2],
      reading: (s) =>
        spread(
          notesOf(
            performWith(articulations, exaggerate(articulations.mpm, { articulation: s }).mpm),
          ).map((note) => note.velocity),
        ),
    },
    {
      dimension: 'accentuation',
      factors: [0.5, 1, 2],
      reading: (s) =>
        spread(
          against(exaggerate(ACCENTUATION_DOCUMENT, { accentuation: s }).mpm).map(
            (n) => n.velocity,
          ),
        ),
    },
    {
      dimension: 'ornamentSpread',
      factors: [0.5, 1, 2],
      reading: (s) =>
        onsetDeviation(
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentSpread: s }).mpm)),
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentSpread: 0 }).mpm)),
        ),
    },
    {
      dimension: 'ornamentSpacing',
      factors: [0.5, 1, 2],
      reading: (s) =>
        onsetDeviation(
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentSpacing: s }).mpm)),
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentSpacing: 0 }).mpm)),
        ),
    },
    {
      dimension: 'ornamentDynamics',
      factors: [0.5, 1, 2],
      reading: (s) =>
        velocityDeviation(
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentDynamics: s }).mpm)),
          notesOf(performWith(ornament, exaggerate(ornament.mpm, { ornamentDynamics: 0 }).mpm)),
        ),
    },
    {
      dimension: 'asynchrony',
      factors: [0.5, 1, 2],
      reading: (s) =>
        onsetDeviation(
          notesOf(performWith(asynchrony, exaggerate(asynchrony.mpm, { asynchrony: s }).mpm)),
          notesOf(performWith(asynchrony, exaggerate(asynchrony.mpm, { asynchrony: 0 }).mpm)),
        ),
    },
    {
      // §3 admits `pedalShape` on the argument that the curve parameters "move the instant at
      // which the pedal crosses the receiver's on/off threshold", so that instant is the
      // reading. The renderer samples the curve at a fixed value grid and emits the TIME each
      // value is reached, which is why the values are identical across s and the times are not.
      dimension: 'pedalShape',
      factors: [0.5, 1, 2],
      reading: (s) => pedalCrossing(s) - pedalCrossing(0),
    },
    {
      dimension: 'imprecisionTiming',
      factors: [0.5, 1, 2],
      reading: (s) =>
        widestLimit(
          exaggerate(read('fixtures/all-maps-reference', 'imprecision_timing.mpm'), {
            imprecisionTiming: s,
          }).mpm,
        ),
    },
    {
      dimension: 'imprecisionDynamics',
      factors: [0.5, 1, 2],
      reading: (s) =>
        widestLimit(
          exaggerate(read('fixtures/all-maps-reference', 'imprecision_dynamics.mpm'), {
            imprecisionDynamics: s,
          }).mpm,
        ),
    },
    {
      dimension: 'imprecisionDuration',
      factors: [0.5, 1, 2],
      reading: (s) =>
        widestLimit(exaggerate(IMPRECISION_DURATION_DOCUMENT, { imprecisionDuration: s }).mpm),
    },
  ];

  /** The millisecond at which the pedal curve first falls to three quarters of its peak. */
  function pedalCrossing(s: number): number {
    const points = performWith(movement, exaggerate(movement.mpm, { pedalShape: s }).mpm)
      .parts.flatMap((part) => part.controlChanges)
      .flatMap((stream) => stream.points);
    const peak = Math.max(...points.map((point) => point.value));
    const crossing = points.find((point) => point.value <= 0.75 * peak);
    expect(crossing, 'the movement stream crosses its threshold').toBeDefined();
    return crossing!.milliseconds;
  }

  it('covers every dimension DESIGN §3 declares', () => {
    expect(readings.map((row) => row.dimension).sort()).toEqual([...EXPRESSION_DIMENSIONS].sort());
  });

  it.each(readings)('$dimension moves monotonically with s', ({ factors, reading }) => {
    assertMonotone(reading, factors);
  });

  // --- the closed-form neutrals, where s = 0 says something specific -------------------------

  it('tempo: s = 0 writes the center at every site, so the piece plays at one tempo', () => {
    expect(tempoContrast(0)).toBeCloseTo(1, 9);
  });

  it('articulation: s = 0 removes every velocity modifier, so the spread collapses', () => {
    const velocities = notesOf(
      performWith(articulations, exaggerate(articulations.mpm, { articulation: 0 }).mpm),
    ).map((note) => note.velocity);
    expect(spread(velocities)).toBeCloseTo(0, 9);
  });

  it('asynchrony: the onset deviation is exactly proportional to s (§7.12)', () => {
    const deviation = (s: number) =>
      onsetDeviation(
        notesOf(performWith(asynchrony, exaggerate(asynchrony.mpm, { asynchrony: s }).mpm)),
        notesOf(performWith(asynchrony, exaggerate(asynchrony.mpm, { asynchrony: 0 }).mpm)),
      );
    expect(deviation(2)).toBeCloseTo(2 * deviation(1), 6);
  });

  it('dynamics: s = 0 refuses every write rather than flattening the performance', () => {
    // Not the collapse the other dimensions show at 0, and deliberately so. Every level in
    // this document resolves through a shared def, and at s = 0 both endpoints of each
    // transition land on the center — `String(to') === String(volume')`, which is the
    // renderer's exact-float test for a *constant* instruction. Writing that would delete the
    // gesture rather than scale it, so D-I's pair-collapse guard refuses both endpoints, and
    // W2's transitive fixpoint carries the refusal to the defs the pair resolves through.
    const { report, mpm } = exaggerate(spans.mpm, { dynamics: 0 });
    expect(report.totalWrites).toBe(0);
    expect(mpm).toBe(canonicalMpm(spans.mpm));
    expect(
      report.performances[0].notes.filter((note) => note.kind === 'pair-collapse-refused').length,
    ).toBeGreaterThan(0);
  });
});

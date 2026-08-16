/**
 * The imprecision reader — DESIGN.md §5.9. One map, one domain, read into the piecewise
 * constant sequence of LAWS the renderer performs over the timeline.
 *
 * ## The degenerate table is one rule, not six
 *
 * §5.9 tabulates six family/attribute combinations and the law each collapses to. Measured at
 * the provider, all six are consequences of a single mechanism: **`DistributionData`
 * initialises every absent attribute to `null`, the provider assigns it into a `number`-typed
 * field, and JavaScript coerces `null` to 0** in arithmetic and in relational comparison. So
 * an absent parameter is not a missing parameter — it is the parameter 0, and the law follows
 * from the geometry that leaves.
 *
 * That reading is bit-for-bit verified against explicit controls rather than argued:
 *
 * | document | performs, exactly | §5.9's table |
 * |---|---|---|
 * | uniform, both limits absent | `δ₀` | ✓ |
 * | uniform, `limit.upper` absent, `limit.lower="-30"` | `U(−30, 0)` | **not stated** |
 * | gaussian, `limit.upper` absent, `limit.lower="-5"` | truncated to `[−5, 0]` | **not stated** |
 * | gaussian, both limits absent | untruncated `N(0, σ)` | ✓ |
 * | gaussian, `deviation.standard` absent | `δ₀` | ✓ |
 * | triangular, both clips absent | `δ₀` (via a `null` draw — AD-47) | ✓ |
 * | triangular, `clip.upper` absent | `clamp(·, clipLower, 0)` | **not stated** |
 * | triangular, `mode` absent | `mode = 0` | **not stated** |
 * | brownian / compensating, limits absent | `δ₀` | ✓ |
 *
 * The three rows §5.9 does not state are the ones a real document is likelier to reach, and
 * every one of them is a genuine law rather than a collapse. Reading them as `δ₀` would price
 * a performance that audibly displaces notes at zero.
 *
 * ## `null` is δ₀'s route; `NaN` is `⊥`'s (AD-47, AD-42.4)
 *
 * AD-47 settled the clip-less triangular by execution: the draw is a literal `null`, the
 * write-back coerces it (`attValue + null === attValue`), nothing stringifies it, and the
 * performed effect is exactly no imprecision. So the finite guard this module applies must NOT
 * treat an absent attribute as unusable. An UNUSABLE one is a different matter and reaches
 * `⊥`, because the renderer then really does destroy the notes:
 *
 * - `limit.lower="abc"` → `NaN` through every draw → `milliseconds.date="NaN"` → the note
 *   vanishes from the MIDI export (measured end to end).
 * - an EMPTY `distribution.list` → `series[i % 0]` is `series[NaN]` is `undefined` → the same.
 * - `compensatingTriangle` with `degreeOfCorrelation` absent or `0` → `(prev − lower)/0` is
 *   `±∞`, the triangular of infinite limits is `NaN`, and `clip` passes `NaN` through
 *   (measured: the first note performs, every later one is `NaN`).
 * - an unusable `milliseconds.timingBasis` → `RandomNumberProvider.requireUsableIndex` THROWS
 *   and the whole render aborts (R21's condition, reached from a different direction).
 * - `@seed` on a CORRELATED family → see {@link seedPoisonsCorrelatedSpan}.
 *
 * **These are the `⊥` routes AD-36.2 asks about, and they exist**, so this dimension's
 * pointwise density is capped like accentuation's and pedal's rather than integrated free like
 * tempo's. The cap is a `Math.min` rather than `integrateCappedAbsolute` only because the
 * density is piecewise CONSTANT here (see `imprecisionDistance.ts`).
 *
 * ## Spans end on ANY entry — and the entry list is already filtered
 *
 * AD-14ii/R12's rule is in `spanEnds.ts` and is asserted at entry. AD-35.4's hazard question
 * has a fresh answer here, one level below where it was asked: `GenericMap.parseData:143-146`
 * skips a child with no `@date`, and skips a `<style>` with no `@name.ref`, BEFORE any index
 * is taken. So "any entry" means any entry the parser kept. Measured: a `<style name.ref="…">`
 * at 720 leaves every later note exactly unperturbed — the δ₀ gap §5.9 promises — while the
 * same element with the attribute removed performs bit-identically to no style at all.
 *
 * Two more entry-index consequences, both measured: two distributions at ONE date give the
 * first a zero-width span that performs nothing, and a distribution with no `@date` is not an
 * entry at all, so it neither governs nor terminates.
 *
 * ## What this module compares (§5.9's declared-law qualification)
 *
 * The DECLARED law, and §5.9's one-sentence qualification is now three, each measured:
 *
 * 1. Inside a chord the renderer keeps one member on its drawn offset and re-rolls the others
 *    through a triangular `shake`, so a chord member's performed marginal depends on the MSM's
 *    simultaneity structure (§5.9, R26, AD-14vi).
 * 2. `distribution.list` is not sampled at all — `getValue(i)` is `series[i % n]` and a
 *    FRACTIONAL index interpolates between neighbours, so the performed values are not in
 *    general list members. Which index a note lands on is a function of its millisecond date
 *    and the timing basis.
 * 3. The two correlated families have no single marginal — see
 *    {@link CORRELATED_MARGINAL_NOTE}.
 *
 * All three are render-path artifacts of the same kind: they depend on where a note falls,
 * not on what the document declares.
 */
import type { Element } from '../xml/XomTypes.js';
import { readAttributeValue } from '../expression/attributes.js';
import { bottom, valued, type Valued } from './values.js';
import {
  DELTA_ZERO,
  clippedLaw,
  gaussianLaw,
  listLaw,
  triangularLaw,
  uniformLaw,
  type ImprecisionLaw,
} from './distributions.js';
import {
  IMPRECISION_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
} from '../mpm/names.js';
import { assertSpanEndRule } from './spanEnds.js';
import type { OrderedMapView } from './document.js';

/** The three §3 dimensions §5.9 covers, plus the map name each reads. */
export const IMPRECISION_DOMAINS = Object.freeze({
  imprecisionTiming: IMPRECISION_MAP_TIMING,
  imprecisionDynamics: IMPRECISION_MAP_DYNAMICS,
  imprecisionDuration: IMPRECISION_MAP_TONEDURATION,
} as const);

export type ImprecisionDomain = keyof typeof IMPRECISION_DOMAINS;

/** `distribution.*` local names, as `DistributionData` spells them. */
const UNIFORM = 'distribution.uniform';
const GAUSSIAN = 'distribution.gaussian';
const TRIANGULAR = 'distribution.triangular';
const BROWNIAN = 'distribution.correlated.brownianNoise';
const COMPENSATING = 'distribution.correlated.compensatingTriangle';
const LIST = 'distribution.list';

/** The two families whose value at one index depends on the value at the one before. */
const CORRELATED_FAMILIES: readonly string[] = [BROWNIAN, COMPENSATING];

/**
 * The renderer's fallback timing basis, and the value every non-timing domain uses
 * (`ImprecisionMap.ts:378-379`).
 */
export const DEFAULT_TIMING_BASIS_MS = 100.0;

/**
 * Why a span carries no comparable law.
 *
 * Every member is a measured route to `milliseconds.date="NaN"` or to a thrown render, i.e.
 * to R24's condition — notes that vanish from the MIDI export.
 */
export type ImprecisionBottomCause =
  | 'unusable-parameter'
  | 'empty-list'
  | 'degenerate-correlation'
  | 'unusable-timing-basis'
  | 'seeded-correlated'
  | 'no-monotone-quantile';

/**
 * What the marginal of a correlated family actually is, stated once and attached to every
 * correlated span's note.
 *
 * §5.9 says "correlated families compare marginals plus `processParameters`". Measured from
 * 20 000 INDEPENDENT chains per index — a time average over one chain measures the same thing
 * only after mixing, and its error is autocorrelation rather than sampling — **there is no
 * single marginal to compare**:
 *
 * - `brownianNoise` from the factory's own start is `Uniform(lower, upper)` at every index
 *   (KS 0.005–0.012 against a 0.0096 noise floor), which is also provable: a symmetric
 *   proposal with reject-if-outside satisfies detailed balance against the uniform. But the
 *   renderer never uses that start. `doHandover`'s fallback overwrites it with
 *   `Math.random()·(R/2) + lower + R/4` — **the middle half** — and the walk widens to the
 *   full range only after ~1000 indices at `stepWidth.max = 3`, or ~10 at 30.
 * - `compensatingTriangle` starts from the same middle half and then CONTRACTS: σ settles at
 *   8.30 for `degreeOfCorrelation = 2` and 4.91 for 5, against `U(−30, 30)`'s 17.32 — and
 *   EXPANDS to 20.76 with atoms at both limits at 0.5.
 *
 * So this module declares the **index-0 law the renderer constructs**: `Uniform` over the
 * middle half of the limits, clipped where the family clips. It is exact at an index every
 * span has, it is determined by the document alone, and it is read off `doHandover` rather
 * than modelled. What the process does thereafter is `degreeOfCorrelation` and
 * `stepWidth.max`'s business, and those are `processParameters` rows precisely because A-B3
 * says the marginal does not characterize the process — a statement this measurement turns
 * from a caveat into a finding.
 */
export const CORRELATED_MARGINAL_NOTE =
  'correlated family: the marginal is index-dependent, so the compared law is the index-0 ' +
  'law the renderer constructs (doHandover: uniform over the middle half of the limits). ' +
  'brownianNoise widens toward Uniform(lower, upper) over ~1000 indices at stepWidth.max=3; ' +
  'compensatingTriangle contracts (σ 8.30 at degreeOfCorrelation 2, 4.91 at 5) or expands ' +
  '(20.76 at 0.5). The process itself is priced through processParameters, not the marginal.';

/** One span of the timeline, with the law it declares. */
export interface ImprecisionSpan {
  readonly startTicks: number;
  /** `Number.POSITIVE_INFINITY` where the last entry governs to the end of the window. */
  readonly endTicks: number;
  /** `⊥` where the renderer performs no usable value at all — see the module doc. */
  readonly law: Valued<ImprecisionLaw>;
  /** The `distribution.*` local name, or null for a gap. */
  readonly family: string | null;
  /** §5.9's `processParameters` for a correlated family; empty otherwise. */
  readonly processParameters: readonly ProcessParameter[];
  /**
   * The basis handed to the provider, in ms — derived where the attribute is absent.
   * Null where the derivation is not applicable (a gap).
   */
  readonly timingBasisMs: number | null;
  /** True where the basis was DERIVED rather than written (§5.9's derivation rules). */
  readonly timingBasisDerived: boolean;
}

/** A named numeric parameter of a correlated process, priced as its own row (§5.9, A-B3). */
export interface ProcessParameter {
  readonly attribute: string;
  readonly value: number;
}

export interface ImprecisionNote {
  readonly kind: 'renderer-error' | 'inert' | 'structural' | 'declared-law';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface ImprecisionReading {
  readonly domain: ImprecisionDomain;
  readonly spans: readonly ImprecisionSpan[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly ImprecisionNote[];
}

/** The neutral reading: `δ₀` everywhere, which an absent map performs (R6). */
export function neutralImprecisionReading(domain: ImprecisionDomain): ImprecisionReading {
  return { domain, spans: [], breakpointsTicks: [0], notes: [] };
}

/** The law in force at `ticks` — `δ₀` outside every span, which is what a gap performs. */
export function lawAt(reading: ImprecisionReading, ticks: number): Valued<ImprecisionLaw> {
  for (const span of reading.spans)
    if (ticks >= span.startTicks && ticks < span.endTicks) return span.law;
  return valued(DELTA_ZERO);
}

/** The process parameters in force at `ticks`; empty outside every correlated span. */
export function processParametersAt(
  reading: ImprecisionReading,
  ticks: number,
): readonly ProcessParameter[] {
  for (const span of reading.spans)
    if (ticks >= span.startTicks && ticks < span.endTicks) return span.processParameters;
  return [];
}

/**
 * Read one imprecision map into its span sequence.
 *
 * Every dated entry participates in the walk, not only `distribution.*` elements: a `<style>`
 * (with `@name.ref`) or any other entry ends the previous span and opens a **gap**, which is a
 * real interval performing `δ₀` — never `⊥`. That is the sharp contrast with `asynchronyMap`,
 * where the same structural situation NaN-poisons the span (AD-33.1): there the map reads an
 * offset off the foreign element and gets `NaN`; here the map simply has no distribution for
 * the interval and applies nothing. Measured both ways.
 */
export function readImprecisionSpans(
  view: OrderedMapView | null,
  domain: ImprecisionDomain,
  scaleFactor: number,
): ImprecisionReading {
  assertSpanEndRule(IMPRECISION_DOMAINS[domain], 'any-entry');

  if (view === null) return neutralImprecisionReading(domain);

  const entries = view.entries.filter((entry) => Number.isFinite(entry.date));
  if (entries.length === 0) return neutralImprecisionReading(domain);

  const spans: ImprecisionSpan[] = [];
  const notes: ImprecisionNote[] = [];
  const breakpoints = new Set<number>([0]);

  for (const [index, entry] of entries.entries()) {
    const element: Element = entry.element;
    const startTicks = entry.date * scaleFactor;
    // ANY next entry ends the span (AD-14ii/R12) — the imprecision maps and asynchronyMap are
    // the only two with this rule, and `spanEnds.ts` is asserted above so the two cannot drift.
    const next = entries[index + 1] as (typeof entries)[number] | undefined;
    const endTicks = next === undefined ? Number.POSITIVE_INFINITY : next.date * scaleFactor;

    breakpoints.add(startTicks);

    const family = element.getLocalName();
    if (!family.startsWith('distribution.')) continue;

    // A zero-width span performs nothing at all: the renderer's note loop breaks on the very
    // first entry because `key >= endDate` already holds. Measured with two distributions at
    // one date — the first is invisible.
    if (!(endTicks > startTicks)) {
      notes.push({
        kind: 'structural',
        dateTicks: startTicks,
        detail: `<${family}> shares its date with the next entry, so its span is empty and it performs nothing`,
      });
      continue;
    }

    const read = readDistribution(element, family, domain);
    if (read.note !== null) notes.push({ ...read.note, dateTicks: startTicks });
    spans.push({
      startTicks,
      endTicks,
      law: read.law,
      family,
      processParameters: read.processParameters,
      timingBasisMs: read.timingBasisMs,
      timingBasisDerived: read.timingBasisDerived,
    });
  }

  return { domain, spans, breakpointsTicks: [...breakpoints].sort((a, b) => a - b), notes };
}

/** What one `<distribution.*>` element declares. */
interface DistributionReading {
  readonly law: Valued<ImprecisionLaw>;
  readonly processParameters: readonly ProcessParameter[];
  readonly timingBasisMs: number | null;
  readonly timingBasisDerived: boolean;
  readonly note: Omit<ImprecisionNote, 'dateTicks'> | null;
}

/**
 * A numeric attribute, in the renderer's own three states.
 *
 * `absent` is NOT `unusable`, and keeping them apart is the whole content of AD-47: an absent
 * attribute reaches the provider as `null` and coerces to 0, while an unusable one reaches it
 * as `NaN` and destroys every note in the span.
 */
type NumericReading =
  | { readonly state: 'present'; readonly value: number }
  | { readonly state: 'absent' }
  | { readonly state: 'unusable'; readonly raw: string };

function readNumeric(element: Element, name: string): NumericReading {
  const raw = readAttributeValue(element, name);
  if (raw === null) return { state: 'absent' };
  const value = parseFloat(raw);
  return Number.isFinite(value) ? { state: 'present', value } : { state: 'unusable', raw };
}

/** The renderer's coercion: absent means the number 0. */
function coerced(reading: NumericReading): number {
  return reading.state === 'present' ? reading.value : 0;
}

/**
 * `@seed` poisons a correlated span, which §4's exclusion list does not say.
 *
 * `doHandover` seeds the walk's first value through `setInitialValue`, and `setSeed` runs
 * AFTERWARDS and CLEARS the series (`ImprecisionMap.ts:319-354`,
 * `RandomNumberProvider.ts:186-190`), so the next draw reads `series[series.length − 1]` on an
 * empty array. Measured end to end: a `brownianNoise` carrying `seed="99"` gives
 * `milliseconds.date="NaN"` on **every** note, while the same document without it performs
 * normally. §4 lists `@seed` among the exclusions as "changes no distribution law" — true of
 * the four i.i.d. families and false of these two.
 *
 * The reference has the identical ordering, so this is not a port divergence; there
 * `ArrayList.get(-1)` throws `IndexOutOfBoundsException` and the render dies instead of
 * emitting `NaN`. Both destroy the performance, which is what `⊥` records.
 */
export function seedPoisonsCorrelatedSpan(family: string, hasSeed: boolean): boolean {
  return hasSeed && CORRELATED_FAMILIES.includes(family);
}

function readDistribution(
  element: Element,
  family: string,
  domain: ImprecisionDomain,
): DistributionReading {
  const lowerLimit = readNumeric(element, 'limit.lower');
  const upperLimit = readNumeric(element, 'limit.upper');
  const lowerClip = readNumeric(element, 'clip.lower');
  const upperClip = readNumeric(element, 'clip.upper');
  const mode = readNumeric(element, 'mode');
  const deviation = readNumeric(element, 'deviation.standard');
  const stepWidth = readNumeric(element, 'stepWidth.max');
  const correlation = readNumeric(element, 'degreeOfCorrelation');
  const basis = readNumeric(element, 'milliseconds.timingBasis');

  const unusable = [
    ['limit.lower', lowerLimit],
    ['limit.upper', upperLimit],
    ['clip.lower', lowerClip],
    ['clip.upper', upperClip],
    ['mode', mode],
    ['deviation.standard', deviation],
    ['stepWidth.max', stepWidth],
    ['degreeOfCorrelation', correlation],
  ] as const;

  const values = listValues(element);

  // 1. An unusable numeric attribute is `NaN` all the way to `milliseconds.date="NaN"`.
  for (const [name, reading] of unusable)
    if (reading.state === 'unusable')
      return bottomReading(
        'unusable-parameter',
        `@${name}="${reading.raw}" parses to NaN, which reaches every draw and makes every note in the span vanish from the MIDI export (R24)`,
      );

  // 2. The timing basis is the index's DENOMINATOR, and a bad one THROWS out of the render
  //    rather than poisoning a value — `requireUsableIndex` rejects NaN and ±∞.
  //
  //    Two distinct bad values, and only two. Unusable text gives `NaN`. An explicit `0`
  //    gives `±∞` (or `NaN` at date 0) and is NOT caught by the renderer's own guard, because
  //    that guard is inside `if (millisecondsTimingBasis === null)` and only ever repairs an
  //    ABSENT basis. A NEGATIVE basis is fine and is deliberately not here: the index goes
  //    negative, `getValue` clamps it to 0, and every note draws `series[0]` — one draw from
  //    the law, repeated. The marginal is unchanged, so it is the same kind of render artifact
  //    as the basis's ordinary effect (AD-14iii) and costs nothing.
  if (basis.state === 'unusable')
    return bottomReading(
      'unusable-timing-basis',
      `@milliseconds.timingBasis="${basis.raw}" makes the provider index NaN, and RandomNumberProvider.requireUsableIndex throws rather than returning a value — the render aborts (R21)`,
    );
  if (basis.state === 'present' && basis.value === 0)
    return bottomReading(
      'unusable-timing-basis',
      '@milliseconds.timingBasis="0" divides the millisecond date by zero, so the provider index is ±∞ and requireUsableIndex throws — the render aborts (R21). The renderer’s own ≤ 0 fallback repairs only an ABSENT basis, never a written zero',
    );

  // 3. `@seed` on a correlated family — the §4 divergence.
  const hasSeed = readAttributeValue(element, 'seed') !== null;
  if (seedPoisonsCorrelatedSpan(family, hasSeed))
    return bottomReading(
      'seeded-correlated',
      `<${family}> carries @seed, and setSeed clears the series doHandover had just seeded, so every draw reads an empty series and every note in the span vanishes (§4 lists @seed as inert, which holds only for the i.i.d. families)`,
    );

  const timingBasis = deriveTimingBasis(family, domain, {
    lowerLimit,
    upperLimit,
    lowerClip,
    upperClip,
    basis,
    values,
  });

  const processParameters: ProcessParameter[] = [];
  let note: Omit<ImprecisionNote, 'dateTicks'> | null = null;

  const finish = (law: ImprecisionLaw): DistributionReading => ({
    law: valued(law),
    processParameters,
    timingBasisMs: timingBasis.value,
    timingBasisDerived: timingBasis.derived,
    note,
  });

  switch (family) {
    case UNIFORM:
      return finish(uniformLaw(coerced(lowerLimit), coerced(upperLimit)));

    case GAUSSIAN:
      return finish(gaussianLaw(coerced(deviation), coerced(lowerLimit), coerced(upperLimit)));

    case TRIANGULAR: {
      const base = triangularLaw(coerced(lowerLimit), coerced(upperLimit), coerced(mode));
      if (base === null)
        return bottomReading(
          'no-monotone-quantile',
          'limit.lower > limit.upper: the renderer’s two inverse-CDF branches run in opposite directions, so there is no distribution function at all — the §5.8 non-monotone-pedal disposition',
        );
      return finish(clippedLaw(base, coerced(lowerClip), coerced(upperClip)));
    }

    case BROWNIAN: {
      if (stepWidth.state === 'present')
        processParameters.push({ attribute: 'stepWidth.max', value: stepWidth.value });
      note = { kind: 'declared-law', detail: CORRELATED_MARGINAL_NOTE };
      return finish(correlatedStartLaw(coerced(lowerLimit), coerced(upperLimit), null, null));
    }

    case COMPENSATING: {
      // `(prev − lower)/degreeOfCorrelation` with the divisor 0 is ±∞, the triangular of
      // infinite limits is NaN, and `clip` passes NaN through. Measured: the first note
      // performs and every later one is NaN.
      if (coerced(correlation) === 0)
        return bottomReading(
          'degenerate-correlation',
          '@degreeOfCorrelation is absent or 0, so the compensating step divides by zero and every draw after the first is NaN — the notes vanish from the MIDI export (R24)',
        );
      processParameters.push({ attribute: 'degreeOfCorrelation', value: coerced(correlation) });
      note = { kind: 'declared-law', detail: CORRELATED_MARGINAL_NOTE };
      return finish(
        correlatedStartLaw(
          coerced(lowerLimit),
          coerced(upperLimit),
          coerced(lowerClip),
          coerced(upperClip),
        ),
      );
    }

    case LIST: {
      const law = listLaw(values);
      if (law === null)
        return bottomReading(
          'empty-list',
          '<distribution.list> carries no usable <measurement value="…">, so getValue reads series[i % 0] = series[NaN] = undefined and every note in the span vanishes from the MIDI export (R24)',
        );
      return finish(law);
    }

    default:
      // An unknown `distribution.*` name falls through the renderer's own type switch and
      // performs nothing at all (measured identical to no map). It is not an error and it is
      // not ⊥: it is a declared span of δ₀.
      return {
        law: valued(DELTA_ZERO),
        processParameters: [],
        timingBasisMs: timingBasis.value,
        timingBasisDerived: timingBasis.derived,
        note: {
          kind: 'structural',
          detail: `<${family}> names no distribution the renderer implements, so its span performs nothing (δ₀)`,
        },
      };
  }
}

/**
 * The index-0 law of a correlated family, as `doHandover` constructs it.
 *
 * `firstValue = Math.random()·((upper − lower)/2) + lower + (upper − lower)/4`, i.e. uniform
 * over the MIDDLE HALF of the limits — then `setInitialValue` clips it, which is a no-op for
 * `brownianNoise` (it clamps into the same limits) and real for `compensatingTriangle`.
 * See {@link CORRELATED_MARGINAL_NOTE} for why this index and not another.
 */
function correlatedStartLaw(
  lower: number,
  upper: number,
  clipLower: number | null,
  clipUpper: number | null,
): ImprecisionLaw {
  const range = upper - lower;
  const start = uniformLaw(lower + range / 4, lower + (3 * range) / 4);
  if (clipLower === null || clipUpper === null) return start;
  return clippedLaw(start, clipLower, clipUpper);
}

function bottomReading(cause: ImprecisionBottomCause, detail: string): DistributionReading {
  return {
    law: bottom('renderer-error'),
    processParameters: [],
    timingBasisMs: null,
    timingBasisDerived: false,
    note: { kind: 'renderer-error', detail: `${cause}: ${detail}` },
  };
}

/** The `<measurement value="…">` children, in document order — `DistributionData`'s own read. */
function listValues(element: Element): readonly number[] {
  const values: number[] = [];
  const children = element.getChildElements('measurement');
  for (let i = 0; i < children.size(); ++i) {
    const raw = readAttributeValue(children.get(i), 'value');
    if (raw === null) continue;
    const value = parseFloat(raw);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

/**
 * §5.9's timing-basis derivation, which is `ImprecisionMap.ts:356-380` verbatim.
 *
 * Derived ONLY in the timing domain and only when the attribute is absent — from
 * `upper − lower` for uniform / gaussian / brownian, `upperClip − lowerClip` for both
 * triangles, and the list's range. Everything else, and any derivation that lands at or below
 * zero, falls back to 100.0. Because an absent limit reads as 0 (the module doc's one rule),
 * a distribution with no limits derives `0 − 0 = 0` and takes the fallback — which is why the
 * fallback catches far more documents than it looks like it should.
 */
function deriveTimingBasis(
  family: string,
  domain: ImprecisionDomain,
  parts: {
    lowerLimit: NumericReading;
    upperLimit: NumericReading;
    lowerClip: NumericReading;
    upperClip: NumericReading;
    basis: NumericReading;
    values: readonly number[];
  },
): { value: number; derived: boolean } {
  if (parts.basis.state === 'present') return { value: parts.basis.value, derived: false };

  let derived: number | null = null;
  if (domain === 'imprecisionTiming')
    switch (family) {
      case UNIFORM:
      case GAUSSIAN:
      case BROWNIAN:
        derived = coerced(parts.upperLimit) - coerced(parts.lowerLimit);
        break;
      case TRIANGULAR:
      case COMPENSATING:
        derived = coerced(parts.upperClip) - coerced(parts.lowerClip);
        break;
      case LIST:
        if (parts.values.length > 0)
          derived = Math.max(...parts.values) - Math.min(...parts.values);
        break;
      default:
        break;
    }

  if (derived === null || !(derived > 0)) return { value: DEFAULT_TIMING_BASIS_MS, derived: false };
  return { value: derived, derived: true };
}

/**
 * Whether a difference in `@milliseconds.timingBasis` is inert for this family (AD-14iii).
 *
 * For the four i.i.d. families the basis only decides WHICH pseudorandom value a note gets —
 * a per-render artifact this module refuses to model — and leaves the marginal identical, so
 * the difference is reported as inert and priced at nothing. For the two correlated families
 * it sets the step rate per unit time, which is a property of the process, so it folds into
 * `processParameters` as a numeric row. **No exclusion anywhere**, which is R13's whole point.
 *
 * The measurement behind the second half is the one in {@link CORRELATED_MARGINAL_NOTE}: the
 * correlated marginal genuinely depends on the index, so for those families the basis changes
 * which law a note draws from rather than merely which draw it receives.
 */
export function timingBasisIsInert(family: string | null): boolean {
  return family === null || !CORRELATED_FAMILIES.includes(family);
}

/** Every map name this reader knows, for the report's map-presence stamp. */
export const IMPRECISION_MAP_NAMES: readonly string[] = [
  IMPRECISION_MAP,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
];

/**
 * The report, as types and as the builder the applier accumulates into.
 *
 * The report is the engine's second output and, for two of its obligations, the only one.
 * `totalWrites === 0` is the exact contract for "this sample is a no-op", and the
 * velocity coefficients are the answer to a question the transform provably cannot answer on the
 * data path, because velocity is a shared bus whose final value depends on MSM note data that
 * the design keeps out.
 *
 * Two invariants, both from RULE F1/N4. Plain data: no XOM node reaches this file, and a
 * {@link SiteRef} is `structuredClone`-safe by construction. And every number is finite or null
 * — never `NaN`, never `Infinity`, never `undefined`. A center that could not be computed is
 * `null`, not `NaN`; a dimension that touches no velocity has `null` coefficients, not `{0,0}`,
 * and a caller summing velocity contributions must be able to tell the two apart.
 *
 * There is no `sitesPartial` counter, and it is a field a reader will look for: the design gives three
 * site counters and a `partial` STATE. A partial site *was written*, so it is counted under
 * `sitesTransformed`; the dimension's state records that something beside it was excluded, and
 * which components were unreachable is in the notes.
 *
 * `options.msm` is a facade-level option feeding `estimates` only, so `applyExaggeration` does
 * not take it (the carve-out).
 */
import { fromEntriesExact } from '../prelude/index.js';
import type { ExpressionDimension } from './registry.js';
import { EXPRESSION_DIMENSIONS } from './registry.js';
import type { SiteRef } from './siteRef.js';

/**
 * The glossary. The distinction that matters most is `absent` vs `inert`: a
 * consumer diffing two reports must be able to tell "the document does not use curvature" from
 * "the document uses curvature where the renderer gives it no effect".
 */
export type SiteState =
  /** No such attribute or element exists in this performance. */
  | 'absent'
  /** Present, but the renderer gives it no effect — reported, never written. */
  | 'inert'
  | 'transformed'
  /** Some components reachable, others excluded (articulation only). */
  | 'partial'
  /** Failed the validation gate, a site-discipline rule, or the identity short-circuit. */
  | 'skipped';

/**
 * The velocity contribution of a dimension, as the coefficients of `v·m + a` rather
 * than as a scalar maximum.
 *
 * A scalar is undefinable for `articulation`, whose contribution is affine in the note's
 * incoming velocity (`v' = v·r + c`), and a maximum over an unknown `v` does not exist; the
 * pair lets a caller evaluate the bound against its own velocities. Reported for exactly four
 * dimensions — `accentuation`, `articulation`, `ornamentDynamics`, `imprecisionDynamics` — and
 * `null` for the other eleven, `dynamics` included, that one being clamped into
 * `velocityRange` on the data path instead.
 */
export interface VelocityCoefficients {
  readonly multiplicative: number;
  readonly additive: number;
}

/** One closed reason, one obligation. Every note the engine can emit is in this union. */
export type ReportNoteKind =
  /** `s === 1`: the dimension was not walked at all. */
  | 'identity-factor'
  /** a level string that resolves to no def and is not a number (`'+'`, `'-'`, `'?'`). */
  | 'unresolvable-level'
  /** a def reached from instructions with different `@beatLength`: no normalization. */
  | 'heterogeneous-beat-length'
  /** a `<tempo>` without `@beatLength` is skipped by the renderer entirely. */
  | 'missing-beat-length'
  /** the population was empty, so the dimension has no center. */
  | 'no-center'
  /** the input failed its row's domain predicate. */
  | 'out-of-domain-input'
  /** the result rounded onto an exact bound of its space; the write is refused. */
  | 'saturation-refused'
  /** the closed form overflowed. The last line of the never-write-a-NaN invariant. */
  | 'non-finite-result'
  /** A dynamics level was clamped into `velocityRange`. */
  | 'clamped'
  /** two named levels in one styleDef became equal under the clamp. */
  | 'merged-levels'
  /** the write would have made `String(to') === String(level')`, deleting the gesture. */
  | 'pair-collapse-refused'
  /** the MEI end-marker duplicate moved with its transition endpoint. */
  | 'end-marker-moved'
  /** a constant instruction, on which the shape parameters do nothing. */
  | 'constant-instruction'
  /** gesture scope leaves constants and def values untouched. */
  | 'untouched-in-gesture'
  /** an element overrides exactly one bound of its def's window. */
  | 'cross-site-rubato-window'
  /** The site carries a lever whose neutral lives in the MSM. */
  | 'articulation-component-excluded'
  /** the site carries both halves of the non-monotone affine velocity pair. */
  | 'articulation-affine-velocity-pair'
  /** inline duration precedence makes this attribute inert on this element. */
  | 'inline-duration-precedence'
  /** the velocity estimate used the def's own `@beat` anchors, not the MSM's. */
  | 'accentuation-beats-unverifiable'
  /** every referencing `<ornament>` has `@scale` absent or 0, so the gradient is dead. */
  | 'ornament-scale-zero'
  /** `@transition.to` is absent and is never materialized. */
  | 'transition-to-absent'
  /** A gradient endpoint left the nominal [−1,1]. Informational only. */
  | 'gradient-outside-nominal-range'
  /**
   * which unit a transformed ornament frame is in; the caller's `s` depends on it.
   * One kind, two readings: on a v2 spread the `@time.unit` enum, one unit for the whole frame;
   * on a v3 spread each value's OWN domain, which may differ between the two bounds and
   * which a suffix-less value still takes from a legacy `@time.unit`.
   */
  | 'frame-time-unit'
  /**
   * a v3 spread carrying both `@frame.offset` and its legacy alias `@frame.start`. The
   * reader takes `@frame.offset` and the v3 writer never emits the alias, so it is left exactly
   * as found; this note is what keeps that from being a silent skip.
   */
  | 'frame-alias-shadowed'
  /** `@noteoff.shift`, which decides what absorbs the offset and can flip its sign. */
  | 'frame-noteoff-shift'
  /** `@subNoteDynamics="true"`: a CC-based regime for which the clamp is the wrong model. */
  | 'sub-note-dynamics'
  /** the booleans that decide the SPAN over which an instruction applies. */
  | 'span-flags'
  /** a timing distribution without `@milliseconds.timingBasis` re-indexes. */
  | 'derived-timing-basis'
  /** the tuning domain is write-only in this codebase. */
  | 'tuning-domain-inert'
  /** One attribute of an atomic group failed, so the whole distribution was skipped. */
  | 'atomic-group-skipped'
  /** a movement the renderer never reaches, or on which the curve is unobservable. */
  | 'movement-inert'
  /** A level that resolves through a def cannot be written at this site. */
  | 'unwritable-level-site';

/** One reported event, tied to a site where there is one. */
export interface ReportNote {
  readonly kind: ReportNoteKind;
  readonly dimension: ExpressionDimension | null;
  /** Null for dimension-level notes. */
  readonly site: SiteRef | null;
  readonly detail: string;
}

/** What one dimension did in one performance. */
export interface DimensionReport {
  /** The factor as passed. Null when the key was absent, which the design defines as identity. */
  readonly requestedFactor: number | null;
  readonly state: SiteState;
  readonly sitesTransformed: number;
  readonly sitesSkipped: number;
  readonly sitesInert: number;
  readonly writes: number;
  readonly clamps: number;
  /** Null where the dimension does not touch velocity. */
  readonly velocityCoefficients: VelocityCoefficients | null;
}

/**
 * the two per-document bounds, computed from the document rather than baked in as constants.
 * The tempo half is a deviation ratio, not the original maximum `s` (W2 amendment #7).
 */
export interface PerformanceBounds {
  /**
   * the `r`: the largest factor by which any population member deviates from the center,
   * `max(x/c, c/x)`. A caller with a musical window `[lo,hi]` completes the formula as
   * `s ≤ min(ln(hi/c), ln(c/lo)) / ln r`. Null when there is no center or no deviation.
   */
  readonly tempoDeviationRatio: number | null;
  /**
   * the smallest `s` at which any rubato site's total trim would reach
   * `1 − minRubatoWindow` — past which the guard, not the arithmetic, decides the window.
   * `ln(minRubatoWindow) / ln(1 − t)` minimised over the trimmed sites; null when no site
   * carries a trim.
   */
  readonly rubatoMaxS: number | null;
}

/**
 * The report fields whose values need the MSM (the carve-out): structured, and valued
 * `null` until `options.msm` — the facade's concern — supplies one. A field that exists and
 * says `null` is what lets a consumer write the code that will read it later.
 */
export interface MsmDependentEstimates {
  /** notes before the first instruction, and unterminated transitions. */
  readonly unreachableLevels: number | null;
  /** sites at risk of the pass-two millisecond commit guard discarding the note. */
  readonly articulationCommitCliffs: number | null;
  /** spreads at risk of driving `duration.perf` negative. */
  readonly ornamentSpreadCliffs: number | null;
  /** toneduration offsets at risk of putting a note's end before its start. */
  readonly imprecisionDurationCliffs: number | null;
  /**
   * true whenever `accentuation`'s velocity coefficient was computed from the
   * def's own declared `@beat` anchors instead of the rendered beat positions. Without an
   * MSM there are no rendered beats, so it is true whenever the dimension ran at all.
   */
  readonly beatsUnverifiable: boolean;
}

/** One performance's sub-report. */
export interface PerformanceReport {
  readonly performance: { readonly index: number; readonly name: string };
  /** A full record, never a partial one (RULE N4): all fifteen keys are always present. */
  readonly dimensions: Record<ExpressionDimension, DimensionReport>;
  /** the computed or overridden centers. Tempo is in quarter-note bpm. */
  readonly centers: { readonly tempo: number | null; readonly dynamics: number | null };
  readonly bounds: PerformanceBounds;
  /** pairs of def names in one styleDef whose transformed values became equal. */
  readonly mergedLevels: readonly (readonly [string, string])[];
  readonly estimates: MsmDependentEstimates;
  readonly notes: readonly ReportNote[];
  readonly totalWrites: number;
}

/** The whole run. */
export interface ExaggerationReport {
  /** Every dimension's effective factor, including the ones defaulted to 1. */
  readonly appliedFactors: Record<ExpressionDimension, number>;
  readonly performances: readonly PerformanceReport[];
  /** the contract: 0 means this sample is a no-op. */
  readonly totalWrites: number;
}

/**
 * The mutable accumulator the applier writes into, one per (performance, dimension). The two
 * extra counters here — `partial` and `present` — are how {@link finishDimension} derives a
 * state the three counters cannot express on their own: a dimension with one inert site and no
 * others is `inert`, one with no sites at all is `absent`, and the counters alone cannot tell
 * either from `skipped`.
 */
export class DimensionAccumulator {
  /** Sites written with every component reachable — the `transformed`. */
  private full = 0;
  /** Sites written with a component out of reach — the `partial`. */
  private partialSites = 0;
  private skippedSites = 0;
  private inertSites = 0;
  private written = 0;
  private clampEvents = 0;
  /** Whether the walk saw this dimension's attributes at all — the `absent` discriminator. */
  private present = false;
  /** Set only where the design applies; the accumulator maxes over sites. */
  private velocity: { multiplicative: number; additive: number } | null = null;
  /**
   * A DIMENSION-level verdict, which overrides the per-site tally whenever one is set.
   *
   * Two producers, both reachable only through the named methods below. The `s === 1`
   * short-circuit declares `skipped`: the dimension was never walked, so the site counters
   * describe nothing. An empty center population declares `inert` (R-W2-5/#10); without the
   * override it would surface as `skipped`, because the unresolvable levels that emptied the
   * population were themselves counted as skips — a failure where the truthful answer is "this
   * document gives this dimension nothing to work on".
   */
  private dimensionVerdict: SiteState | null = null;

  markPresent(): void {
    this.present = true;
  }

  countTransformed(writes: number): void {
    this.present = true;
    this.full += 1;
    this.written += writes;
  }

  /**
   * One site written, but with a component the design puts out of reach.
   *
   * Not a delegation to {@link countTransformed}: `transformed` outranks `partial`, so the two
   * must be tallied apart or a document holding one full site and one partial site could never
   * read `transformed`. Both count as writes and both appear in `sitesTransformed`.
   */
  countPartial(writes: number): void {
    this.present = true;
    this.partialSites += 1;
    this.written += writes;
  }

  countSkipped(): void {
    this.present = true;
    this.skippedSites += 1;
  }

  countInert(): void {
    this.present = true;
    this.inertSites += 1;
  }

  countClamp(): void {
    this.clampEvents += 1;
  }

  /** the running total, read by {@link ReportSink.totalWrites}. */
  get writeCount(): number {
    return this.written;
  }

  /** the dimension was short-circuited at `s = 1` and never walked. */
  declareNotWalked(): void {
    this.dimensionVerdict = 'skipped';
  }

  /** R-W2-5/#10 — the level population came out empty, so there is no center to transform on. */
  declareNoCenter(): void {
    this.dimensionVerdict = 'inert';
  }

  /**
   * the coefficients are a per-dimension maximum over the sites that contribute.
   *
   * RULE F1 is enforced here rather than at the call sites, which is what makes the module
   * header's "every number is finite or null" true by construction: both producers compute a
   * PRODUCT of two independently gated finite quantities — a gradient endpoint times an
   * `@ornament/@scale`, an accentuation amplitude times a `@scale` — and a product of two finite
   * doubles can overflow. An estimate that cannot be represented leaves the previous value.
   *
   * @returns false when the contribution was rejected, so the caller can name the site.
   */
  contributeVelocity(multiplicative: number, additive: number): boolean {
    this.enableVelocityReporting();
    if (!Number.isFinite(multiplicative) || !Number.isFinite(additive)) return false;
    const current = this.velocity ?? { multiplicative: 0, additive: 0 };
    this.velocity = {
      multiplicative: Math.max(current.multiplicative, multiplicative),
      additive: Math.max(current.additive, additive),
    };
    return true;
  }

  /** Declare that this dimension reports velocity coefficients even if no site contributed. */
  enableVelocityReporting(): void {
    this.velocity ??= { multiplicative: 0, additive: 0 };
  }

  /** the shape, with the state derived — see {@link finishDimension} for the precedence. */
  finish(requestedFactor: number | null): DimensionReport {
    return {
      requestedFactor,
      state: this.state(),
      // Sites the run WROTE, whether or not every component was reachable.
      sitesTransformed: this.full + this.partialSites,
      sitesSkipped: this.skippedSites,
      sitesInert: this.inertSites,
      writes: this.written,
      clamps: this.clampEvents,
      velocityCoefficients:
        this.velocity === null
          ? null
          : { multiplicative: this.velocity.multiplicative, additive: this.velocity.additive },
    };
  }

  private state(): SiteState {
    if (this.dimensionVerdict !== null) return this.dimensionVerdict;
    if (!this.present) return 'absent';
    if (this.full > 0) return 'transformed';
    if (this.partialSites > 0) return 'partial';
    if (this.skippedSites > 0) return 'skipped';
    return this.inertSites > 0 ? 'inert' : 'skipped';
  }
}

/**
 * Freeze one accumulator into the shape, deriving the state.
 *
 * A dimension-level verdict wins outright where one is set. Otherwise the order is:
 * `transformed > partial > skipped > inert > absent`. A dimension holding one fully-reachable
 * site beside a lopsided one reads `transformed`; `partial` is reserved for the case where EVERY
 * written site had a component out of reach — meico's `stacc`, whose only duration lever is
 * excluded, so "more staccato" renders as "softer" and never as "shorter". `skipped` outranks
 * `inert` because a skip is actionable while inertness is a property of the document.
 *
 * A "site" is one element for the dimensions whose the row group is per element — `dynamics`,
 * `articulation`, the ornament pair — and one attribute where the row is the whole story.
 * `sitesTransformed` counts every site the run WROTE, partial ones included. `articulation` is
 * the one asymmetry: `transformed`/`partial` are counted per ELEMENT, since the partiality is
 * a property of the element, while `inert` is counted per COMPONENT, since inline duration
 * precedence disables one attribute of an element whose others are still written.
 */
export function finishDimension(
  accumulator: DimensionAccumulator,
  requestedFactor: number | null,
): DimensionReport {
  return accumulator.finish(requestedFactor);
}

/** The MSM-dependent block as it stands without an MSM: every count null. */
export function estimatesWithoutMsm(accentuationRan: boolean): MsmDependentEstimates {
  return {
    unreachableLevels: null,
    articulationCommitCliffs: null,
    ornamentSpreadCliffs: null,
    imprecisionDurationCliffs: null,
    beatsUnverifiable: accentuationRan,
  };
}

/** A fresh accumulator per dimension — the full fifteen-key record RULE N4 requires. */
export function newAccumulators(): Record<ExpressionDimension, DimensionAccumulator> {
  return fromEntriesExact(EXPRESSION_DIMENSIONS, () => new DimensionAccumulator());
}

/**
 * Everything one performance's handlers report into: the fifteen accumulators, the note log,
 * and the two whole-performance findings that no single dimension owns.
 *
 * The note log stays append-only and in walk order, which is the order a caller reads the
 * document in and therefore the order in which a list of skips is intelligible.
 */
export class ReportSink {
  readonly dimensions = newAccumulators();
  private readonly collected: ReportNote[] = [];
  private readonly merged: (readonly [string, string])[] = [];

  note(
    kind: ReportNoteKind,
    dimension: ExpressionDimension | null,
    site: SiteRef | null,
    detail: string,
  ): void {
    this.collected.push({ kind, dimension, site, detail });
  }

  /** record a pair of named levels the clamp collapsed onto one value. */
  mergeLevels(first: string, second: string): void {
    this.merged.push([first, second]);
  }

  /**
   * A COPY, not the live array. CHARTER's public-API rule is that outputs are freshly created
   * and no internal mutable state leaks; `readonly ReportNote[]` is only a compile-time claim,
   * so a caller holding `this.collected` as `unknown[]` could push into the returned report.
   */
  get notes(): readonly ReportNote[] {
    return [...this.collected];
  }

  get mergedLevels(): readonly (readonly [string, string])[] {
    return [...this.merged];
  }

  get totalWrites(): number {
    return EXPRESSION_DIMENSIONS.reduce(
      (sum, dimension) => sum + this.dimensions[dimension].writeCount,
      0,
    );
  }
}

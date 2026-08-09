/**
 * DESIGN.md §4's report, as types and as the builder the applier accumulates into.
 *
 * The report is the engine's second output and, for two of its obligations, the *only* one.
 * R4 makes `totalWrites === 0` the exact contract for "this sample is a no-op"; R6(b) makes
 * the velocity coefficients the answer to a question the transform provably cannot answer on
 * the data path, because velocity is a shared bus whose final value depends on MSM note data
 * that R1 keeps out. A caller who ignores the report gets a document; a caller who reads it
 * gets to know what happened to it.
 *
 * ## Two invariants, both from RULE F1/N4
 *
 * - **Plain data.** No XOM node reaches this file. A {@link SiteRef} is the locator, and it
 *   is `structuredClone`-safe by construction.
 * - **Every number is finite or null.** Never `NaN`, never `Infinity`, never `undefined`. A
 *   center that could not be computed is `null`, not `NaN`; a dimension that touches no
 *   velocity has `null` coefficients, not `{0,0}` — the two are different answers and a
 *   caller summing R6(b) contributions must be able to tell them apart.
 *
 * ## Divergences from §4, and why
 *
 * §4 was written before the applier existed and three of its shapes did not survive contact.
 * They are listed here rather than in a commit message because a consumer reads this file.
 *
 * 1. **`ReportNote.site` is nullable.** §4 types it as a required `SiteRef`, but several §7
 *    obligations are dimension-level and have no site at all — the identity short-circuit,
 *    an empty center population, the tuning domain's inertness. A synthetic `SiteRef`
 *    pointing at nothing would be worse than a null.
 * 2. **`bounds.tempoMaxS` is `bounds.tempoDeviationRatio`.** §8's tempo bound is
 *    `s ≤ min(ln(hi/c), ln(c/lo)) / ln r`, which needs a musical window `[lo,hi]` — §8 uses
 *    `[10,400]` for the built-in ladder. `r` is the document's own quantity and is reported;
 *    the window is the caller's, and inventing one here would be exactly the magic constant
 *    C2 forbids. `bounds.rubatoMaxS` needs no such window and keeps its §4 name.
 * 3. **`sitesPartial` is not a field.** §4 gives three site counters and a `partial` STATE.
 *    A partial site was written, so it is counted under `sitesTransformed`, and the
 *    dimension's state reflects it; which components were unreachable is in the notes, where
 *    the detail belongs.
 * 4. **`estimates` is a field §4 does not list.** A10 authorises the content — an optional
 *    `msm` input feeding report estimates only — but §4's `PerformanceReport` block predates
 *    it. The field ships now, valued null, and §4's documentation of it is W3's batch
 *    (journaled as DECLINED-for-now in LOG's fix-wave adjudication). The mirror gap is
 *    deliberate too: `options.msm` is a facade-level option, and `applyExaggeration` does not
 *    take it.
 */
import type { ExpressionDimension } from './registry.js';
import { EXPRESSION_DIMENSIONS } from './registry.js';
import type { SiteRef } from './siteRef.js';

/**
 * DESIGN.md §4's glossary (A10). The distinction that matters most is `absent` vs `inert`: a
 * consumer diffing two reports must be able to tell "the document does not use curvature"
 * from "the document uses curvature where the renderer gives it no effect".
 */
export type SiteState =
  /** No such attribute or element exists in this performance. */
  | 'absent'
  /** Present, but the renderer gives it no effect — reported, never written. */
  | 'inert'
  /** Written. */
  | 'transformed'
  /** Some components reachable, others excluded by D-B (articulation only). */
  | 'partial'
  /** Failed the §1.2 validation gate, a site-discipline rule, or the identity short-circuit. */
  | 'skipped';

/**
 * R6(b): the velocity contribution of a dimension, as the coefficients of `v·m + a` rather
 * than as a scalar maximum.
 *
 * A scalar is undefinable for `articulation`, whose contribution is affine in the note's
 * incoming velocity (`v' = v·r + c`), and a maximum over an unknown `v` does not exist. The
 * pair lets a caller evaluate the bound against its own velocities without the engine
 * inventing one. Reported for exactly four dimensions — `accentuation`, `articulation`,
 * `ornamentDynamics`, `imprecisionDynamics` — and `null` for the other eleven, `dynamics`
 * included: that one is clamped into `velocityRange` on the data path instead (R6(a)).
 */
export interface VelocityCoefficients {
  readonly multiplicative: number;
  readonly additive: number;
}

/** One closed reason, one §7 obligation. Every note the engine can emit is in this union. */
export type ReportNoteKind =
  /** §1.1/A2 — `s === 1`: the dimension was not walked at all. */
  | 'identity-factor'
  /** §7.2 — a level string that resolves to no def and is not a number (`'+'`, `'-'`, `'?'`). */
  | 'unresolvable-level'
  /** §7.2 — a def reached from instructions with different `@beatLength`: no normalization. */
  | 'heterogeneous-beat-length'
  /** §7.2 — a `<tempo>` without `@beatLength` is skipped by the renderer entirely. */
  | 'missing-beat-length'
  /** §7.1 — the population was empty, so the dimension has no center. */
  | 'no-center'
  /** §1.2 — the input failed its row's domain predicate. */
  | 'out-of-domain-input'
  /** A3 — the result rounded onto an exact bound of its space; the write is refused. */
  | 'saturation-refused'
  /** §1.2 — the closed form overflowed. The last line of the never-write-a-NaN invariant. */
  | 'non-finite-result'
  /** R6(a) — a dynamics level was clamped into `velocityRange`. */
  | 'clamped'
  /** §7.4 — two named levels in one styleDef became equal under the clamp. */
  | 'merged-levels'
  /** D-I — the write would have made `String(to') === String(level')`, deleting the gesture. */
  | 'pair-collapse-refused'
  /** §7.2/A7 — the MEI end-marker duplicate moved with its transition endpoint. */
  | 'end-marker-moved'
  /** §7.4/§7.5/§7.14 — a constant instruction, on which the shape parameters do nothing. */
  | 'constant-instruction'
  /** §1.3 — gesture scope leaves constants and def values untouched. */
  | 'untouched-in-gesture'
  /** §7.6/A6 — an element overrides exactly one bound of its def's window. */
  | 'cross-site-rubato-window'
  /** D-B/§7.7 — the site carries a lever whose neutral lives in the MSM. */
  | 'articulation-component-excluded'
  /** §7.7 — the site carries both halves of the non-monotone affine velocity pair. */
  | 'articulation-affine-velocity-pair'
  /** §7.7 — inline duration precedence makes this attribute inert on this element. */
  | 'inline-duration-precedence'
  /** §7.8/A10 — the velocity estimate used the def's own `@beat` anchors, not the MSM's. */
  | 'accentuation-beats-unverifiable'
  /** §7.11 — every referencing `<ornament>` has `@scale` absent or 0, so the gradient is dead. */
  | 'ornament-scale-zero'
  /** §7.11 — `@transition.to` is absent and is never materialized. */
  | 'transition-to-absent'
  /** §7.11/RESOLVED-5 — a gradient endpoint left the nominal [−1,1]. Informational only. */
  | 'gradient-outside-nominal-range'
  /** §7.9/§8 — which unit a transformed ornament frame is in; the caller's `s` depends on it. */
  | 'frame-time-unit'
  /** §7.9 — `@noteoff.shift`, which decides what absorbs the offset and can flip its sign. */
  | 'frame-noteoff-shift'
  /** §7.4 — `@subNoteDynamics="true"`: a CC-based regime for which the clamp is the wrong model. */
  | 'sub-note-dynamics'
  /** §7.8/§7.16 — the booleans that decide the SPAN over which an instruction applies. */
  | 'span-flags'
  /** RESOLVED-7 — a timing distribution without `@milliseconds.timingBasis` re-indexes. */
  | 'derived-timing-basis'
  /** §7.16/A9 — the tuning domain is write-only in this codebase. */
  | 'tuning-domain-inert'
  /** D-F — one attribute of an atomic group failed, so the whole distribution was skipped. */
  | 'atomic-group-skipped'
  /** §7.14 — a movement the renderer never reaches, or on which the curve is unobservable. */
  | 'movement-inert'
  /** §7.2/D-C — a level that resolves through a def cannot be written at this site. */
  | 'unwritable-level-site';

/** One reported event, tied to a site where there is one. */
export interface ReportNote {
  readonly kind: ReportNoteKind;
  readonly dimension: ExpressionDimension | null;
  /** Null for dimension-level notes — see this module's divergence 1. */
  readonly site: SiteRef | null;
  readonly detail: string;
}

/** DESIGN.md §4. What one dimension did in one performance. */
export interface DimensionReport {
  /** The factor as passed. Null when the key was absent, which R3 defines as identity. */
  readonly requestedFactor: number | null;
  readonly state: SiteState;
  readonly sitesTransformed: number;
  readonly sitesSkipped: number;
  readonly sitesInert: number;
  readonly writes: number;
  readonly clamps: number;
  /** R6(b). Null where the dimension does not touch velocity. */
  readonly velocityCoefficients: VelocityCoefficients | null;
}

/**
 * §8's two per-document bounds, computed from the document rather than baked in as constants.
 *
 * See this module's divergence 2 for why the tempo half is a ratio rather than a maximum `s`.
 */
export interface PerformanceBounds {
  /**
   * §8's `r`: the largest factor by which any population member deviates from the center,
   * `max(x/c, c/x)`. A caller with a musical window `[lo,hi]` completes §8's formula as
   * `s ≤ min(ln(hi/c), ln(c/lo)) / ln r`. Null when there is no center or no deviation.
   */
  readonly tempoDeviationRatio: number | null;
  /**
   * §8/A6: the smallest `s` at which any rubato site's total trim would reach
   * `1 − minRubatoWindow`, i.e. the point past which the guard, not the arithmetic, decides
   * the window. `ln(minRubatoWindow) / ln(1 − t)` minimised over the trimmed sites; null when
   * no site carries a trim.
   */
  readonly rubatoMaxS: number | null;
}

/**
 * The report fields whose values need the MSM (A10's R1 carve-out).
 *
 * They are structured now and valued `null` now. `options.msm` is the facade's concern, and
 * a field that exists and says `null` is what lets a consumer write the code that will read
 * it later; a field that does not exist yet makes every consumer guess.
 */
export interface MsmDependentEstimates {
  /** §7.4 — notes before the first instruction, and unterminated transitions. */
  readonly unreachableLevels: number | null;
  /** §7.7 — sites at risk of the pass-two millisecond commit guard discarding the note. */
  readonly articulationCommitCliffs: number | null;
  /** §7.9 — spreads at risk of driving `duration.perf` negative. */
  readonly ornamentSpreadCliffs: number | null;
  /** §7.13 — toneduration offsets at risk of putting a note's end before its start. */
  readonly imprecisionDurationCliffs: number | null;
  /**
   * §7.8/A10 — true whenever `accentuation`'s velocity coefficient was computed from the
   * def's own declared `@beat` anchors instead of the rendered beat positions. Without an
   * MSM there are no rendered beats, so it is true whenever the dimension ran at all.
   */
  readonly beatsUnverifiable: boolean;
}

/** DESIGN.md §4. One performance's sub-report. */
export interface PerformanceReport {
  readonly performance: { readonly index: number; readonly name: string };
  /** A full record, never a partial one (RULE N4): all fifteen keys are always present. */
  readonly dimensions: Record<ExpressionDimension, DimensionReport>;
  /** §7.1's computed or overridden centers. Tempo is in quarter-note bpm. */
  readonly centers: { readonly tempo: number | null; readonly dynamics: number | null };
  readonly bounds: PerformanceBounds;
  /** §7.4 — pairs of def names in one styleDef whose transformed values became equal. */
  readonly mergedLevels: readonly (readonly [string, string])[];
  readonly estimates: MsmDependentEstimates;
  readonly notes: readonly ReportNote[];
  readonly totalWrites: number;
}

/** DESIGN.md §4. The whole run. */
export interface ExaggerationReport {
  /** Every dimension's effective factor, including the ones defaulted to 1 (R3). */
  readonly appliedFactors: Record<ExpressionDimension, number>;
  readonly performances: readonly PerformanceReport[];
  /** R4's contract: 0 means this sample is a no-op. */
  readonly totalWrites: number;
}

/**
 * The mutable accumulator the applier writes into, one per (performance, dimension).
 *
 * Separate from {@link DimensionReport} on purpose: the report is `readonly` plain data and
 * the accumulation is not, and the two extra counters here — `partial` and `present` — are
 * how {@link finishDimension} derives a state that §4's three counters cannot express on
 * their own. A dimension with one inert site and no others is `inert`; a dimension with no
 * sites at all is `absent`; the counters alone cannot tell those apart from `skipped`.
 */
export class DimensionAccumulator {
  /** Sites written with every component reachable — §4's `transformed`. */
  private full = 0;
  /** Sites written with a D-B component out of reach — §4's `partial`. */
  private partialSites = 0;
  private skippedSites = 0;
  private inertSites = 0;
  private written = 0;
  private clampEvents = 0;
  /** Whether the walk saw this dimension's attributes at all — the `absent` discriminator. */
  private present = false;
  /** Set only where R6(b) applies; the accumulator maxes over sites. */
  private velocity: { multiplicative: number; additive: number } | null = null;
  /**
   * A DIMENSION-level verdict, which overrides the per-site tally whenever one is set.
   *
   * Exactly two producers, both of them findings about the dimension rather than about any one
   * site, and both reachable only through the two named methods below. The `s === 1`
   * short-circuit declares `skipped`: the dimension was never walked, so the site counters
   * describe nothing. An empty center population declares `inert` (R-W2-5/#10): the levels
   * resolved to nothing a center could be built from, so no `s` could have moved them. Without
   * the override the second would surface as `skipped`, because the very unresolvable levels
   * that emptied the population were themselves counted as skips — reporting a failure where
   * the truthful answer is "this document gives this dimension nothing to work on".
   */
  private dimensionVerdict: SiteState | null = null;

  markPresent(): void {
    this.present = true;
  }

  /** One site written with every component reachable. */
  countTransformed(writes: number): void {
    this.present = true;
    this.full += 1;
    this.written += writes;
  }

  /**
   * One site written, but with a component D-B puts out of reach (§7.7).
   *
   * Deliberately NOT a delegation to {@link countTransformed}: §4-as-amended orders
   * `transformed > partial`, so the two must be tallied apart or a document holding one full
   * site and one partial site could never read `transformed`. Both still count as writes, and
   * both still appear in `sitesTransformed`, which reports sites the run WROTE.
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

  /** R4's running total, read by {@link ReportSink.totalWrites}. */
  get writeCount(): number {
    return this.written;
  }

  /** A2 — the dimension was short-circuited at `s = 1` and never walked. */
  declareNotWalked(): void {
    this.dimensionVerdict = 'skipped';
  }

  /** R-W2-5/#10 — the level population came out empty, so there is no center to transform around. */
  declareNoCenter(): void {
    this.dimensionVerdict = 'inert';
  }

  /**
   * R6(b): the coefficients are a per-dimension maximum over the sites that contribute.
   *
   * **This is where RULE F1 is enforced, not at the call sites.** Both producers compute a
   * PRODUCT of two independently gated finite quantities — a gradient endpoint times an
   * `@ornament/@scale`, an accentuation amplitude times a `@scale` — and a product of two
   * finite doubles can overflow. Rejecting here rather than at each caller is what makes the
   * module header's "every number is finite or null" true by construction: an estimate that
   * cannot be represented is left at its previous value and the caller reports the site.
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

  /** Declare that this dimension reports R6(b) coefficients even if no site contributed. */
  enableVelocityReporting(): void {
    this.velocity ??= { multiplicative: 0, additive: 0 };
  }

  /** §4's shape, with the state derived — see {@link finishDimension} for the precedence. */
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
 * Freeze one accumulator into §4's shape, deriving the state.
 *
 * A dimension-level verdict wins outright where one is set — the identity short-circuit and
 * the empty center population are statements about the dimension that no site tally can
 * contradict.
 *
 * Otherwise the order is §4-as-amended's: **`transformed > partial > skipped > inert >
 * absent`**. A dimension holding one fully-reachable site beside a lopsided one reads
 * `transformed`, because the run did apply the dimension somewhere; `partial` is reserved for
 * the case where EVERY written site had a component out of reach — meico's `stacc`, whose only
 * duration lever is excluded, so "more staccato" renders as "softer" and never as "shorter".
 * `skipped` then outranks `inert`: a skip is a site the run declined to transform and is
 * therefore actionable, while inertness is a property of the document that no `s` would change.
 *
 * ## What the three counters count
 *
 * A "site" is one element for the dimensions whose §7 row group is per element — `dynamics`,
 * `articulation`, the ornament pair — and one attribute where the row is the whole story.
 * `sitesTransformed` counts every site the run WROTE, partial ones included; the state, not the
 * counter, is what distinguishes them. The one asymmetry worth naming: `articulation` counts
 * `transformed`/`partial` per ELEMENT, because D-B's partiality is a property of the element,
 * but counts `inert` per COMPONENT, because inline duration precedence disables one attribute
 * of an element whose others are still written. So one element can reach both counters.
 */
export function finishDimension(
  accumulator: DimensionAccumulator,
  requestedFactor: number | null,
): DimensionReport {
  return accumulator.finish(requestedFactor);
}

/** The MSM-dependent block as it stands without an MSM: every count null (A10). */
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
  return Object.fromEntries(
    EXPRESSION_DIMENSIONS.map((dimension) => [dimension, new DimensionAccumulator()]),
  ) as Record<ExpressionDimension, DimensionAccumulator>;
}

/**
 * Everything one performance's handlers report into: the fifteen accumulators, the note log,
 * and the two whole-performance findings that no single dimension owns.
 *
 * It exists so that a handler takes ONE parameter instead of four, and so that the note log
 * stays append-only and in walk order — which is the order a caller reads the document in,
 * and therefore the order in which a list of skips is intelligible.
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

  /** §7.4 — record a pair of named levels the clamp collapsed onto one value. */
  mergeLevels(first: string, second: string): void {
    this.merged.push([first, second]);
  }

  /**
   * A COPY, not the live array.
   *
   * CHARTER's public-API rule is that outputs are freshly created and no internal mutable
   * state leaks. `readonly ReportNote[]` is only a compile-time claim: handing out
   * `this.collected` would put the sink's own array into the returned report, where a caller
   * holding it as `unknown[]` can push into a value the type says is frozen.
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

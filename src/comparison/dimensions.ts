/**
 * The eleven dimensions behind ONE interface — §3's table as a function.
 *
 * Everything above this file works on `DimensionEvaluation`s and never on a `TempoCurve` or an
 * `OrnamentAtom`. That is what lets §7's aggregation, §9's report shapes and the profile export
 * be written once instead of eleven times, and it is why the three genuinely different SHAPES
 * §3 names — curve, event, distribution — are the three functions here rather than eleven.
 *
 * ## What a dimension has to answer
 *
 * `d_k`, and where in the window the mass sits (cells with their integrand, atoms with their
 * placement). Then the interpretive companions: §1.2's decomposition where a curve exists,
 * §7.5's signed descriptor, the `⊥` length, the capped-cell count, and whatever the reader
 * found worth reporting. A dimension that cannot answer one of these answers `null` rather
 * than a stand-in — §1.2 takes moments, and a window with a `⊥` hole in it does not have them.
 *
 * ## Where the maps come from, and the one place this file departs from AD-3
 *
 * §5.0 evaluates per part. `Performance.renderParts` iterates over the **MSM's** parts and
 * calls `resolvePartMaps(mpmPart, globalMaps)`, whose first line is
 * `if (mpmPart === null) return globalMaps` — so an MSM part with no MPM counterpart inherits
 * the GLOBAL maps wholesale, and does NOT fall back to the neutral curve. Measured end to end
 * through `performMsm`: an MPM with a global `dynamicsMap` at volume 40 and a part 1 shadowing
 * it at 110, against an MSM with parts 1 and 2, performs part 1's notes at velocity 110 and
 * part 2's at **40** — not at the neutral 100.
 *
 * AD-3 says an unmatched part "compares against the neutral curve (R6 applied to parts)". R6 is
 * being applied one level too early: an absent MAP is the neutral curve, and what a part with
 * no counterpart has is not an absent map but the GLOBAL one. So the caller substitutes the
 * other document's global scope for a missing part, which degenerates to AD-3's rule exactly
 * when the global map is absent too. The reading is renderer-sourced and pipeline-measured and
 * is reported for ratification; the difference is not small (|ln(100/40)| = 9.6 JND sustained
 * over the whole part).
 */
import { accentuationDistance, accentuationSampler } from './accentuationDistance.js';
import {
  readAccentuationSegments,
  rendererDefaultBeatGrid,
  type AccentuationCurve,
  type BeatGrid,
} from './accentuationCurve.js';
import { articulationDistance, defaultArticulationDistance } from './articulationDistance.js';
import { readArticulationAtoms, type ArticulationAtoms } from './articulationAtoms.js';
import { readDefaultArticulation, type DefaultArticulationCurve } from './articulationDefault.js';
import { asynchronyDistance } from './asynchronyDistance.js';
import { offsetAt, readAsynchronySegments, type AsynchronyCurve } from './asynchronyCurve.js';
import {
  canonicalizationFor,
  curveMoments,
  decomposeCurves,
  isShapelessUnder,
  type CanonicalPair,
  type CurveDecomposition,
  type CurveMoments,
  IDENTITY_CANONICAL_PAIR,
  type InvarianceMode,
  type SampledCurve,
} from './decomposition.js';
import {
  readScopeMapViews,
  type ComparisonDocument,
  type EntryResolution,
  type OrderedMapView,
} from './document.js';
import { dynamicsDistance } from './dynamicsDistance.js';
import { editScript, type EditScriptResult } from './editScript.js';
import { affectedTicks, editInstructionsOf, editView, type EditInstruction } from './editState.js';
import { readDynamicsSegments, volumeAt, type DynamicsCurve } from './dynamicsCurve.js';
import type { EventAtomMass } from './eventAlignment.js';
import { imprecisionDistance, type ImprecisionDecomposition } from './imprecisionDistance.js';
import {
  readImprecisionSpans,
  type ImprecisionDomain,
  type ImprecisionReading,
} from './imprecisionLaws.js';
import { ornamentationDistance } from './ornamentationDistance.js';
import { readOrnamentAtoms, type OrnamentAtoms } from './ornamentAtoms.js';
import { pedalDistance, pedalSampler } from './pedalDistance.js';
import { DEFAULT_CONTROLLER, readMovementSegments, type PedalCurve } from './pedalCurve.js';
import type { ComparisonScope } from './parts.js';
import { CompensatedSum, gaussLegendre10 } from './quadrature.js';
import {
  comparisonRowFor,
  comparisonRowWith,
  type ComparisonDimension,
  type ComparisonJndKey,
  type ComparisonUnit,
  type JndOverrides,
} from './registry.js';
import {
  displacementTicksAt,
  readRubatoSegments,
  rubatoBottomSpans,
  type RubatoCurve,
} from './rubatoCurve.js';
import { rubatoDistance } from './rubatoDistance.js';
import { readTempoSegments, quarterBpmAt, type TempoCurve } from './tempoCurve.js';
import { tempoDistance } from './tempoDistance.js';
import { isBottom } from './values.js';
import { NonPositiveTempoError } from './errors.js';
import type { ComparisonWindow } from './window.js';

// ---------------------------------------------------------------------------
// The uniform shape
// ---------------------------------------------------------------------------

/** A note produced inside the interior, before the facade gives it a §9.1 kind. */
export interface RawNote {
  readonly kind: string;
  readonly dimension: ComparisonDimension;
  readonly document: 'a' | 'b' | null;
  readonly startQuarters: number | null;
  readonly endQuarters: number | null;
  readonly message: string;
}

/**
 * One cell of a dimension's density, in QUARTERS — `aggregate.ts`'s shape.
 *
 * `densityAt` is NULLABLE and every dimension this wave ships supplies one: AD-51.1's ruled
 * extension had each `*Distance` module hand back the integrand it already evaluates, so AD-19's
 * segment boundaries root-refine exactly rather than falling back to cell resolution. The null
 * stays legal for the reason AD-51.1 gives — it is the graceful path for a future dimension that
 * genuinely has no pointwise density — and `ComparisonReport.cellQuantizedDimensions` is the
 * field that names such a dimension when it appears. Empty on every document the engine can
 * currently produce, which is what makes it a measurement rather than a promise.
 */
export interface EvaluationCell {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly mass: number;
  readonly densityAt: ((quarters: number) => number) | null;
}

export interface DimensionEvaluation {
  readonly dimension: ComparisonDimension;
  /** `d_k` over this scope, in JND·quarters. */
  readonly distance: number;
  readonly cells: readonly EvaluationCell[];
  /** Event mass, in JND — `κ` is applied where cells and atoms are added (§7.1). */
  readonly atoms: readonly EventAtomMass[];
  /** `(T_a − T_b)/jnd` in JND per quarter, signed (C2); null where no curve exists. */
  readonly signedAt: ((quarters: number) => number) | null;
  /**
   * `∫(T_a − T_b) dt / L` over the window, in {@link unit} — §7.5's descriptor, never a
   * distance. Null where the dimension has no single T-space quantity to be signed in.
   */
  readonly meanSigned: number | null;
  /** The canonicalized T-space curves, for §9's profile export; null for the shapeless kinds. */
  readonly valueA: ((quarters: number) => number) | null;
  readonly valueB: ((quarters: number) => number) | null;
  /**
   * The pair's refinement grid over this scope, in QUARTERS.
   *
   * Carried so that a caller merging several part scopes can take §1.2's moments over the
   * disjoint union of their curves rather than over one of them — the parts really are several
   * curves, and a mean of a concatenation needs each piece's own partition.
   */
  readonly pairGridQuarters: readonly number[];
  readonly unit: ComparisonUnit;
  readonly space: string;
  readonly decomposition: EvaluationDecomposition | null;
  readonly events: {
    readonly matched: number;
    readonly unmatchedA: number;
    readonly unmatchedB: number;
    readonly mass: number;
  };
  readonly bottomLengthQuarters: number;
  readonly cappedCells: number;
  readonly rowDistances: readonly { readonly key: ComparisonJndKey; readonly distance: number }[];
  readonly notes: readonly RawNote[];
  readonly timeSignatureSource: 'msm' | 'renderer-default' | null;
  readonly datePositionKnown: boolean;
  /** The mode actually applied — `'none'` where the requested one could not be honoured. */
  readonly invariance: InvarianceMode;
  readonly shapeless: boolean;
}

/** §1.2's four fields plus the signed level and the closing check (§9.3's `Decomposition`). */
export interface EvaluationDecomposition {
  readonly level: number;
  readonly levelSigned: number;
  readonly gain: number;
  readonly shape: number | null;
  readonly r: number | null;
  readonly shapeless: boolean;
  readonly l2Squared: number;
}

/** Everything the eleven evaluators share, resolved by the caller. */
export interface DimensionSettings {
  readonly window: ComparisonWindow;
  readonly ticksPerQuarter: number;
  readonly jnd: JndOverrides;
  readonly invariance: Readonly<Record<ComparisonDimension, InvarianceMode>>;
  /** From the MSM (AD-12); null leaves the renderer's own 4/4 default in force. */
  readonly beatGrid: BeatGrid | null;
  readonly lambdaDate: number;
}

/** One side of one scope pair, with its maps already resolved. */
export interface ScopeSide {
  readonly role: 'a' | 'b';
  readonly document: ComparisonDocument;
  readonly scope: ComparisonScope;
}

/** The map view of one container in one scope, or null where the scope has none. */
function viewOf(side: ScopeSide, container: string) {
  return readScopeMapViews(side.scope).get(container) ?? null;
}

/** Whether the resolved map came from the PART's own environment — `OrnamentationMap`'s branch. */
function mapIsPartLocal(side: ScopeSide, container: string): boolean {
  return side.scope.scope === 'part' && side.scope.environment.maps.has(container);
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** The union length of a set of intervals, clipped to the window. */
function coveredLength(
  intervals: readonly { readonly startTicks: number; readonly endTicks: number }[],
  startTicks: number,
  endTicks: number,
): number {
  const clipped = intervals
    .map((interval) => ({
      low: Math.max(interval.startTicks, startTicks),
      high: Math.min(interval.endTicks, endTicks),
    }))
    .filter((interval) => interval.high > interval.low)
    .sort((x, y) => x.low - y.low);

  let total = 0;
  let reach = startTicks;
  for (const interval of clipped) {
    const low = Math.max(interval.low, reach);
    if (interval.high > low) total += interval.high - low;
    reach = Math.max(reach, interval.high);
  }
  return total;
}

/** One document's own breakpoints inside the window — the grid its moments are taken on. */
function documentGrid(
  breakpointsTicks: readonly number[],
  startTicks: number,
  endTicks: number,
): readonly number[] {
  const points = new Set<number>([startTicks, endTicks]);
  for (const breakpoint of breakpointsTicks)
    if (breakpoint > startTicks && breakpoint < endTicks) points.add(breakpoint);
  return [...points].sort((x, y) => x - y);
}

/** `∫ g dt / L` over a grid, in the grid's own abscissa. */
function meanOverGrid(g: SampledCurve, grid: readonly number[]): number | null {
  if (grid.length < 2) return null;
  const length = grid[grid.length - 1] - grid[0];
  if (!(length > 0)) return null;
  const total = new CompensatedSum();
  for (let i = 0; i < grid.length - 1; ++i) total.add(gaussLegendre10(g, grid[i], grid[i + 1]));
  return total.total / length;
}

const EMPTY_EVENTS = { matched: 0, unmatchedA: 0, unmatchedB: 0, mass: 0 };

// ---------------------------------------------------------------------------
// The curve dimensions
// ---------------------------------------------------------------------------

/** Everything a curve-shaped dimension has to supply, in one record. */
interface CurvePlan<C> {
  readonly dimension: ComparisonDimension;
  /** The map this dimension reads, which is also the (part, map) scope of its §6 script. */
  readonly container: string;
  readonly jndKey: ComparisonJndKey;
  /**
   * Read a VIEW rather than a side, so §6's edit states go through the same reader.
   *
   * `resolution` is the fallback for a view whose entries carry none — i.e. every ordinary
   * single-document view. A mixed edit view carries one per entry and this argument is then
   * never consulted (`document.ts`'s `resolutionAt`).
   */
  readonly readView: (
    view: OrderedMapView | null,
    resolution: EntryResolution,
    role: 'a' | 'b',
  ) => C;
  readonly breakpoints: (curve: C) => readonly number[];
  /**
   * The T-space curve, or null where the window carries a `⊥` span — §1.2 takes moments and
   * `⊥` has none, so a stand-in would be a number a reader would interpret as a value.
   */
  readonly sampler: (curve: C, startTicks: number, endTicks: number) => SampledCurve | null;
  readonly bottomSpans: (
    curve: C,
  ) => readonly { readonly startTicks: number; readonly endTicks: number }[];
  /**
   * `d_k` over a window. The WINDOW is a parameter rather than a closure because §6's edit path
   * integrates the same function over the sub-interval a transition can change
   * (`editState.affectedTicks`); every other caller passes `settings.window`.
   */
  readonly distance: (
    a: C,
    b: C,
    jnd: number,
    canonical: CanonicalPair,
    window: ComparisonWindow,
  ) => {
    readonly distance: number;
    readonly cells: readonly {
      readonly startQuarters: number;
      readonly endQuarters: number;
      readonly mass: number;
      readonly densityAt: (quarters: number) => number;
      readonly capped?: boolean;
    }[];
  };
  readonly notes: (curve: C, role: 'a' | 'b') => readonly RawNote[];
  readonly timeSignatureSource?: (a: C, b: C) => 'msm' | 'renderer-default';
}

/** What one side's instructions resolve against, in `document.ts`'s own shape. */
function resolutionOf(side: ScopeSide): EntryResolution {
  return {
    scaleFactor: side.document.scaleFactor,
    environment: side.scope.environment,
    globalEnvironment: side.document.performance.global,
  };
}

/** One side's curve: its own map, read through its own resolution. */
function readCurve<C>(plan: CurvePlan<C>, side: ScopeSide): C {
  return plan.readView(viewOf(side, plan.container), resolutionOf(side), side.role);
}

function evaluateCurve<C>(
  plan: CurvePlan<C>,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): DimensionEvaluation {
  const ticksPerQuarter = settings.ticksPerQuarter;
  const startTicks = settings.window.startQuarters * ticksPerQuarter;
  const endTicks = settings.window.endQuarters * ticksPerQuarter;

  const curveA = readCurve(plan, a);
  const curveB = readCurve(plan, b);
  const row = comparisonRowWith(plan.jndKey, settings.jnd);

  // Moments are taken on each document's OWN breakpoints, which is what makes the
  // canonicalization pair-independent BY CONSTRUCTION rather than by an argument about
  // quadrature exactness (§7.4, AD-20: the transform is per DOCUMENT and never pair-dependent).
  const samplerA = plan.sampler(curveA, startTicks, endTicks);
  const samplerB = plan.sampler(curveB, startTicks, endTicks);
  const gridA = documentGrid(plan.breakpoints(curveA), startTicks, endTicks);
  const gridB = documentGrid(plan.breakpoints(curveB), startTicks, endTicks);
  const momentsA = samplerA === null ? null : curveMoments(samplerA, gridA);
  const momentsB = samplerB === null ? null : curveMoments(samplerB, gridB);

  const requested = settings.invariance[plan.dimension];
  const notes: RawNote[] = [...plan.notes(curveA, 'a'), ...plan.notes(curveB, 'b')];

  // AD-25.1's knowability split: a mode this DOCUMENT cannot carry — a window with a `⊥` span
  // in it has no moments — degrades with a typed note, because the caller could not have known
  // when they wrote the option bag.
  let invariance = requested;
  if (requested !== 'none' && (momentsA === null || momentsB === null)) {
    invariance = 'none';
    notes.push({
      kind: 'option-unusable',
      dimension: plan.dimension,
      document: null,
      startQuarters: settings.window.startQuarters,
      endQuarters: settings.window.endQuarters,
      message:
        `invariance '${requested}' could not be applied: the window carries a ⊥ span, which ` +
        'has no mean or spread to canonicalize against, so the raw curves were compared',
    });
  }

  const canonical: CanonicalPair = {
    a:
      momentsA === null || invariance === 'none'
        ? IDENTITY
        : canonicalizationFor(invariance, momentsA),
    b:
      momentsB === null || invariance === 'none'
        ? IDENTITY
        : canonicalizationFor(invariance, momentsB),
  };

  const result = plan.distance(curveA, curveB, row.jnd, canonical, settings.window);

  const canonicalA =
    samplerA === null ? null : (ticks: number) => canonicalApply(canonical.a, samplerA(ticks));
  const canonicalB =
    samplerB === null ? null : (ticks: number) => canonicalApply(canonical.b, samplerB(ticks));

  const pairGrid = documentGrid(
    [...plan.breakpoints(curveA), ...plan.breakpoints(curveB)],
    startTicks,
    endTicks,
  );
  const decomposition =
    canonicalA === null || canonicalB === null
      ? null
      : decompositionOf(
          decomposeCurves(canonicalA, canonicalB, pairGrid),
          curveMoments(canonicalA, pairGrid),
          curveMoments(canonicalB, pairGrid),
        );

  const shapeless =
    (momentsA !== null && isShapelessUnder(invariance, momentsA)) ||
    (momentsB !== null && isShapelessUnder(invariance, momentsB));

  return {
    dimension: plan.dimension,
    distance: result.distance,
    cells: result.cells.map((cell) => ({
      startQuarters: cell.startQuarters,
      endQuarters: cell.endQuarters,
      mass: cell.mass,
      densityAt: cell.densityAt,
    })),
    atoms: [],
    signedAt:
      canonicalA === null || canonicalB === null
        ? null
        : (quarters: number) =>
            (canonicalA(quarters * ticksPerQuarter) - canonicalB(quarters * ticksPerQuarter)) /
            row.jnd,
    // Taken on the PAIR's grid, which carries every breakpoint of both curves — the same
    // partition `d_k` is integrated over, so the descriptor and the distance see one curve.
    meanSigned:
      canonicalA === null || canonicalB === null
        ? null
        : meanOverGrid((ticks) => canonicalA(ticks) - canonicalB(ticks), pairGrid),
    valueA: canonicalA === null ? null : (quarters) => canonicalA(quarters * ticksPerQuarter),
    valueB: canonicalB === null ? null : (quarters) => canonicalB(quarters * ticksPerQuarter),
    pairGridQuarters: pairGrid.map((ticks) => ticks / ticksPerQuarter),
    unit: row.unit,
    space: row.space.kind,
    decomposition,
    events: EMPTY_EVENTS,
    bottomLengthQuarters:
      coveredLength(
        [...plan.bottomSpans(curveA), ...plan.bottomSpans(curveB)],
        startTicks,
        endTicks,
      ) / ticksPerQuarter,
    cappedCells: result.cells.filter((cell) => cell.capped === true).length,
    rowDistances: [{ key: plan.jndKey, distance: result.distance }],
    notes,
    timeSignatureSource: plan.timeSignatureSource?.(curveA, curveB) ?? null,
    datePositionKnown: true,
    invariance,
    shapeless,
  };
}

const IDENTITY = { shift: 0, scale: 1 };

function canonicalApply(
  canonical: { readonly shift: number; readonly scale: number },
  value: number,
): number {
  if (canonical.scale === 0) return 0;
  return canonical.scale * (value - canonical.shift);
}

function decompositionOf(
  decomposition: CurveDecomposition,
  momentsA: CurveMoments,
  momentsB: CurveMoments,
): EvaluationDecomposition {
  return {
    level: decomposition.level,
    levelSigned: momentsA.mean - momentsB.mean,
    gain: decomposition.gain,
    shape: decomposition.shape,
    r: decomposition.r,
    shapeless: decomposition.shapeless,
    l2Squared: decomposition.l2Squared,
  };
}

/** A reader note, retagged for the report with the dimension and side it came from. */
function noteFrom(
  dimension: ComparisonDimension,
  role: 'a' | 'b',
  ticksPerQuarter: number,
  note: { readonly kind: string; readonly dateTicks: number; readonly detail: string },
): RawNote {
  const quarters = Number.isFinite(note.dateTicks) ? note.dateTicks / ticksPerQuarter : null;
  return {
    kind: note.kind,
    dimension,
    document: role,
    startQuarters: quarters,
    endQuarters: quarters,
    message: note.detail,
  };
}

// ---------------------------------------------------------------------------
// The eleven
// ---------------------------------------------------------------------------

export function evaluateDimension(
  dimension: ComparisonDimension,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): DimensionEvaluation {
  switch (dimension) {
    case 'tempo':
      return evaluateCurve(tempoPlan(settings), a, b, settings);
    case 'dynamics':
      return evaluateCurve(dynamicsPlan(settings), a, b, settings);
    case 'rubato':
      return evaluateCurve(rubatoPlan(settings), a, b, settings);
    case 'asynchrony':
      return evaluateCurve(asynchronyPlan(settings), a, b, settings);
    case 'accentuation':
      return evaluateCurve(accentuationPlan(settings), a, b, settings);
    case 'pedal':
      return evaluateCurve(pedalPlan(settings), a, b, settings);
    case 'articulation':
      return evaluateArticulation(a, b, settings);
    case 'ornamentation':
      return evaluateOrnamentation(a, b, settings);
    default:
      return evaluateImprecision(dimension, a, b, settings);
  }
}

/**
 * §6's script for one dimension over one (part, map) scope — all eleven of them.
 *
 * ## Two decisions this makes, both stated rather than buried
 *
 * **Pricing is RAW, never canonicalized.** §7.4's invariance modes rescale a curve by that
 * DOCUMENT's own moments, and an intermediate edit state is not a document — its moments move
 * as the script is applied, so a canonicalized `norm` would not be a fixed metric and
 * `scriptCost ≥ d_curve` would stop being the theorem AD-5 makes it. The identity pair is
 * therefore used throughout, and the `dCurve` reported beside a script is the identity one.
 *
 * **Both sides use the SAME `jnd`**, the row's resolved value, so `norm` is one function of the
 * pair. A per-side JND would make the telescoping sum meaningless.
 */
export function editScriptForDimension(
  dimension: ComparisonDimension,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
  options: EditScriptOptions = {},
): DimensionEditScript {
  switch (dimension) {
    case 'tempo':
      return curveEditScript(tempoPlan(settings), a, b, settings, options);
    case 'dynamics':
      return curveEditScript(dynamicsPlan(settings), a, b, settings, options);
    case 'rubato':
      return curveEditScript(rubatoPlan(settings), a, b, settings, options);
    case 'asynchrony':
      return curveEditScript(asynchronyPlan(settings), a, b, settings, options);
    case 'accentuation':
      return curveEditScript(accentuationPlan(settings), a, b, settings, options);
    case 'pedal':
      return curveEditScript(pedalPlan(settings), a, b, settings, options);
    case 'articulation':
      return stateEditScript(articulationEditPlan(a, settings), a, b, settings, options);
    case 'ornamentation':
      return stateEditScript(ornamentationEditPlan(a, b, settings), a, b, settings, options);
    default:
      return stateEditScript(imprecisionEditPlan(dimension, a, settings), a, b, settings, options);
  }
}

/** Knobs the edit path takes; the default is the shipped behaviour in every case. */
export interface EditScriptOptions {
  /**
   * Integrate each transition over the interval it can change rather than over the window.
   *
   * On by default and EXACT — `editState.affectedTicks` states the argument and the suite pins
   * the two forms bit-equal over the vendored corpus and the adversarial family. The `false`
   * mode is what that pin compares against, and it is the reason the flag exists: an
   * optimization whose reference has been deleted cannot be checked again.
   */
  readonly localize?: boolean;
  /** A-Q5's `fragment`/`consolidate` moves; off unless the caller asks (§6.1's `moves`). */
  readonly moves?: boolean;
}

/** One dimension's §6 script over one scope, with the lower bound it is a theorem about. */
export interface DimensionEditScript {
  readonly dimension: ComparisonDimension;
  readonly container: string;
  readonly script: EditScriptResult<EditInstruction>;
}

/**
 * What a dimension has to supply for §6, whatever shape its `Φ` is.
 *
 * `represent` reads ONE state — the reader the semantic level already uses, over the edit view —
 * and `norm` is that dimension's own `d_k` over a window. The curve dimensions fill this in from
 * their `CurvePlan`; the event and distribution ones fill it in directly, and none of them needs
 * a second reading of a map.
 */
interface EditPlan<S> {
  readonly dimension: ComparisonDimension;
  readonly container: string;
  readonly represent: (view: OrderedMapView | null, containsA: boolean) => S;
  readonly norm: (x: S, y: S, window: ComparisonWindow) => number;
  /**
   * Whether a transition may be integrated over `affectedTicks`' interval instead of the window.
   *
   * A predicate on the two ENDPOINT readings, because where it holds at all the answer can be a
   * property of the documents rather than of the dimension. Three dimensions answer `false`
   * unconditionally, each for its own reason:
   *
   * - `pedal` never localizes — `getPreviousPosition` scans BACKWARDS over entry indices for an
   *   inherited `@transition.to` (PARITY P2, AD-35.4's hazard class), so a movement can depend
   *   on an instruction before it and the left bound does not hold.
   * - `articulation` never localizes either, per AD-60.2. The id-anchored-atom argument was the
   *   first reason and it is not the binding one: AD-37.1's default step function is
   *   RETROACTIVE — its value on `[0, firstSwitchDate)` is the first switch's default — so
   *   editing a `<style>` reaches arbitrarily far LEFT, and its value after an interval is
   *   governed by the last switch at or before it, which the interval's right bound (the next
   *   unchanged INSTRUCTION, not the next unchanged SWITCH) need not contain. Hazard instance
   *   #7, and the first that fails in BOTH directions. Forcing it on was measured at
   *   `scriptCost = 506.9999999999999` against `d_articulation = 2583`, a 5.09× violation of
   *   `scriptCost ≥ d`, which is what any future attempt has to face.
   * - `ornamentation` never localizes — its map SCOPE is a whole-map property (AD-60.3) that a
   *   mixed state does not have.
   *
   * Where it does apply the argument is the same as for a curve and one step stronger: outside
   * the interval the two states' atoms are IDENTICAL, a monotone alignment matches identical
   * atoms at cost 0, and the global optimum therefore decomposes into that matching plus the
   * optimum over the interval.
   */
  readonly localize: (a: S, b: S) => boolean;
}

function stateEditScript<S>(
  plan: EditPlan<S>,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
  options: EditScriptOptions,
): DimensionEditScript {
  const viewA = viewOf(a, plan.container);
  const viewB = viewOf(b, plan.container);
  // The view's `element` is its map, which no reader consults; it exists so an edit view is a
  // complete `OrderedMapView` rather than a lookalike. Either document's map will do, and a
  // state with no instruction at all reads as the absent map it performs like.
  const fallback = viewA?.element ?? viewB?.element ?? null;

  const ticksPerQuarter = settings.ticksPerQuarter;
  const normWindow = (
    previous: readonly EditInstruction[],
    next: readonly EditInstruction[],
  ): ComparisonWindow => {
    const affected = affectedTicks(
      previous,
      next,
      settings.window.startQuarters * ticksPerQuarter,
      settings.window.endQuarters * ticksPerQuarter,
    );
    return {
      ...settings.window,
      startQuarters: affected.startTicks / ticksPerQuarter,
      endQuarters: affected.endTicks / ticksPerQuarter,
    };
  };

  const instructionsA = editInstructionsOf('a', viewA, resolutionOf(a));
  const instructionsB = editInstructionsOf('b', viewB, resolutionOf(b));
  const represent = (state: readonly EditInstruction[]): S =>
    plan.represent(
      editView(plan.container, state, fallback),
      state.some((instruction) => instruction.side === 'a'),
    );
  const localizable =
    options.localize !== false && plan.localize(represent(instructionsA), represent(instructionsB));

  const script = editScript<EditInstruction, S>(
    instructionsA,
    instructionsB,
    {
      represent,
      norm: (x, y, previous, next) =>
        plan.norm(x, y, localizable ? normWindow(previous, next) : settings.window),
    },
    { moves: options.moves },
  );

  return { dimension: plan.dimension, container: plan.container, script };
}

function curveEditScript<C>(
  plan: CurvePlan<C>,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
  options: EditScriptOptions,
): DimensionEditScript {
  const jnd = comparisonRowWith(plan.jndKey, settings.jnd).jnd;
  return stateEditScript(
    {
      dimension: plan.dimension,
      container: plan.container,
      represent: (view) => plan.readView(view, resolutionOf(a), 'a'),
      norm: (x, y, window) => plan.distance(x, y, jnd, IDENTITY_CANONICAL_PAIR, window).distance,
      localize: () => plan.dimension !== 'pedal',
    },
    a,
    b,
    settings,
    options,
  );
}

/**
 * §5.5's TWO components in one script (AD-55.1).
 *
 * `d_articulation` is the alignment optimum PLUS the `@defaultArticulation` step function, and
 * both are read off the same map: the atoms from its `<articulation>` elements, the steps from
 * its `<style>` switches. So one sequential script over the map's entries prices both, and
 * `directDistance` is the whole `d_articulation` rather than half of it — which is also why the
 * `<style>` switches have to be in the sequence.
 */
function articulationEditPlan(
  a: ScopeSide,
  settings: DimensionSettings,
): EditPlan<{ readonly atoms: ArticulationAtoms; readonly steps: DefaultArticulationCurve }> {
  const resolution = resolutionOf(a);
  return {
    dimension: 'articulation',
    container: ARTICULATION_MAP,
    represent: (view) => ({
      atoms: readArticulationAtoms(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
      ),
      steps: readDefaultArticulation(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
      ),
    }),
    norm: (x, y, window) =>
      articulationDistance(
        x.atoms,
        y.atoms,
        window,
        settings.ticksPerQuarter,
        settings.lambdaDate,
        settings.jnd,
      ).distance +
      defaultArticulationDistance(x.steps, y.steps, window, settings.ticksPerQuarter, settings.jnd)
        .distance,
    // NEVER, and the reason is measured rather than argued. `affectedTicks` bounds an interval
    // on the assumption that nothing outside it can change, and AD-37.1's default step function
    // breaks that assumption in BOTH directions: its value on `[0, firstSwitchDate)` is the
    // FIRST switch's default, so editing a `<style>` reaches arbitrarily far LEFT, and its value
    // after the interval is governed by the last switch at or before it, which the interval's
    // right bound (the next unchanged INSTRUCTION, not the next unchanged SWITCH) need not
    // contain. Measured on Telemann part 1: localized, `scriptCost` came out 108.89 against a
    // `directDistance` of 926.67 — the theorem `scriptCost ≥ d` violated, which is how the
    // hazard announced itself. Removing the step component from the norm and re-running restored
    // `scriptCost = directDistance` exactly on all three parts (46.67 / 23.33 / 5.00), which is
    // what identifies the step function rather than the alignment as the cause: the ALIGNMENT
    // half localizes soundly, and the third hazard-class instance in this cut is a reading that
    // depends on an instruction outside its own span.
    localize: () => false,
  };
}

/**
 * §5.6's atoms, with the map SCOPE decided so that both endpoints stay exact.
 *
 * `OrnamentationMap.apply` branches on whether a local header exists (AD-44's defect 8: in a
 * global map every `<style>` after the first successful one is ignored outright), so the scope
 * is a property of the MAP rather than of an entry — and a state holding instructions from both
 * documents has no single one. A state carrying any A instruction takes A's scope and a state
 * carrying none takes B's, which makes `S(0,0)` exactly `A` and `S(n,m)` exactly `B`; the mixed
 * states in between take A's, stated here rather than left to whichever branch happened to run.
 * `replayResidual` is the field that would show a document where this mattered, since a state
 * read under the wrong scope cannot reach `B`.
 */
function ornamentationEditPlan(
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): EditPlan<OrnamentAtoms> {
  const resolution = resolutionOf(a);
  const scopeOf = (side: ScopeSide) =>
    mapIsPartLocal(side, ORNAMENTATION_MAP) ? ('part' as const) : ('global' as const);
  return {
    dimension: 'ornamentation',
    container: ORNAMENTATION_MAP,
    represent: (view, containsA) =>
      readOrnamentAtoms(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
        containsA ? scopeOf(a) : scopeOf(b),
      ),
    norm: (x, y, window) =>
      ornamentationDistance(
        x,
        y,
        window,
        settings.ticksPerQuarter,
        settings.lambdaDate,
        settings.jnd,
      ).distance,
    localize: () => false,
  };
}

/** §5.9's spans, priced by the same `W₁` the semantic level uses, with invariance off. */
function imprecisionEditPlan(
  dimension: ComparisonDimension,
  a: ScopeSide,
  settings: DimensionSettings,
): EditPlan<ImprecisionReading> {
  const domain = dimension as ImprecisionDomain;
  const resolution = resolutionOf(a);
  return {
    dimension,
    container: IMPRECISION_MAPS[dimension],
    represent: (view) => readImprecisionSpans(view, domain, resolution.scaleFactor),
    norm: (x, y, window) =>
      imprecisionDistance(x, y, window, settings.ticksPerQuarter, 'none', settings.jnd).distance,
    localize: () => true,
  };
}

const TEMPO_MAP = 'tempoMap';
const DYNAMICS_MAP = 'dynamicsMap';
const RUBATO_MAP = 'rubatoMap';
const ASYNCHRONY_MAP = 'asynchronyMap';
const ACCENTUATION_MAP = 'metricalAccentuationMap';
const MOVEMENT_MAP = 'movementMap';
const ARTICULATION_MAP = 'articulationMap';
const ORNAMENTATION_MAP = 'ornamentationMap';

const IMPRECISION_MAPS: Readonly<Record<string, string>> = {
  imprecisionTiming: 'imprecisionMap.timing',
  imprecisionDynamics: 'imprecisionMap.dynamics',
  imprecisionDuration: 'imprecisionMap.toneduration',
};

function tempoPlan(settings: DimensionSettings): CurvePlan<TempoCurve> {
  return {
    dimension: 'tempo',
    container: TEMPO_MAP,
    jndKey: 'tempo/tempo@bpm',
    readView: (view, resolution, role) => {
      const curve = readTempoSegments(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
      );
      requirePositiveTempo(curve, role);
      return curve;
    },
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve) => (ticks) => Math.log(quarterBpmAt(curve, ticks)),
    // AD-1: tempo cannot reach `⊥` — an unresolvable level performs the renderer's own 100.0.
    bottomSpans: () => [],
    distance: (curveA, curveB, jnd, canonical, window) =>
      tempoDistance(curveA, curveB, window, settings.ticksPerQuarter, jnd, canonical),
    notes: (curve, role) =>
      curve.notes.map((note) => noteFrom('tempo', role, settings.ticksPerQuarter, note)),
  };
}

/**
 * §9.4's `qbpm ≤ 0` row (M11), checked where the curve is built.
 *
 * A transition between two positive endpoints stays positive, so the endpoints are the whole
 * check: a power interpolation of `qbpm0 > 0` and `qbpm1 > 0` cannot reach 0. The throw is the
 * interior's (§9.4 gives it the domain validators) and the facade types it.
 */
function requirePositiveTempo(curve: TempoCurve, role: 'a' | 'b'): void {
  for (const segment of curve.segments) {
    const values = segment.kind === 'constant' ? [segment.qbpm] : [segment.qbpm0, segment.qbpm1];
    for (const qbpm of values)
      if (!(qbpm > 0)) throw new NonPositiveTempoError(role, qbpm, segment.startTicks);
  }
}

function dynamicsPlan(settings: DimensionSettings): CurvePlan<DynamicsCurve> {
  return {
    dimension: 'dynamics',
    container: DYNAMICS_MAP,
    jndKey: 'dynamics/dynamics@volume',
    readView: (view, resolution) =>
      readDynamicsSegments(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
      ),
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve) => (ticks) => Math.log(volumeAt(curve, ticks)),
    bottomSpans: () => [],
    distance: (curveA, curveB, jnd, canonical, window) =>
      dynamicsDistance(curveA, curveB, window, settings.ticksPerQuarter, jnd, canonical),
    notes: (curve, role) =>
      curve.notes.map((note) => noteFrom('dynamics', role, settings.ticksPerQuarter, note)),
  };
}

function rubatoPlan(settings: DimensionSettings): CurvePlan<RubatoCurve> {
  return {
    dimension: 'rubato',
    container: RUBATO_MAP,
    jndKey: 'rubato/rubato@frameLength',
    readView: (view, resolution) =>
      readRubatoSegments(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
      ),
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve, startTicks, endTicks) =>
      rubatoBottomSpans(curve).some(
        (span) => span.startTicks < endTicks && span.endTicks > startTicks,
      )
        ? null
        : (ticks: number) => displacementTicksAt(curve, ticks) / settings.ticksPerQuarter,
    bottomSpans: (curve) => rubatoBottomSpans(curve),
    distance: (curveA, curveB, jnd, canonical, window) =>
      rubatoDistance(curveA, curveB, window, settings.ticksPerQuarter, jnd, canonical),
    notes: (curve, role) =>
      curve.notes.map((note) => noteFrom('rubato', role, settings.ticksPerQuarter, note)),
  };
}

function asynchronyPlan(settings: DimensionSettings): CurvePlan<AsynchronyCurve> {
  return {
    dimension: 'asynchrony',
    container: ASYNCHRONY_MAP,
    jndKey: 'asynchrony/asynchrony@milliseconds.offset',
    readView: (view, resolution) => readAsynchronySegments(view, resolution.scaleFactor),
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve, startTicks, endTicks) => {
      const hasBottom = curve.segments.some(
        (segment) =>
          isBottom(segment.offset) &&
          segment.startTicks < endTicks &&
          segment.endTicks > startTicks,
      );
      if (hasBottom) return null;
      return (ticks: number) => {
        const value = offsetAt(curve, ticks);
        return isBottom(value) ? 0 : value.value;
      };
    },
    bottomSpans: (curve) => curve.segments.filter((segment) => isBottom(segment.offset)),
    distance: (curveA, curveB, jnd, canonical, window) =>
      asynchronyDistance(curveA, curveB, window, settings.ticksPerQuarter, canonical, jnd),
    notes: (curve, role) =>
      curve.notes.map((note) => noteFrom('asynchrony', role, settings.ticksPerQuarter, note)),
  };
}

function accentuationPlan(settings: DimensionSettings): CurvePlan<AccentuationCurve> {
  const grid = settings.beatGrid ?? rendererDefaultBeatGrid();
  return {
    dimension: 'accentuation',
    container: ACCENTUATION_MAP,
    jndKey: 'accentuation/accentuationPattern@scale',
    readView: (view, resolution) =>
      readAccentuationSegments(
        view,
        resolution.scaleFactor,
        resolution.environment,
        resolution.globalEnvironment,
        grid,
      ),
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve) => accentuationSampler(curve, settings.window, settings.ticksPerQuarter, grid),
    bottomSpans: (curve) => curve.segments.filter((segment) => segment.pattern.kind === 'bottom'),
    distance: (curveA, curveB, jnd, canonical, window) =>
      accentuationDistance(curveA, curveB, window, settings.ticksPerQuarter, grid, jnd, canonical),
    notes: (curve, role) =>
      curve.notes.map((note) => noteFrom('accentuation', role, settings.ticksPerQuarter, note)),
    timeSignatureSource: (curveA) => curveA.timeSignatureSource,
  };
}

function pedalPlan(settings: DimensionSettings): CurvePlan<PedalCurve> {
  return {
    dimension: 'pedal',
    container: MOVEMENT_MAP,
    jndKey: 'pedal/movement@position',
    readView: (view, resolution) => readMovementSegments(view, resolution.scaleFactor),
    breakpoints: (curve) => curve.breakpointsTicks,
    sampler: (curve) => pedalSampler(curve, settings.window, settings.ticksPerQuarter),
    bottomSpans: (curve) => curve.segments.filter((segment) => segment.shape.kind === 'bottom'),
    distance: (curveA, curveB, jnd, canonical, window) =>
      pedalDistance(curveA, curveB, window, settings.ticksPerQuarter, jnd, canonical),
    notes: (curve, role) => [
      ...curve.notes.map((note) => noteFrom('pedal', role, settings.ticksPerQuarter, note)),
      ...controllerNotes(curve, role, settings),
    ],
  };
}

/**
 * §5.8's structural channel for `@controller`, which AD-36.3 named and nothing emitted.
 *
 * The attribute is excluded from the metric because it says WHICH controller carries the curve
 * and not what the curve does — the reader's spans are deliberately flat across controllers
 * (AD-13/R9). But two documents driving `sustain` and `soft` do perform differently, and until
 * this note existed `PedalCurve.controllers` was computed and read by nothing, so the exclusion's
 * stated channel did not fire. AD-55.1's obligation is what surfaced it.
 *
 * Silent for the ordinary document: a map that drives only `sustain` is the default and saying
 * so on every report would bury the case that matters.
 */
function controllerNotes(
  curve: PedalCurve,
  role: 'a' | 'b',
  settings: DimensionSettings,
): readonly RawNote[] {
  const controllers = curve.controllers;
  if (controllers.length === 0) return [];
  if (controllers.length === 1 && controllers[0] === DEFAULT_CONTROLLER) return [];
  return [
    {
      kind: 'structural',
      dimension: 'pedal',
      document: role,
      startQuarters: settings.window.startQuarters,
      endQuarters: settings.window.endQuarters,
      message:
        `the movementMap drives ${controllers.map((name) => `'${name}'`).join(', ')}: ` +
        '@controller is excluded from the metric as a name (§4, AD-36.3) and the spans are flat ' +
        'across controllers (AD-13/R9), so a document driving a different controller is reported ' +
        'here rather than priced',
    },
  ];
}

// --- the event dimensions ---------------------------------------------------

/**
 * The two event dimensions share everything but their reader and their findings, and the shared
 * part is where AD-7's `κ` and §9.3's `events` block come from.
 *
 * `continuous` is articulation's default step function (AD-55.1) and is empty for ornamentation:
 * a dimension can carry BOTH an atomic and an absolutely continuous part, which is what §5.0's
 * measure already says and what `d_k = alignment optimum + step mass` needs here.
 */
function eventEvaluation(
  dimension: ComparisonDimension,
  settings: DimensionSettings,
  result: {
    readonly distance: number;
    readonly matched: number;
    readonly unmatchedA: number;
    readonly unmatchedB: number;
    readonly atoms: readonly EventAtomMass[];
    readonly cappedAnchors: number;
  },
  rowDistances: readonly { readonly key: ComparisonJndKey; readonly distance: number }[],
  notes: readonly RawNote[],
  datePositionKnown: boolean,
  continuous: {
    readonly distance: number;
    readonly cells: readonly EvaluationCell[];
    readonly cappedCells: number;
  } = { distance: 0, cells: [], cappedCells: 0 },
): DimensionEvaluation {
  const requested = settings.invariance[dimension];
  return {
    dimension,
    distance: result.distance + continuous.distance,
    cells: continuous.cells,
    atoms: result.atoms,
    signedAt: null,
    meanSigned: null,
    valueA: null,
    valueB: null,
    pairGridQuarters: [],
    // Event dimensions accumulate over rows in four different units (§5.5: quarters, ms,
    // velocity, ratio), so there is no single T-space unit for a signed mean to be in — which
    // is also why §9.3's `meanSigned` is null here rather than 0.
    unit: 'dimensionless',
    space: 'event',
    decomposition: null,
    events: {
      matched: result.matched,
      unmatchedA: result.unmatchedA,
      unmatchedB: result.unmatchedB,
      mass: result.distance,
    },
    bottomLengthQuarters: 0,
    // §9.3's `cappedCells` counts CELLS for a curve dimension and ANCHORS here — the unit the
    // dimension's density is carried in either way (AD-54.2). Articulation now has both parts,
    // so it reports both counts added: the field is a count of CAP EVENTS, and a reader who
    // needs to know which component capped has the `capped` note's dimension and the two
    // components' own shapes.
    cappedCells: result.cappedAnchors + continuous.cappedCells,
    rowDistances,
    notes,
    timeSignatureSource: null,
    datePositionKnown,
    // AD-20 makes 'level'/'level-gain' an InvalidOptionError on an event dimension, which the
    // facade raises before this runs; reaching here with one would be an engine invariant.
    invariance: requested,
    shapeless: false,
  };
}

function evaluateArticulation(
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): DimensionEvaluation {
  const read = (side: ScopeSide): ArticulationAtoms =>
    readArticulationAtoms(
      viewOf(side, ARTICULATION_MAP),
      side.document.scaleFactor,
      side.scope.environment,
      side.document.performance.global,
    );
  const readDefault = (side: ScopeSide): DefaultArticulationCurve =>
    readDefaultArticulation(
      viewOf(side, ARTICULATION_MAP),
      side.document.scaleFactor,
      side.scope.environment,
      side.document.performance.global,
    );
  const atomsA = read(a);
  const atomsB = read(b);
  const result = articulationDistance(
    atomsA,
    atomsB,
    settings.window,
    settings.ticksPerQuarter,
    settings.lambdaDate,
    settings.jnd,
  );

  // AD-55.1's second component: `<style>@defaultArticulation` governs every note that carries
  // no atom of its own, so it is a step function over score time and it is priced as one.
  const defaultA = readDefault(a);
  const defaultB = readDefault(b);
  const step = defaultArticulationDistance(
    defaultA,
    defaultB,
    settings.window,
    settings.ticksPerQuarter,
    settings.jnd,
  );

  const notes: RawNote[] = [
    ...atomsA.notes.map((note) => noteFrom('articulation', 'a', settings.ticksPerQuarter, note)),
    ...atomsB.notes.map((note) => noteFrom('articulation', 'b', settings.ticksPerQuarter, note)),
    ...defaultA.notes.map((note) => noteFrom('articulation', 'a', settings.ticksPerQuarter, note)),
    ...defaultB.notes.map((note) => noteFrom('articulation', 'b', settings.ticksPerQuarter, note)),
    ...result.inertFindings.map((finding): RawNote => {
      const quarters = finding.dateTicks / settings.ticksPerQuarter;
      return {
        kind: 'inert-difference',
        dimension: 'articulation',
        document: null,
        startQuarters: quarters,
        endQuarters: quarters,
        message:
          `@${finding.attribute} differs (${String(finding.a)} against ${String(finding.b)}) and ` +
          'is read by nothing (R14/R9b): reported, never priced',
      };
    }),
  ];
  if (!result.pinsHonoured)
    notes.push({
      kind: 'structural',
      dimension: 'articulation',
      document: null,
      startQuarters: settings.window.startQuarters,
      endQuarters: settings.window.endQuarters,
      message:
        'the two documents carry the same note ids in opposite order, which no monotone ' +
        'alignment can honour; the pins were dropped wholesale and the unpinned optimum used',
    });
  if (!result.datePositionKnown)
    notes.push({
      kind: 'estimate-degradation',
      dimension: 'articulation',
      document: null,
      startQuarters: settings.window.startQuarters,
      endQuarters: settings.window.endQuarters,
      message:
        'id-anchored articulations are window-EXEMPT (AD-39.1): they are never dropped by a ' +
        'narrowed window, and without an MSM their mass is spread over the whole window ' +
        'because the note they target has no known date',
    });

  return eventEvaluation(
    'articulation',
    settings,
    result,
    [
      {
        key: 'articulation/articulation@relativeDuration',
        distance: result.distance + step.distance,
      },
    ],
    notes,
    result.datePositionKnown,
    {
      distance: step.distance,
      cells: step.cells.map((cell) => ({
        startQuarters: cell.startQuarters,
        endQuarters: cell.endQuarters,
        mass: cell.mass,
        densityAt: () => cell.densityPerQuarter,
      })),
      cappedCells: step.cappedCells,
    },
  );
}

function evaluateOrnamentation(
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): DimensionEvaluation {
  const read = (side: ScopeSide): OrnamentAtoms =>
    readOrnamentAtoms(
      viewOf(side, ORNAMENTATION_MAP),
      side.document.scaleFactor,
      side.scope.environment,
      side.document.performance.global,
      mapIsPartLocal(side, ORNAMENTATION_MAP) ? 'part' : 'global',
    );
  const atomsA = read(a);
  const atomsB = read(b);
  const result = ornamentationDistance(
    atomsA,
    atomsB,
    settings.window,
    settings.ticksPerQuarter,
    settings.lambdaDate,
    settings.jnd,
  );

  const notes: RawNote[] = [
    ...atomsA.notes.map((note) => noteFrom('ornamentation', 'a', settings.ticksPerQuarter, note)),
    ...atomsB.notes.map((note) => noteFrom('ornamentation', 'b', settings.ticksPerQuarter, note)),
    ...result.findings.map((finding): RawNote => {
      const quarters = finding.dateTicks / settings.ticksPerQuarter;
      return {
        kind: 'structural',
        dimension: 'ornamentation',
        document: null,
        startQuarters: quarters,
        endQuarters: quarters,
        message: `${finding.kind}: '${finding.a}' against '${finding.b}'`,
      };
    }),
  ];

  return eventEvaluation(
    'ornamentation',
    settings,
    result,
    [{ key: 'ornamentation/dynamicsGradient@transition.to', distance: result.distance }],
    notes,
    true,
  );
}

// --- the distribution dimensions --------------------------------------------

function evaluateImprecision(
  dimension: ComparisonDimension,
  a: ScopeSide,
  b: ScopeSide,
  settings: DimensionSettings,
): DimensionEvaluation {
  const domain = dimension as ImprecisionDomain;
  const container = IMPRECISION_MAPS[dimension];
  const read = (side: ScopeSide): ImprecisionReading =>
    readImprecisionSpans(viewOf(side, container), domain, side.document.scaleFactor);
  const readingA = read(a);
  const readingB = read(b);

  const result = imprecisionDistance(
    readingA,
    readingB,
    settings.window,
    settings.ticksPerQuarter,
    settings.invariance[dimension],
    settings.jnd,
  );

  const row = comparisonRowFor(marginalKey(domain));
  const startTicks = settings.window.startQuarters * settings.ticksPerQuarter;
  const endTicks = settings.window.endQuarters * settings.ticksPerQuarter;

  const notes: RawNote[] = [
    ...readingA.notes.map((note) => noteFrom(dimension, 'a', settings.ticksPerQuarter, note)),
    ...readingB.notes.map((note) => noteFrom(dimension, 'b', settings.ticksPerQuarter, note)),
  ];

  return {
    dimension,
    distance: result.distance,
    cells: result.cells.map((cell) => ({
      startQuarters: cell.startQuarters,
      endQuarters: cell.endQuarters,
      mass: cell.mass,
      densityAt: cell.densityAt,
    })),
    atoms: [],
    // A law has a location but not a curve: the signed descriptor is the μ-weighted mean of
    // `ℓ_A − ℓ_B`, which the decomposition already computes, and there is no pointwise signed
    // density to profile — §9.3's `valueA`/`valueB` are null for the distribution dimensions.
    signedAt: null,
    // A law has a location rather than a curve, and the μ-weighted mean of `ℓ_A − ℓ_B` is the
    // same quantity a curve dimension's signed mean is — the decomposition already has it.
    meanSigned: result.decomposition.locationSigned,
    valueA: null,
    valueB: null,
    pairGridQuarters: result.cells.flatMap((cell) => [cell.startQuarters, cell.endQuarters]),
    unit: row.unit,
    space: row.space.kind,
    decomposition: imprecisionDecomposition(result.decomposition),
    events: EMPTY_EVENTS,
    bottomLengthQuarters:
      coveredLength(
        [
          ...readingA.spans.filter((span) => isBottom(span.law)),
          ...readingB.spans.filter((span) => isBottom(span.law)),
        ],
        startTicks,
        endTicks,
      ) / settings.ticksPerQuarter,
    cappedCells: result.cells.filter((cell) => cell.capped).length,
    rowDistances: [
      { key: marginalKey(domain), distance: result.distance - result.processDistance },
      { key: processKey(domain), distance: result.processDistance },
    ],
    notes,
    timeSignatureSource: null,
    datePositionKnown: true,
    invariance: result.invariance,
    shapeless: result.decomposition.shapeless,
  };
}

function marginalKey(domain: ImprecisionDomain): ComparisonJndKey {
  return `${domain}/distribution.uniform@limit.upper` as ComparisonJndKey;
}

function processKey(domain: ImprecisionDomain): ComparisonJndKey {
  return `${domain}/distribution.correlated.brownianNoise@stepWidth.max` as ComparisonJndKey;
}

/**
 * §5.9's `W₂` decomposition in §1.2's shape.
 *
 * `shape` is `√(2(1 − ρ))` here, as it is for the curve dimensions, rather than the
 * `√∫2σ_Aσ_B(1−ρ)dμ` term the imprecision module accumulates: §9.3 declares one meaning for
 * the field across every dimension, and a field that meant two things would be the kind of
 * quiet unit mismatch §1.2 spends a paragraph on. The module's own term is recoverable from
 * `l2Squared` and the other three.
 */
function imprecisionDecomposition(
  decomposition: ImprecisionDecomposition,
): EvaluationDecomposition {
  return {
    level: decomposition.location,
    levelSigned: decomposition.locationSigned,
    gain: decomposition.spread,
    shape: decomposition.rho === null ? null : Math.sqrt(Math.max(0, 2 * (1 - decomposition.rho))),
    r: decomposition.rho,
    shapeless: decomposition.shapeless,
    l2Squared: decomposition.w2 * decomposition.w2,
  };
}

/** The map container each dimension reads — §3's correspondence, as a lookup. */
export function containerOf(dimension: ComparisonDimension): string {
  switch (dimension) {
    case 'tempo':
      return TEMPO_MAP;
    case 'dynamics':
      return DYNAMICS_MAP;
    case 'rubato':
      return RUBATO_MAP;
    case 'asynchrony':
      return ASYNCHRONY_MAP;
    case 'accentuation':
      return ACCENTUATION_MAP;
    case 'pedal':
      return MOVEMENT_MAP;
    case 'articulation':
      return ARTICULATION_MAP;
    case 'ornamentation':
      return ORNAMENTATION_MAP;
    default:
      return IMPRECISION_MAPS[dimension];
  }
}

/** Whether a scope carries any entry at all in a dimension's map — §9.3's `both-neutral`. */
export function hasEntries(side: ScopeSide, dimension: ComparisonDimension): boolean {
  const view = viewOf(side, containerOf(dimension));
  return view !== null && view.entries.length > 0;
}

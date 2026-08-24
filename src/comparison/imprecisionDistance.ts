/**
 * The imprecision deviation density and its integral.
 *
 * `p(t) = W₁(law_A(t), law_B(t)) / jnd_row`, capped, and `d_k` is its integral over the
 * window. The headline is duration-proportional by construction: a difference contributes in
 * proportion to how long it is performed, pinned by the fixture in this module's tests on a
 * one-bar span against a whole-piece one.
 *
 * ## Why the integral is exact and the cap is a `Math.min`
 *
 * Both readings are piecewise CONSTANT in `t`, so once the refinement grid carries every span
 * edge of both documents, the density is constant on each cell and the integral over a cell is
 * `density × length` — exact, with no quadrature in the time domain at all. All of this
 * dimension's numerical error lives inside `W₁`, where it is measured per family
 * (`distributions.ts`).
 *
 * That is also why the cap appears here as a `Math.min` rather than as
 * `integrateCappedAbsolute`. The rule is structural — ANY `⊥` route into a dimension forces
 * the capped integrator — and the `⊥` routes are real here (seven of them, measured; see
 * `imprecisionLaws.ts`). But `integrateCappedAbsolute` resolves the CORNER a cap puts into a
 * continuously varying density, and a constant density has no corner; capping the constant is
 * `localDistance`'s own operation, and the two are tested to agree.
 *
 * ## Three components, and only the first two are distances
 *
 * 1. The marginal, above — `W₁` between the declared laws.
 * 2. `processParameters` — `stepWidth.max`, `degreeOfCorrelation` and, for the
 *    correlated families only, `milliseconds.timingBasis`. Priced through the capped local
 *    metric per row, sustained over the cell exactly as the marginal is; present on one side
 *    only reads `⊥`. A separate component because the marginal does not characterize the
 *    process — for these two families a measured finding, since their marginal is
 *    index-dependent (`imprecisionLaws.ts`'s `CORRELATED_MARGINAL_NOTE`).
 * 3. The `W₂` decomposition, which is interpretive and never enters `d_k`.
 */
import { pairwise } from '../prelude/index.js';
import { CompensatedSum, gaussLegendre10 } from './quadrature.js';
import {
  comparisonRowAt,
  type JndOverrides,
  localDistance,
  type ComparisonRegistryRow,
} from './registry.js';
import {
  affineLaw,
  quantile,
  wasserstein1,
  wasserstein2Decomposition,
  type ImprecisionLaw,
} from './distributions.js';
import { bottom, isBottom, valued, type Valued } from './values.js';
import {
  lawAt,
  processParametersAt,
  type ImprecisionDomain,
  type ImprecisionReading,
  type ProcessParameter,
} from './imprecisionLaws.js';
import type { ComparisonWindow } from './window.js';
import type { InvarianceMode } from './decomposition.js';

/**
 * Which registry row prices each process parameter.
 *
 * `milliseconds.timingBasis` has a row on every distribution element, but only the two correlated
 * ones file it as `process` and the reader only emits it for those. The brownian row is named
 * here because both correlated rows carry the same unit, JND and δ, so which supplies the
 * constants cannot change a number.
 */
const PROCESS_ROW_ELEMENTS: ReadonlyMap<string, string> = new Map([
  ['stepWidth.max', 'distribution.correlated.brownianNoise'],
  ['degreeOfCorrelation', 'distribution.correlated.compensatingTriangle'],
  ['milliseconds.timingBasis', 'distribution.correlated.brownianNoise'],
]);

/**
 * A law's structural signature, for memoizing `W₁` and `W₂` across the cells of one grid.
 *
 * The grid is the UNION of both documents' span edges, so one document's span is routinely split
 * into several cells by the other's, and every one asks for the same pair of laws — 1.5 ms of
 * `W₁` and 4.7 ms of `W₂` per repetition on a Gaussian pair. The cache lives for one call rather
 * than at module scope, where an unbounded cache would be a leak.
 */
function lawSignature(law: ImprecisionLaw): string {
  switch (law.kind) {
    case 'delta':
      return `d:${String(law.at)}`;
    case 'uniform':
      return `u:${String(law.lower)}:${String(law.upper)}`;
    case 'triangular':
      return `t:${String(law.lower)}:${String(law.upper)}:${String(law.mode)}`;
    case 'gaussian':
      return `g:${String(law.sigma)}:${String(law.lower)}:${String(law.upper)}:${String(law.center)}`;
    case 'list':
      return `l:${law.values.join(',')}`;
    case 'clipped':
      return `c:${String(law.lower)}:${String(law.upper)}:${lawSignature(law.base)}`;
  }
}

/** A row with `options.jnd` applied, for the two lookups this module makes by (element, attribute). */
function withOverride(row: ComparisonRegistryRow, jnd: JndOverrides): ComparisonRegistryRow {
  const override = jnd[row.key];
  return override === undefined ? row : { ...row, jnd: override };
}

/** The row that carries this dimension's law — its unit, JND and δ. */
function marginalRow(domain: ImprecisionDomain, jnd: JndOverrides = {}): ComparisonRegistryRow {
  const row = comparisonRowAt(domain, 'distribution.uniform', 'limit.upper');
  if (row === null) throw new Error(`no marginal row for ${domain}`);
  return withOverride(row, jnd);
}

function processRow(
  domain: ImprecisionDomain,
  attribute: string,
  jnd: JndOverrides = {},
): ComparisonRegistryRow {
  const element = PROCESS_ROW_ELEMENTS.get(attribute);
  const row = element === undefined ? null : comparisonRowAt(domain, element, attribute);
  if (row === null) throw new Error(`no process row for ${domain}/${attribute}`);
  return withOverride(row, jnd);
}

/**
 * the capped local metric, on two LAWS instead of two numbers.
 *
 * `d(x, ⊥) = δ_row` and `d(⊥, ⊥) = 0` are the capped metric's, unchanged; the value-value case is
 * `min(W₁/jnd, 2·δ_row)`. Truncating a metric leaves a metric and `W₁` is one, so the axioms
 * survive exactly as they do for `localDistance` — which is what keeps the triangle inequality
 * intact when a `⊥` document is the middle term.
 */
export function lawDistance(
  row: ComparisonRegistryRow,
  a: Valued<ImprecisionLaw>,
  b: Valued<ImprecisionLaw>,
  memo?: Map<string, number>,
): { readonly distance: number; readonly capped: boolean } {
  if (isBottom(a) || isBottom(b)) {
    if (isBottom(a) && isBottom(b)) return { distance: 0, capped: false };
    return { distance: row.delta, capped: true };
  }
  const cap = 2 * row.delta;
  const raw = memoized(memo, a.value, b.value, wasserstein1) / row.jnd;
  if (!(raw < cap)) return { distance: cap, capped: true };
  return { distance: raw, capped: false };
}

/**
 * `compute(a, b)` through a per-call cache, keyed on the ORDERED pair.
 *
 * Ordered rather than canonicalized: `W₁` is symmetric to the last bit and tested to be, but
 * caching the reversed pair under one key would make that symmetry a property of the cache, where
 * The symmetry property claims it of the function.
 */
function memoized(
  memo: Map<string, number> | undefined,
  a: ImprecisionLaw,
  b: ImprecisionLaw,
  compute: (a: ImprecisionLaw, b: ImprecisionLaw) => number,
): number {
  if (memo === undefined) return compute(a, b);
  const key = `${lawSignature(a)}|${lawSignature(b)}`;
  const cached = memo.get(key);
  if (cached !== undefined) return cached;
  const value = compute(a, b);
  memo.set(key, value);
  return value;
}

export interface ImprecisionCell {
  readonly startTicks: number;
  readonly endTicks: number;
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** `W₁/jnd`, capped — the density, constant across the cell. */
  readonly density: number;
  /** The `processParameters` component's density, also constant across the cell. */
  readonly processDensity: number;
  readonly mass: number;
  readonly capped: boolean;
  /**
   * `p_imprecision(t)` in JND per quarter, at a position in QUARTERS — the integrand
   * this cell's mass was computed from, exposed so the caller can root-refine segment boundaries
   * rather than quantize them to cells. `mass` remains the authority.
   */
  readonly densityAt: (quarters: number) => number;
}

export interface ImprecisionDecomposition {
  /** `√∫(ℓ_A − ℓ_B)² dμ` — the location term. */
  readonly location: number;
  /**
   * `∫(ℓ_A − ℓ_B) dμ` — the SIGNED location difference, in the row's unit.
   *
   * A descriptor and never a distance: `location` cannot say which side runs late,
   * and a document late in one half and early in the other is exactly the case where the
   * unsigned term and the signed one disagree. It negates under the a/b swap.
   */
  readonly locationSigned: number;
  /** `√∫(σ_A − σ_B)² dμ` — the spread term. */
  readonly spread: number;
  /** `√∫2σ_Aσ_B(1 − ρ) dμ` — the distributional-shape term, or 0 where every cell is flat. */
  readonly shape: number;
  /** The μ-weighted mean of ρ over the cells that have one, or null when none does. */
  readonly rho: number | null;
  /** True where no cell had two spreads to correlate — the `shapeless` companion. */
  readonly shapeless: boolean;
  /** `√∫W₂² dμ`, the quantity the three terms must reconstruct. */
  readonly w2: number;
  /** `|∫W₂² dμ − (location² + spread² + shape²)|` — the closing check. */
  readonly closingResidual: number;
}

export interface ImprecisionDistanceResult {
  readonly distance: number;
  readonly mean: number | null;
  readonly cells: readonly ImprecisionCell[];
  readonly jnd: number;
  readonly capped: boolean;
  /** The `processParameters` component's own total, already included in `distance`. */
  readonly processDistance: number;
  readonly decomposition: ImprecisionDecomposition;
  readonly invariance: InvarianceMode;
}

/** The sorted, deduplicated union of both readings' span edges, clipped to the window. */
export function imprecisionGridTicks(
  a: ImprecisionReading,
  b: ImprecisionReading,
  window: ComparisonWindow,
  ticksPerQuarter: number,
): readonly number[] {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  if (!(endTicks > startTicks)) return [];

  const points = new Set<number>([startTicks, endTicks]);
  for (const breakpoint of [...a.breakpointsTicks, ...b.breakpointsTicks])
    if (breakpoint > startTicks && breakpoint < endTicks) points.add(breakpoint);
  for (const span of [...a.spans, ...b.spans])
    for (const edge of [span.startTicks, span.endTicks])
      if (edge > startTicks && edge < endTicks) points.add(edge);

  return [...points].sort((x, y) => x - y);
}

/**
 * `d_imprecision` over the window, plus the interpretive decomposition.
 *
 * The law is read at each cell's LEFT EDGE, which is sound because the grid carries every span
 * edge of both readings: no span boundary falls strictly inside a cell, so the left edge's law
 * is the cell's law throughout. Right-continuity makes the left edge the correct probe —
 * an imprecision span governs from its own date.
 */
export function imprecisionDistance(
  a: ImprecisionReading,
  b: ImprecisionReading,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  invariance: InvarianceMode = 'none',
  jnd: JndOverrides = {},
): ImprecisionDistanceResult {
  if (a.domain !== b.domain)
    throw new Error(`imprecisionDistance: ${a.domain} against ${b.domain}`);

  const row = marginalRow(a.domain, jnd);
  const grid = imprecisionGridTicks(a, b, window, ticksPerQuarter);
  const canonical = canonicalizers(a, b, grid, ticksPerQuarter, invariance);

  const w1Memo = new Map<string, number>();
  const w2Memo = new Map<string, ReturnType<typeof wasserstein2Decomposition>>();

  const cells: ImprecisionCell[] = [];
  const total = new CompensatedSum();
  const processTotal = new CompensatedSum();
  let anyCapped = false;

  // the decomposition runs on the NORMALIZED measure dμ = w dt / ∫w, so its accumulators are
  // kept apart from the headline's and divided at the end; the unnormalized measure would
  // silently change ℓ's unit.
  const locationSquared = new CompensatedSum();
  const locationSum = new CompensatedSum();
  const spreadSquared = new CompensatedSum();
  const shapeSquared = new CompensatedSum();
  const w2Squared = new CompensatedSum();
  const rhoWeighted = new CompensatedSum();
  let rhoWeight = 0;
  let windowLength = 0;

  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;
    if (!(lengthQuarters > 0)) continue;
    windowLength += lengthQuarters;

    const lawA = canonical.a(lawAt(a, cellStart));
    const lawB = canonical.b(lawAt(b, cellStart));
    const marginal = lawDistance(row, lawA, lawB, w1Memo);

    const process = processDistanceOf(
      a.domain,
      processParametersAt(a, cellStart),
      processParametersAt(b, cellStart),
      jnd,
    );

    const density = marginal.distance;
    const mass = (density + process.distance) * lengthQuarters;
    if (marginal.capped || process.capped) anyCapped = true;
    total.add(mass);
    processTotal.add(process.distance * lengthQuarters);
    cells.push({
      startTicks: cellStart,
      endTicks: cellEnd,
      startQuarters: cellStart / ticksPerQuarter,
      endQuarters: cellEnd / ticksPerQuarter,
      density,
      processDensity: process.distance,
      mass,
      capped: marginal.capped || process.capped,
      // Both components are piecewise CONSTANT in `t`, since the grid carries every span edge.
      densityAt: () => density + process.distance,
    });

    // A `⊥` span has no moments to take — the terms are integrals of means and spreads — so
    // the cell drops out of the decomposition while still carrying its δ_row in the headline, the
    // same split `accentuationSampler` and `pedalSampler` make.
    if (isBottom(lawA) || isBottom(lawB)) continue;
    const w2Key = `${lawSignature(lawA.value)}|${lawSignature(lawB.value)}`;
    let parts = w2Memo.get(w2Key);
    if (parts === undefined) {
      parts = wasserstein2Decomposition(lawA.value, lawB.value);
      w2Memo.set(w2Key, parts);
    }
    locationSquared.add(parts.location * parts.location * lengthQuarters);
    // `meanA − meanB` rather than a second signed field on `W2Decomposition`: the moments are
    // already there and the sign is the whole content of the descriptor.
    locationSum.add((parts.meanA - parts.meanB) * lengthQuarters);
    spreadSquared.add(parts.spread * parts.spread * lengthQuarters);
    shapeSquared.add(parts.shape * parts.shape * lengthQuarters);
    w2Squared.add(parts.w2 * parts.w2 * lengthQuarters);
    if (parts.rho !== null) {
      rhoWeighted.add(parts.rho * lengthQuarters);
      rhoWeight += lengthQuarters;
    }
  }

  const normalizer = windowLength > 0 ? windowLength : 1;
  const location = Math.sqrt(Math.max(0, locationSquared.total / normalizer));
  const locationSigned = locationSum.total / normalizer;
  const spread = Math.sqrt(Math.max(0, spreadSquared.total / normalizer));
  const shape = Math.sqrt(Math.max(0, shapeSquared.total / normalizer));
  const w2 = Math.sqrt(Math.max(0, w2Squared.total / normalizer));
  const assembled = location * location + spread * spread + shape * shape;

  const length = window.endQuarters - window.startQuarters;
  return {
    distance: total.total,
    mean: length > 0 ? total.total / length : null,
    cells,
    jnd: row.jnd,
    capped: anyCapped,
    processDistance: processTotal.total,
    decomposition: {
      location,
      locationSigned,
      spread,
      shape,
      rho: rhoWeight > 0 ? rhoWeighted.total / rhoWeight : null,
      shapeless: rhoWeight === 0,
      w2,
      closingResidual: Math.abs(w2 * w2 - assembled),
    },
    invariance,
  };
}

/**
 * the `processParameters` component for one cell.
 *
 * The union of both sides' parameter names, each priced by the capped metric on its own row. A
 * parameter one side declares and the other does not is `⊥` rather than a difference from some
 * neutral: there is no "stepWidth.max = 0 means no process" reading — 0 freezes the walk, a
 * correlation of 1 and a perfectly definite behaviour — so absence is genuinely incomparable,
 * the test for `⊥`. The opposite disposition from the ornament sub-elements, where
 * a neutral parameterization reproduces absence exactly.
 */
function processDistanceOf(
  domain: ImprecisionDomain,
  a: readonly ProcessParameter[],
  b: readonly ProcessParameter[],
  jnd: JndOverrides,
): { readonly distance: number; readonly capped: boolean } {
  if (a.length === 0 && b.length === 0) return { distance: 0, capped: false };

  const byName = (parameters: readonly ProcessParameter[]): ReadonlyMap<string, number> =>
    new Map(parameters.map((parameter) => [parameter.attribute, parameter.value]));
  const left = byName(a);
  const right = byName(b);

  const total = new CompensatedSum();
  let capped = false;
  for (const attribute of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const row = processRow(domain, attribute, jnd);
    const leftValue = left.get(attribute);
    const rightValue = right.get(attribute);
    const local = localDistance(
      row,
      leftValue === undefined ? bottom('renderer-error') : valued(leftValue),
      rightValue === undefined ? bottom('renderer-error') : valued(rightValue),
    );
    if (local.capped) capped = true;
    total.add(local.distance);
  }
  return { distance: total.total, capped };
}

/**
 * the invariance, per document — the canonicalization each side's laws pass through.
 *
 * `'level'` is a location shift of the law: each document's laws are shifted by minus the
 * span-weighted mean of their own means, so a systematic offset — a roll read late throughout, a
 * machine with a constant lag — stops being a difference. Metric-safe for the same reason the
 * curve modes are: the canonicalization is per document and never pair-dependent.
 *
 * `'level-gain'` additionally normalizes the spread, which the design states generally ("centered and
 * σ-normalized per document") without qualifying it by dimension, and which for a law is exactly
 * `X ↦ (X − ℓ)/σ`. Neither a ruling nor the renderer settles this reading — the design names the
 * distribution case only for `'level'` — so the words are read literally here.
 *
 * A document whose span-weighted spread is 0 — every span `δ₀`, the ordinary case for a document
 * with no imprecision at all — is left unscaled and marked shapeless (the `σ = 0` rule).
 */
function canonicalizers(
  a: ImprecisionReading,
  b: ImprecisionReading,
  grid: readonly number[],
  ticksPerQuarter: number,
  mode: InvarianceMode,
): {
  a: (law: Valued<ImprecisionLaw>) => Valued<ImprecisionLaw>;
  b: (law: Valued<ImprecisionLaw>) => Valued<ImprecisionLaw>;
} {
  if (mode === 'none') {
    const identity = (law: Valued<ImprecisionLaw>): Valued<ImprecisionLaw> => law;
    return { a: identity, b: identity };
  }
  return {
    a: canonicalizerFor(a, grid, ticksPerQuarter, mode),
    b: canonicalizerFor(b, grid, ticksPerQuarter, mode),
  };
}

function canonicalizerFor(
  reading: ImprecisionReading,
  grid: readonly number[],
  ticksPerQuarter: number,
  mode: InvarianceMode,
): (law: Valued<ImprecisionLaw>) => Valued<ImprecisionLaw> {
  const meanSum = new CompensatedSum();
  const spreadSum = new CompensatedSum();
  let weight = 0;
  for (const [cellStart, cellEnd] of pairwise(grid)) {
    const lengthQuarters = (cellEnd - cellStart) / ticksPerQuarter;
    if (!(lengthQuarters > 0)) continue;
    const law = lawAt(reading, cellStart);
    if (isBottom(law)) continue;
    const moments = lawMoments(law.value);
    meanSum.add(moments.mean * lengthQuarters);
    spreadSum.add(moments.sigma * lengthQuarters);
    weight += lengthQuarters;
  }
  if (weight === 0) return (law) => law;

  const shift = -meanSum.total / weight;
  const meanSpread = spreadSum.total / weight;
  const scale = mode === 'level-gain' && meanSpread > 0 ? 1 / meanSpread : 1;
  const offset = mode === 'level-gain' ? shift * scale : shift;
  return (law) => (isBottom(law) ? law : valued(affineLaw(law.value, scale, offset)));
}

/**
 * A law's own mean and standard deviation, in the quantile domain.
 *
 * Computed here rather than taken from {@link wasserstein2Decomposition} because the
 * canonicalizer needs one law's moments and that function needs two — asking it for
 * `decompose(law, law)` would work and would do twice the integration for the same numbers.
 */
export function lawMoments(law: ImprecisionLaw): { mean: number; sigma: number } {
  const panels = 64;
  const q = (u: number): number => quantile(law, u);
  const integrate = (g: (u: number) => number): number => {
    const total = new CompensatedSum();
    for (let i = 0; i < panels; ++i) total.add(gaussLegendre10(g, i / panels, (i + 1) / panels));
    return total.total;
  };
  const mean = integrate(q);
  const variance = integrate((u) => (q(u) - mean) * (q(u) - mean));
  return { mean, sigma: Math.sqrt(Math.max(0, variance)) };
}

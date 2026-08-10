/**
 * The numerical core: compensated summation, fixed-order Gauss–Legendre, and the two
 * tempo-specific devices DESIGN.md §5.0 requires (AD-28, M6, M7).
 *
 * Pure functions over plain numbers. No XML, no registry, no document — which is what lets
 * the accuracy claims here be tested directly against closed forms rather than inferred from
 * a distance that happens to look right.
 *
 * ## Why order 10, and why a graded mesh rather than a substitution
 *
 * §5.0's quadrature spec is not "integrate the cell": it is three rules, each of which
 * exists because the obvious implementation was measured and found wrong.
 *
 * 1. **Tempo cells run on an equal-mass graded mesh** (AD-28.1). The integrand is
 *    `ln(bpm₀ + Δ·u^e)` with `e = ln 0.5 / ln(meanTempoAt)` over `(0, ∞)`, and plain GL-10
 *    loses accuracy at both ends. AD-17 prescribed the substitution `u = z^{1/e}`; that was
 *    measured here and **falsified for `e > 1`**, where it creates the singularity it claims
 *    to kill (39 % error at `meanTempoAt = 0.9`). {@link integrateGradedPower} is the ruled
 *    replacement; {@link integrateSubstitutedPower} survives only as a pinned counterexample.
 * 2. **Sign changes are bracketed by structure.** `g_A − g_B` can cross **twice** inside one
 *    cell with equal endpoint signs, so an endpoint-sign test finds no bracket and the cell
 *    is integrated whole with the absolute value in the wrong place — measured relative
 *    error 1.48·10⁻², ten orders past the advertised ε, silently. See {@link powerCriticalPoint}.
 * 3. **The defined Bézier is the ideal one.** `bezier.ts`'s `tForDate` stops at a one-tick
 *    tolerance in the date domain, so the renderer's `date ↦ volume` is a staircase and
 *    GL-10 cannot converge against it. The *defined* object is the smooth ideal Bézier;
 *    `tForDate` is its approximation and belongs to the §6.3 replay only.
 *
 * Rules 1 and 2 live here. Rule 3 is a statement about which function the evaluators hand
 * this module, not about the quadrature itself.
 */

/**
 * Neumaier summation — Kahan's compensated sum with the branch that also handles the case
 * where the running total is *smaller* than the addend.
 *
 * R2 requires `compare(a,b)` and `compare(b,a)` to agree to the last bit, and plain
 * left-to-right addition of thousands of cell contributions does not: floating-point
 * addition is not associative, so any order dependence in the accumulation shows up as a
 * one-ulp asymmetry that a bit-exactness test will catch. Callers therefore sum in a
 * documented order (date-ordered, per §5.0) *and* compensate, because the order rule alone
 * only fixes which sum you get, not how much of it survives.
 *
 * Neumaier rather than plain Kahan because plain Kahan loses the correction exactly when
 * one cell dwarfs the running total, which is the shape of a window whose first cell is a
 * `⊥` span priced at `δ_row` and whose rest are small.
 */
export function neumaierSum(values: Iterable<number>): number {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const t = sum + value;
    compensation += Math.abs(sum) >= Math.abs(value) ? sum - t + value : value - t + sum;
    sum = t;
  }
  return sum + compensation;
}

/**
 * A running {@link neumaierSum}, for accumulating across cells without materializing them.
 *
 * Same arithmetic, same guarantees; it exists because the density layer walks a refinement
 * grid and would otherwise have to build an array per dimension per part just to add it up.
 */
export class CompensatedSum {
  private sum = 0;
  private compensation = 0;

  add(value: number): void {
    const t = this.sum + value;
    this.compensation +=
      Math.abs(this.sum) >= Math.abs(value) ? this.sum - t + value : value - t + this.sum;
    this.sum = t;
  }

  get total(): number {
    return this.sum + this.compensation;
  }
}

/**
 * Gauss–Legendre order 10 on `[-1, 1]`, hard-coded at full double precision.
 *
 * Hard-coded rather than derived at run time so the numbers are auditable by eye and stable
 * across engines — and `tests/comparison/quadrature.test.ts` re-derives them from scratch by
 * Newton's method on the Legendre polynomial `P₁₀` and asserts agreement, so the table
 * cannot rot into a typo without a test failing. That test is the reason to hard-code at
 * all: a derived table would be self-consistent with its own bug.
 *
 * Only the five positive nodes are stored; the rule is symmetric, and writing the negatives
 * out would be five more places for a digit to go wrong.
 */
const GAUSS_LEGENDRE_10_POSITIVE_NODES: readonly number[] = [
  0.14887433898163122, 0.43339539412924716, 0.6794095682990244, 0.8650633666889845,
  0.9739065285171717,
];

/** The weights of {@link GAUSS_LEGENDRE_10_POSITIVE_NODES}, index-aligned. */
const GAUSS_LEGENDRE_10_POSITIVE_WEIGHTS: readonly number[] = [
  0.2955242247147529, 0.26926671930999624, 0.21908636251598207, 0.14945134915058053,
  0.06667134430868803,
];

/** The ten nodes in increasing order, negatives first — the evaluation order the sum uses. */
export const GAUSS_LEGENDRE_10_NODES: readonly number[] = [
  ...[...GAUSS_LEGENDRE_10_POSITIVE_NODES].reverse().map((node) => -node),
  ...GAUSS_LEGENDRE_10_POSITIVE_NODES,
];

/** The ten weights, index-aligned with {@link GAUSS_LEGENDRE_10_NODES}. */
export const GAUSS_LEGENDRE_10_WEIGHTS: readonly number[] = [
  ...[...GAUSS_LEGENDRE_10_POSITIVE_WEIGHTS].reverse(),
  ...GAUSS_LEGENDRE_10_POSITIVE_WEIGHTS,
];

/**
 * `∫ₐᵇ f` by the ten-point rule.
 *
 * Exact for polynomials of degree ≤ 19, which is what makes it exact on a step cell and
 * near-machine on a smooth one. A degenerate or inverted interval integrates to 0 rather
 * than to a negative number: the caller's cells come from a sorted grid, so `b < a` is a
 * caller bug rather than a signed area, and returning 0 keeps a bug from being laundered
 * into a plausible distance.
 *
 * The accumulation is compensated and runs in node order, so two calls with the same
 * arguments give the same bits and a mirrored pair gives mirrored bits (R2).
 */
export function gaussLegendre10(f: (x: number) => number, a: number, b: number): number {
  if (!(b > a)) return 0;
  const halfWidth = (b - a) / 2;
  const midpoint = (a + b) / 2;
  const sum = new CompensatedSum();
  for (let i = 0; i < GAUSS_LEGENDRE_10_NODES.length; ++i)
    sum.add(GAUSS_LEGENDRE_10_WEIGHTS[i] * f(midpoint + halfWidth * GAUSS_LEGENDRE_10_NODES[i]));
  return halfWidth * sum.total;
}

/**
 * `∫₀¹ f(u^e) du` computed as `∫₀¹ f(z)·(1/e)·z^{1/e−1} dz` — §5.0's rule 1.
 *
 * `f` is a function of the *already-powered* argument, i.e. the caller passes
 * `z ↦ ln(bpm₀ + Δ·z)` rather than `u ↦ ln(bpm₀ + Δ·u^e)`. That is the whole point of the
 * substitution: `u^e` never appears, so neither does its singular derivative at either end.
 *
 * `e = 1` is returned through the same formula rather than short-circuited — the Jacobian is
 * then identically 1 and GL-10 is already exact enough — but `e ≤ 0` and non-finite `e` are
 * refused, because the tempo reader never produces them: `meanTempoAt ≤ 0` and `≥ 1` are
 * both collapsed to a constant span before a curve is ever built (§5.1's degenerate table).
 *
 * ## MEASURED LIMIT — this is NOT valid for `e > 1` (reported to the conductor)
 *
 * §5.0 rule 1 claims the substitution "makes the integrand smooth for every `e`, killing
 * both singular ends at once". Measured against a 2·10⁶-point composite Simpson reference,
 * that holds only for `e < 1`. For `e > 1` the Jacobian exponent `1/e − 1` goes negative and
 * the substitution *creates* an integrable-but-severe singularity at `z = 0` where the
 * original integrand had none, and GL-10 loses most of the mass:
 *
 * | `meanTempoAt` | `e` | naive rel. err | substituted rel. err |
 * |---|---|---|---|
 * | 0.25 | 0.50 | 1.9·10⁻⁵ | **6.3·10⁻¹²** |
 * | 0.50 | 1.00 | 6.2·10⁻¹⁴ | 6.2·10⁻¹⁴ |
 * | 0.90 | 6.58 | **6.3·10⁻¹¹** | 3.9·10⁻¹ |
 * | 0.99 | 68.97 | 4.4·10⁻⁵ | 9.2·10⁻¹ |
 *
 * A 39 % error at `meanTempoAt = 0.9` is not a rounding complaint; it is the same class of
 * silent failure rule 1 was written to prevent, with the sign of the remedy reversed. Note
 * also that the substitution is only near-exact where `1/e − 1` is a non-negative integer
 * (`e = 1, 1/2, 1/3, …`) and degrades in between — 2.5·10⁻⁴ at `e = 0.76`.
 *
 * So this function is the substitution and nothing more: it is correct arithmetic for the
 * transformation it names, and choosing *when* to apply it is a scheme-level decision the
 * conductor has to make (the candidates measured are naive GL-10, which is best in the
 * middle, and an equal-mass graded mesh in `z`, which is uniformly ≤ 3.3·10⁻⁶). Until that
 * ruling lands, no tempo evaluator in this module calls it.
 */
export function integrateSubstitutedPower(f: (z: number) => number, e: number): number {
  if (!Number.isFinite(e) || e <= 0)
    throw new RangeError(`power-curve exponent must be finite and positive, got ${String(e)}`);
  const inverse = 1 / e;
  return gaussLegendre10((z) => inverse * Math.pow(z, inverse - 1) * f(z), 0, 1);
}

/**
 * The number of panels the graded mesh uses for exponent `e` — AD-28.1's `⌈log₂ e⌉ + 2`,
 * floored at 2.
 *
 * The floor is not in the ruling's formula and is required by it: for `e < 1` the logarithm
 * is negative, so `e = 0.23` would ask for zero panels and `e = 0.06` for a negative number.
 * Two is the smallest mesh that is still a mesh, and it is what the measurement behind the
 * ruling actually ran — the quoted 3.3·10⁻⁶ worst case is this function's.
 *
 * Growth is logarithmic because the boundary layer at `u = 1` has width `~1/e`: each extra
 * panel halves the layer's share of the last panel, so a handful track it for any exponent a
 * document can carry. `meanTempoAt = 0.999` (`e ≈ 693`) asks for 12.
 */
export function gradedPanelCount(e: number): number {
  return Math.max(2, Math.ceil(Math.log2(e)) + 2);
}

/**
 * `∫₀¹ f(u^e) du` on an **equal-mass graded mesh** — AD-28.1, the ruled scheme.
 *
 * Panels are placed at `u = (k/K)^{1/e}`, so each carries the same amount of `z = u^e` and
 * the mesh concentrates where the integrand moves: bunched near `u = 1` for a large `e` (the
 * late-weighted ritardando's boundary layer) and spread out for a small one. GL-10 runs on
 * each panel and the results are summed with compensation.
 *
 * `f` takes the **raw curve argument `u`**, not the powered one — unlike
 * {@link integrateSubstitutedPower}, whose whole point was to remove `u^e` from the caller's
 * integrand. The mesh does not transform the integrand at all; it only chooses where to look
 * at it, which is exactly why it has no Jacobian and so no singularity to create.
 *
 * One scheme for the whole legal range, no regime branching (AD-28.1). Measured against a
 * 2·10⁶-point composite Simpson reference on `ln(60 + 60·u^e)`: worst relative error
 * 3.3·10⁻⁶ over `meanTempoAt ∈ [0.02, 0.99]`, 2.9·10⁻⁵ out at 0.999, against naive GL-10's
 * 4.4·10⁻⁵ and 2.9·10⁻⁴ — about a factor of ten better everywhere, and worse nowhere.
 *
 * **In JND terms, which is the actual requirement** (AD-28.2): the tempo JND is
 * `ln(1.025) ≈ 0.0247` nepers (AD-27.6), so the worst error here is 5.4·10⁻⁴ JND over the
 * practical range. The relative figures are numerical hygiene above a metric requirement
 * that naive GL-10 already met.
 */
export function integrateGradedPower(f: (u: number) => number, e: number): number {
  const bounds = gradedPanelBounds(e);
  const total = new CompensatedSum();
  for (let k = 0; k < bounds.length - 1; ++k)
    total.add(gaussLegendre10(f, bounds[k], bounds[k + 1]));
  return total.total;
}

/**
 * The graded mesh's panel boundaries on the unit interval, `0 … 1` inclusive.
 *
 * Factored out so that {@link integrateGradedPower} — the function AD-28.1's 3.3·10⁻⁶ figure
 * was measured on — and `tempoDistance`'s shipped path place their panels through the *same*
 * code. They agreed by inspection before; MINOR-3 is the observation that agreement by
 * inspection is not a property, and that an edit to one would not be caught by the other's
 * test.
 */
export function gradedPanelBounds(e: number): readonly number[] {
  if (!Number.isFinite(e) || e <= 0)
    throw new RangeError(`power-curve exponent must be finite and positive, got ${String(e)}`);
  const panels = gradedPanelCount(e);
  const inverse = 1 / e;
  return Array.from({ length: panels + 1 }, (_, k) => Math.pow(k / panels, inverse));
}

/**
 * §5.0 rule 2's interior critical point of a power-versus-power tempo cell, or null when
 * there is none in `(0, 1)`.
 *
 * For two spans `Δ_a·u^p` and `Δ_b·u^q` with `p ≠ q`, the difference of the *pre-logarithm*
 * offsets is stationary where `p·Δ_a·u^{p−1} = q·Δ_b·u^{q−1}`, i.e. at
 * `u* = (q·Δ_b / (p·Δ_a))^{1/(p−q)}` — the formula §5.0 states. Splitting the cell there
 * leaves two branches on which the difference is monotone, so the bisection below has a
 * bracket whenever a crossing exists and rule 2's silent 1.48·10⁻² error cannot occur.
 *
 * **This is a splitting device, not a root.** It is the stationary point of the difference
 * of the offsets, not of the difference of their logarithms, so it does not in general sit
 * exactly at the extremum of `g_A − g_B`. That is fine and is why §5.0 calls it a bracket
 * rather than a solution: any split that separates the crossings makes the branches
 * bracketable, and this one provably does for the power-vs-power family. A split point that
 * lands outside `(0, 1)`, or that the arithmetic cannot produce, yields null and the caller
 * integrates the cell whole — correctly, because in that regime the difference is monotone
 * over the cell already.
 */
export function powerCriticalPoint(
  deltaA: number,
  p: number,
  deltaB: number,
  q: number,
): number | null {
  if (p === q) return null;
  const numerator = q * deltaB;
  const denominator = p * deltaA;
  if (denominator === 0 || numerator === 0) return null;
  const ratio = numerator / denominator;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  const u = Math.pow(ratio, 1 / (p - q));
  if (!Number.isFinite(u) || u <= 0 || u >= 1) return null;
  return u;
}

/**
 * The sign of `x` as a comparable token, with `-0` and `+0` agreeing.
 *
 * Written as a token rather than as `x > 0` because R2's symmetry is mechanical: `f ↦ −f`
 * is exact in IEEE754, so a bracket update phrased as a *sign comparison* inverts
 * consistently under mirroring while one phrased as `f(m) > 0` does not (M16). Every
 * comparison below goes through this.
 */
function signOf(x: number): -1 | 0 | 1 {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

/**
 * The crossing of `f` in `[a, b]` by bisection, or null when the endpoints do not bracket
 * one.
 *
 * Fixed **50** iterations rather than a tolerance loop, per §5.0/R2: a fixed count is
 * deterministic across inputs and platforms, and 50 halvings take any starting interval
 * below `2⁻⁵⁰` of its width, which is past double precision for every interval this module
 * sees. A tolerance loop would make the iteration count data-dependent and therefore the
 * result order-dependent under mirroring.
 *
 * The bracket update compares signs (see {@link signOf}); it never tests `f(m) > 0`.
 */
/**
 * A point one ulp inside `high`, for probing a right-continuous function's LEFT limit there.
 *
 * A relative step rather than a fixed epsilon: these abscissae are ticks and can be 10⁵ or
 * more, where a fixed 1e−9 would be far below the representable spacing and round back to
 * `high`. `|high|·ε` is one ulp at that magnitude by construction.
 *
 * The fallback matters for correctness rather than tidiness: on an interval already about
 * one ulp wide the step cannot land strictly inside, and returning `high` would reinstate
 * exactly the closed probe this function exists to avoid. The midpoint always lies inside a
 * non-degenerate interval, and on a degenerate one every probe is the same point anyway.
 */
function leftLimitOf(high: number, low: number): number {
  const step = Math.max(Math.abs(high) * Number.EPSILON, Number.MIN_VALUE);
  const inward = high - step;
  return inward > low ? inward : (low + high) / 2;
}

export function bisectSignChange(f: (x: number) => number, a: number, b: number): number | null {
  let low = a;
  let high = b;
  const signLow = signOf(f(low));
  // HALF-OPEN PROBE (AD-33.3a). Every curve in this module is right-continuous (A-B1), so
  // `f(b)` at a cell's right edge is the NEXT cell's value across a discontinuity, and
  // bracketing on it searches this interval with a sign that does not belong to it. Probing
  // the right endpoint at its left limit fixes that. The GL-10 nodes are untouched — they are
  // already strictly interior, so the integral itself never sees the endpoint.
  //
  // Latent in tempo and dynamics, whose curves are monotone within a span; decisive in
  // rubato, whose δ is a saw-tooth dropping at every frame wrap. Measured over 3906 legal
  // frame-aligned rubato pairs, this repair alone takes the >0.1 % failures from 2328 to 280.
  const signHigh = signOf(f(leftLimitOf(high, low)));
  if (signLow === 0) return low;
  if (signHigh === 0) return high;
  if (signLow === signHigh) return null;

  for (let iteration = 0; iteration < 50; ++iteration) {
    const middle = (low + high) / 2;
    if (signOf(f(middle)) === signLow) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/**
 * `∫ₐᵇ |f|` with the absolute value resolved at the crossings rather than under the
 * integral.
 *
 * Integrating `|f|` directly with a smooth rule is the error rule 2 describes: `|f|` has a
 * corner at every root, GL-10 sees a kink it cannot represent, and the answer is wrong by
 * far more than the rule's nominal accuracy. So the interval is split at the crossings the
 * caller's `splitPoints` isolate, each sub-interval is integrated with its sign known and
 * constant, and the magnitudes are added.
 *
 * `splitPoints` are structural — {@link powerCriticalPoint} for tempo, curve breakpoints
 * elsewhere — and need not be roots themselves; they only have to separate the roots so
 * each sub-interval has at most one, which is what makes {@link bisectSignChange} complete.
 */
/**
 * `∫ₐᵇ min(|f|, cap)` — {@link integrateAbsolute} under §4's cap, for the dimensions whose
 * pointwise density has to be capped rather than merely accumulated.
 *
 * **Why a curve dimension would cap at all.** Tempo and dynamics integrate `|g_A − g_B|/jnd`
 * uncapped and are metric doing so, because neither can produce `⊥`: an unresolvable level is
 * performed at 100.0 (R8). Accentuation and pedal *can* — an unresolvable
 * `accentuationPatternDef` aborts the render (R21), and an out-of-domain `@curvature` makes the
 * date component non-monotone, so there is no `date ↦ position` function at all (§5.8/§4). §4
 * prices `⊥` at `δ_row` from every value, so a value-value pair priced **uncapped** breaks the
 * triangle inequality the moment a `⊥` document is the middle term:
 * `d(x, ⊥) + d(⊥, y) = 2δ` while `d(x, y)` grows without bound. Capping the pointwise density
 * at `2·δ_row` is what §4 already requires of `localDistance`, applied under the integral
 * because here the quantity is a curve rather than an attribute.
 *
 * The cap introduces a **corner** wherever `|f|` crosses it, and a corner is exactly what
 * GL-10 cannot represent — the same defect the absolute value has at its roots. So the
 * crossings are resolved the same way: each sign-constant piece is searched for one cap
 * crossing by bisection and split there, leaving pieces on which `min(|f|, cap)` is either the
 * polynomial `±f` or the constant `cap`, both of which GL-10 integrates exactly.
 *
 * Completeness has the same caveat as {@link integrateAbsolute}: the caller's `splitPoints`
 * must isolate the crossings, one per sub-interval. On a piecewise-affine difference — which
 * is what the accentuation curve is between breakpoints — `|f|` is monotone on each
 * sign-constant piece, so one crossing per piece is not an assumption but a fact.
 */
export function integrateCappedAbsolute(
  f: (x: number) => number,
  cap: number,
  a: number,
  b: number,
  splitPoints: readonly number[] = [],
): CappedIntegral {
  if (!(b > a) || !(cap > 0)) return { mass: 0, capped: false };

  const capped = (x: number) => Math.min(Math.abs(f(x)), cap);
  const overCap = (x: number) => Math.abs(f(x)) - cap;

  const total = new CompensatedSum();
  let bound = false;

  // Whether the cap actually bound on a piece is decided at the piece's MIDPOINT, which is
  // sound because the pieces below are split at every cap crossing: `|f| − cap` has one sign
  // throughout each of them, so any interior point decides it. Reporting this from inside the
  // quadrature rather than inferring it from the mass is the difference between "the cap bound
  // somewhere" and "the cap bound everywhere", which a mass comparison cannot tell apart.
  const integratePiece = (low: number, high: number): void => {
    if (overCap((low + high) / 2) >= 0) bound = true;
    total.add(gaussLegendre10(capped, low, high));
  };

  for (const [low, high] of signConstantPieces(f, a, b, splitPoints)) {
    const crossing = bisectSignChange(overCap, low, high);
    if (crossing === null || crossing <= low || crossing >= high) {
      integratePiece(low, high);
      continue;
    }
    integratePiece(low, crossing);
    integratePiece(crossing, high);
  }
  return { mass: total.total, capped: bound };
}

/** {@link integrateCappedAbsolute}'s result: the mass, and whether §4's cap bound anywhere. */
export interface CappedIntegral {
  readonly mass: number;
  /** True where the cap replaced the raw difference on at least one piece of `[a, b]`. */
  readonly capped: boolean;
}

/**
 * The caller's cells, each split once more at `f`'s crossing — the piece list both
 * {@link integrateAbsolute} and {@link integrateCappedAbsolute} work over.
 *
 * Factored out rather than duplicated because the two functions must agree about where the
 * roots are: `integrateCappedAbsolute` with a cap larger than `max |f|` has to return exactly
 * what `integrateAbsolute` returns, and that identity is tested.
 */
function signConstantPieces(
  f: (x: number) => number,
  a: number,
  b: number,
  splitPoints: readonly number[],
): readonly (readonly [number, number])[] {
  const interior = [...new Set(splitPoints.filter((point) => point > a && point < b))].sort(
    (x, y) => x - y,
  );
  const bounds = [a, ...interior, b];

  const pieces: (readonly [number, number])[] = [];
  for (let i = 0; i < bounds.length - 1; ++i) {
    const low = bounds[i];
    const high = bounds[i + 1];
    const root = bisectSignChange(f, low, high);
    // A root exactly at a bound is not an interior split: the sign is constant on the rest
    // of the sub-interval and splitting there would add a zero-width piece.
    if (root === null || root <= low || root >= high) {
      pieces.push([low, high]);
      continue;
    }
    pieces.push([low, root], [root, high]);
  }
  return pieces;
}

export function integrateAbsolute(
  f: (x: number) => number,
  a: number,
  b: number,
  splitPoints: readonly number[] = [],
): number {
  if (!(b > a)) return 0;

  const total = new CompensatedSum();
  for (const [low, high] of signConstantPieces(f, a, b, splitPoints))
    total.add(Math.abs(gaussLegendre10(f, low, high)));
  return total.total;
}

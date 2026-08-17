/**
 * The dynamics curve — DESIGN.md §5.3. `g(t) = ln(volume(t))`, in nepers.
 *
 * ## The defined object is the IDEAL Bézier, not the renderer's approximation of it
 *
 * §5.0 rule 3 / R20 is the reason this module does not call `bezier.ts`'s `tForDate`.
 * That function inverts the curve's x-component by bisection and **stops at a one-tick
 * tolerance in the date domain** (`bezier.ts:57-78`), so the renderer's `date ↦ volume` is
 * a staircase with thousands of treads across a long transition, and no smooth quadrature
 * rule can converge against it. The *defined* comparison object is the smooth ideal Bézier;
 * `tForDate` is the renderer's approximation of that object and belongs to the §6.3 replay,
 * where the divergence is bounded by `|Δvolume| ≤ |v′(t)| · 1 tick / |x′(t)|`.
 *
 * So {@link idealCurveParameter} inverts the same cubic to machine precision instead. It is
 * the same polynomial, the same control points, and the same monotonicity — only the
 * stopping rule differs, and that difference is the whole point.
 *
 * ## What the renderer does that a reader would not guess
 *
 * - **Trailing transitions are inert** (AD-8), exactly as in tempo:
 *   `DynamicsMap.getEndDate:187-193` has the same `MAX_VALUE` shape, so a trailing
 *   `volume=40 transition.to=100` performs a flat 40. `all_maps.mpm` ends with
 *   `volume="80" transition.to="110"` and its reference rendering shows velocities around
 *   80, not a crescendo.
 * - **`@curvature` and `@protraction` are read only in the transition branch**
 *   (`DynamicsMap.ts:170-181`), default **0.0**, and are clamped to `[0,1]` and `[−1,1]`
 *   on the way in. `<movement>` defaults to 0.4 instead (§5.8/AD-13), which is why the
 *   shared Bézier machinery must not share a default.
 * - **The neutral is velocity 100**, before the first instruction and for a wholly absent
 *   map (AD-9ii, `DynamicsMap.ts:251-253`) — not a left extension of the first instruction.
 * - **`@subNoteDynamics` switches the rendering mechanism** and is a *structural finding*,
 *   never a curve difference: on a sub-note span every note is pinned to velocity 100 and
 *   the shape becomes a CC 7 channel-volume curve. Two documents identical but for the flag
 *   are distance 0 on the date axis while driving two different MIDI mechanisms. It is
 *   inert on a map's last instruction, by the same `size()-1` guard as the trailing rule.
 */
import type { Element } from '../xml/XomTypes.js';
import { innerControlPointsXPositions } from '../mpm/elements/maps/data/bezier.js';
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { resolveComparisonLevel } from './values.js';
import { DYNAMICS_MAP } from '../mpm/names.js';
import { assertSpanEndRule } from './spanEnds.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/** `DynamicsMap.renderDynamicsToMap`'s pin for notes with no dynamics in force. */
export const NEUTRAL_VELOCITY = 100;

export type DynamicsSegment =
  | {
      readonly kind: 'constant';
      readonly startTicks: number;
      readonly endTicks: number;
      readonly volume: number;
    }
  | {
      readonly kind: 'bezier';
      readonly startTicks: number;
      readonly endTicks: number;
      readonly from: number;
      readonly to: number;
      /** x-positions of the two inner control points, already derived and clamped. */
      readonly x1: number;
      readonly x2: number;
    };

export interface DynamicsCurveNote {
  readonly kind:
    | 'renderer-default-level'
    | 'inert-transition'
    | 'sub-note-mechanism'
    | 'renderer-skip'
    | 'degenerate-shape';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface DynamicsCurve {
  readonly segments: readonly DynamicsSegment[];
  readonly breakpointsTicks: readonly number[];
  readonly notes: readonly DynamicsCurveNote[];
}

/** The neutral dynamics curve: velocity 100 everywhere (R6). */
export function neutralDynamicsCurve(): DynamicsCurve {
  return {
    segments: [
      {
        kind: 'constant',
        startTicks: 0,
        endTicks: Number.POSITIVE_INFINITY,
        volume: NEUTRAL_VELOCITY,
      },
    ],
    breakpointsTicks: [0],
    notes: [],
  };
}

/**
 * `DynamicsMap.clampCurvature` / `clampProtraction`, applied on the way in — **including what
 * they do to a value that is not a number** (MINOR-4).
 *
 * The clamps are two comparisons, `value < 0` and `value > 1`, and `NaN` fails both — so an
 * unusable `@curvature` reaches the curve as `NaN` rather than as the 0.0 an absent one gets.
 * Repairing it to 0 was this module's first reading and it is a divergence: it produces a
 * smoothstep ramp where the renderer performs something else entirely (see
 * {@link readDynamicsSegments}). ABSENT is still 0.0, which is `DynamicsData`'s own initializer.
 */
function shapeParameter(element: Element, name: string, low: number, high: number): number {
  if (readAttributeValue(element, name) === null) return 0;
  const value = readNumericAttributeValue(element, name);
  if (!Number.isFinite(value)) return value;
  return Math.min(high, Math.max(low, value));
}

/**
 * Invert the Bézier's x-component to **machine precision** — the ideal curve of §5.0 rule 3.
 *
 * `x(t) = ((u·t + v)·t + 3x₁)·t` with `u = 3x₁ − 3x₂ + 1`, `v = −6x₁ + 3x₂`, which is the
 * same Horner form `bezier.ts` uses and is monotone on `[0,1]` for control points in range.
 * Fifty bisections take the bracket below `2⁻⁵⁰`, which is past double precision — a fixed
 * count rather than a tolerance loop, for the determinism reason `bisectSignChange` gives.
 *
 * Contrast `tForDate`, which stops as soon as x is within **one tick** of the target. On a
 * 4-bar transition at 720 ppq that is a tolerance of 1 part in 11 520, and the resulting
 * staircase is what rule 3 forbids integrating against.
 *
 * **One conditioning limit, measured and bounded.** At `curvature = 1` — an admissible
 * boundary value — the control points are `(1, 0)`, so `x(t) = 4t³ − 6t² + 3t` and
 * `x′(t) = 3(2t − 1)²`, which **vanishes at `t = 0.5`**. `x` is still matched to machine
 * precision there, but the inverse is flat, so a cube-root loss leaves `t` good to only
 * ~1e−5 and the value fraction carries that into ~6e−4 volume units at the midpoint. More
 * iterations do not help; the inverse is genuinely stationary. In JND terms it is ~2e−5,
 * far below the metric's resolution, so it is documented and pinned as a bound rather than
 * chased. Every interior curvature is exact to 1e−9.
 */
export function idealCurveParameter(x1: number, x2: number, xTarget: number): number {
  if (xTarget <= 0) return 0;
  if (xTarget >= 1) return 1;

  const u = 3 * x1 - 3 * x2 + 1;
  const v = -6 * x1 + 3 * x2;
  const w = 3 * x1;
  const xAt = (t: number) => ((u * t + v) * t + w) * t;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 50; ++iteration) {
    const middle = (low + high) / 2;
    if (xAt(middle) < xTarget) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The Bézier's value fraction at curve parameter `t` — `DynamicsData.getDynamicsAt`'s form. */
function valueFraction(t: number): number {
  return (3 - 2 * t) * t * t;
}

interface RawDynamics {
  readonly dateTicks: number;
  /** Null where the renderer skips the instruction — `@volume` absent (AD-33.4). */
  readonly volume: number | null;
  readonly transitionTo: number | null;
  readonly curvature: number;
  readonly protraction: number;
  readonly subNoteDynamics: boolean;
  readonly rendererDefault: boolean;
}

/**
 * Build the performed dynamics curve of one scope.
 *
 * Span ends follow the same-local-name rule (`DynamicsMap.getEndDate:187-193` scans for the
 * next `<dynamics>`), so a `<style>` between two instructions is transparent — unlike
 * `asynchronyMap`, where it is not.
 *
 * **A `<dynamics>` with no `@volume` is a SKIP, not a no-op** (AD-33.4, correcting this
 * module's first version). `getDynamicsDataOf` rejects it (`DynamicsMap.ts:162-163`), but
 * `getEndDate:187-193` scans for the next element *named* `dynamics` regardless of whether it
 * parses, so the volume-less element still ends the previous span; `renderDynamicsToMap` then
 * `continue`s past it and the next valid instruction's inner loop pins every note in the gap
 * to `velocity="100.0"` (`DynamicsMap.ts:251-253`). Same shape as tempo's AD-9i, same
 * constant, a different mechanism. Reading it as "the previous span continues" was wrong by
 * `|ln 60 − ln 100| = 0.511` nepers — 5.36 JND — held across the whole gap.
 *
 * An unresolvable *level* is still not a skip: R8 makes it the renderer's 100.0.
 */
export function readDynamicsSegments(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): DynamicsCurve {
  assertSpanEndRule(DYNAMICS_MAP, 'same-local-name');

  if (view === null) return neutralDynamicsCurve();

  const raws: RawDynamics[] = [];
  for (const [index, entry] of view.entries.entries()) {
    const element: Element = entry.element;
    if (element.getLocalName() !== 'dynamics') continue;
    if (!Number.isFinite(entry.date)) continue;

    const styleName = view.styleNames[index];
    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    const volumeText = readAttributeValue(element, 'volume');

    if (volumeText === null) {
      // The renderer skips it but still ends the previous span with it (AD-33.4).
      raws.push({
        dateTicks: entry.date * resolution.scaleFactor,
        volume: null,
        transitionTo: null,
        curvature: 0,
        protraction: 0,
        subNoteDynamics: false,
        rendererDefault: false,
      });
      continue;
    }

    const volume = resolveComparisonLevel(
      volumeText,
      'dynamics',
      styleName,
      resolution.environment,
      resolution.globalEnvironment,
    );
    const transitionToText = readAttributeValue(element, 'transition.to');
    const transitionTo =
      transitionToText === null
        ? null
        : resolveComparisonLevel(
            transitionToText,
            'dynamics',
            styleName,
            resolution.environment,
            resolution.globalEnvironment,
          );

    raws.push({
      dateTicks: entry.date * resolution.scaleFactor,
      volume: volume.value,
      transitionTo: transitionTo === null ? null : transitionTo.value,
      // Read ONLY in the transition branch, and defaulted to 0.0 there — not 0.4, which is
      // <movement>'s default and a different family (§5.8/AD-13).
      curvature: shapeParameter(element, 'curvature', 0, 1),
      protraction: shapeParameter(element, 'protraction', -1, 1),
      subNoteDynamics: readAttributeValue(element, 'subNoteDynamics') === 'true',
      rendererDefault:
        volume.source === 'renderer-default' ||
        (transitionTo !== null && transitionTo.source === 'renderer-default'),
    });
  }

  if (raws.length === 0) return neutralDynamicsCurve();

  const segments: DynamicsSegment[] = [];
  const notes: DynamicsCurveNote[] = [];

  // The neutral runs to the first VALID instruction, not the first element: a leading skip
  // extends it, exactly as in the tempo reader.
  const firstValid = raws.find((raw) => raw.volume !== null);
  const firstValidDate = firstValid?.dateTicks ?? Number.POSITIVE_INFINITY;
  if (firstValidDate > 0)
    segments.push({
      kind: 'constant',
      startTicks: 0,
      endTicks: firstValidDate,
      volume: NEUTRAL_VELOCITY,
    });

  for (const [index, raw] of raws.entries()) {
    const next = raws[index + 1] as RawDynamics | undefined;
    const isTrailing = next === undefined;
    const endTicks = next?.dateTicks ?? Number.POSITIVE_INFINITY;

    if (raw.volume === null) {
      notes.push({
        kind: 'renderer-skip',
        dateTicks: raw.dateTicks,
        detail:
          'no @volume: the renderer skips the instruction but still ends the previous span ' +
          'with it, and pins every note up to the next valid <dynamics> to velocity 100 ' +
          '(DynamicsMap.ts:251-253, AD-33.4)',
      });
      const nextValid = raws.slice(index + 1).find((candidate) => candidate.volume !== null);
      segments.push({
        kind: 'constant',
        startTicks: raw.dateTicks,
        endTicks: nextValid?.dateTicks ?? Number.POSITIVE_INFINITY,
        volume: NEUTRAL_VELOCITY,
      });
      continue;
    }

    const isTransition =
      raw.transitionTo !== null && raw.transitionTo !== raw.volume && !isTrailing;

    // No redundant null re-test: TypeScript narrows `transitionTo` through the `isTransition`
    // const, and `no-unnecessary-condition` deletes the belt-and-braces check.
    if (isTransition && !Number.isFinite(raw.curvature + raw.protraction)) {
      // MINOR-4, measured through `performMsm`: an unusable `@curvature`/`@protraction` makes
      // the inner control points `NaN`, and `tForDate` starts at `t = 0.5` and loops only
      // `while (Math.abs(diffX) >= 1.0)` — which `NaN` fails — so `t` stays exactly 0.5. The
      // value fraction there is `(3 − 2t)t² = 0.5` for EVERY shape, so the span performs the
      // arithmetic midpoint of its two endpoints as a CONSTANT. Executed: 40 → 120 with
      // `curvature="abc"` performs 40, 80, 80, 80 on notes at 0/720/1440/2160.
      //
      // The verifier's MINOR-4 predicted `velocity="NaN"` here and the measurement refutes it;
      // the renderer performs a perfectly definite, audible constant. The two exact endpoints
      // (`getTForDate` short-circuits `t = 0` and `t = 1`) are single points of measure zero and
      // are not modelled — an integral does not see them, and a breakpoint for each would put
      // two zero-width cells in every grid.
      segments.push({
        kind: 'constant',
        startTicks: raw.dateTicks,
        endTicks,
        volume: (raw.volume + raw.transitionTo) / 2,
      });
      notes.push({
        kind: 'degenerate-shape',
        dateTicks: raw.dateTicks,
        detail:
          'an unusable @curvature or @protraction leaves the Bézier control points NaN, so ' +
          "tForDate's loop never runs and the span performs the midpoint of its endpoints as a " +
          'constant — not the ramp a repaired 0.0 would give',
      });
    } else if (isTransition) {
      const [x1, x2] = innerControlPointsXPositions(raw.curvature, raw.protraction);
      segments.push({
        kind: 'bezier',
        startTicks: raw.dateTicks,
        endTicks,
        from: raw.volume,
        to: raw.transitionTo,
        x1,
        x2,
      });
    } else {
      segments.push({
        kind: 'constant',
        startTicks: raw.dateTicks,
        endTicks,
        volume: raw.volume,
      });
      if (isTrailing && raw.transitionTo !== null && raw.transitionTo !== raw.volume)
        notes.push({
          kind: 'inert-transition',
          dateTicks: raw.dateTicks,
          detail:
            'last <dynamics> of the map: getEndDate is MAX_VALUE, so @transition.to is ' +
            'inert and the span performs flat at @volume (AD-8)',
        });
    }

    if (raw.rendererDefault)
      notes.push({
        kind: 'renderer-default-level',
        dateTicks: raw.dateTicks,
        detail: 'unresolvable level performed at the renderer default of 100.0 (R8/AD-1)',
      });

    // Structural, never a curve difference — and inert on the last instruction, by the same
    // size()-1 guard the trailing rule uses (`DynamicsMap.ts:223`).
    if (raw.subNoteDynamics && !isTrailing)
      notes.push({
        kind: 'sub-note-mechanism',
        dateTicks: raw.dateTicks,
        detail:
          'subNoteDynamics: the span is performed as a CC 7 channel-volume curve with every ' +
          'note pinned to velocity 100, not as per-note velocity — same date-axis curve, ' +
          'different MIDI mechanism (§5.3)',
      });
  }

  return {
    segments,
    breakpointsTicks: [...new Set(segments.map((segment) => segment.startTicks))].sort(
      (a, b) => a - b,
    ),
    notes,
  };
}

/** The segment governing `ticks`, right-continuous (A-B1). */
export function dynamicsSegmentAt(curve: DynamicsCurve, ticks: number): DynamicsSegment | null {
  let found: DynamicsSegment | null = null;
  for (const segment of curve.segments) {
    if (segment.startTicks > ticks) break;
    if (ticks < segment.endTicks || !Number.isFinite(segment.endTicks)) found = segment;
  }
  return found ?? (curve.segments.length > 0 ? curve.segments[curve.segments.length - 1] : null);
}

/** `volume(t)` on the ideal curve, at a position in common ticks. */
export function volumeAt(curve: DynamicsCurve, ticks: number): number {
  const segment = dynamicsSegmentAt(curve, ticks);
  if (segment === null) return NEUTRAL_VELOCITY;
  if (segment.kind === 'constant') return segment.volume;

  const span = segment.endTicks - segment.startTicks;
  if (!Number.isFinite(span) || span <= 0) return segment.from;
  const x = (ticks - segment.startTicks) / span;
  if (x <= 0) return segment.from;
  if (x >= 1) return segment.to;

  const t = idealCurveParameter(segment.x1, segment.x2, x);
  return segment.from + (segment.to - segment.from) * valueFraction(t);
}

/** `g(t) = ln(volume(t))`, in nepers. */
export function dynamicsLogAt(curve: DynamicsCurve, ticks: number): number {
  return Math.log(volumeAt(curve, ticks));
}

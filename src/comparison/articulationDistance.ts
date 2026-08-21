/**
 * The articulation distance — DESIGN.md §5.5, as amended by AD-37.3 / AD-37.4.
 *
 * The compared object is not the atom but the per-anchor composed effective modifier: atoms
 * compose per note in map order (`articulationAtoms`, §5.5), so what the renderer performs at an
 * anchor is one transformation built from all of them, and that is what the alignment aligns and
 * what the metric prices.
 *
 * ## Every effect is an affine map with an optional replacement anchor
 *
 * Both families the renderer touches have the same shape:
 *
 * ```
 * x ↦ (replacement ?? x) · factor + offset
 * ```
 *
 * `@absoluteDuration` / `@absoluteVelocity` set the replacement, `@relativeDuration` /
 * `@relativeVelocity` the factor, `@absoluteDurationChange` / `@absoluteVelocityChange` the
 * offset, and the composition of two such maps is another one. AD-37.4's encoding-invariance
 * obligation then falls out by construction: two stacked `relativeDuration` atoms and one atom
 * carrying their product both reduce to `{replacement: null, factor: 0.125, offset: 0}` and are
 * therefore distance 0.
 *
 * The two families differ only in how the levers on one element combine (AD-37.3, AD-11i), which
 * `articulationAtoms` resolves before this module sees it.
 *
 * ## `@absoluteDurationChange` is priced raw, a stated approximation
 *
 * The renderer halves the change until the result is positive and applies it only when
 * `duration > 0`, so the performed offset is note-dependent: `−200` on a 100-tick note performs
 * `−50`. AD-11iii/R15 prices the raw value as a document-level quantity for that reason — the
 * halving cannot be resolved without an MSM, and the negative branch cannot be resolved at all.
 * The composition here treats the offset as authored: faithful to the row's definition, not to
 * the note's.
 *
 * ## Anchors are dates or ids, and without an MSM they do not merge
 *
 * A date-targeted atom applies to every note at its date; a `noteid` atom applies to one note
 * wherever it is. Both can reach the same note — executed, they compose there — but deciding
 * *which* note needs the MSM. So §5.5 keeps the two kinds of anchor apart and the id-anchored
 * ones carry `datePositionKnown: false`.
 *
 * ## `d_articulation` has two components (AD-55.1)
 *
 * The atoms are one. The other is `<style>@defaultArticulation`, which governs every note in its
 * span that carries no atom — a piecewise-constant curve over score time, built by
 * `articulationDefault`. Leaving it out of the evaluator made three documents differing only in
 * their default compare at `D = 0` while the renderer performed one of them at half duration
 * throughout.
 *
 * {@link defaultArticulationDistance} therefore prices the step function per cell of the two
 * curves' joint refinement, with the same `modifierDistance` the alignment charges: a default
 * and an atom modify a note by the same affine map, and two scales would make a document that
 * moves an instruction between the two look like one that changed it. The components sum,
 * reaching the aggregation by different routes — the alignment's optimum as atoms, the step
 * function as cells — which is §5.0's "absolutely continuous part plus atoms".
 */
import { groupBy, head, pairwise } from '../prelude/index.js';
import {
  comparisonRowWith,
  localDistance,
  type ComparisonJndKey,
  type ComparisonRegistryRow,
  type JndOverrides,
} from './registry.js';
import { elementAt } from '../prelude/seq.js';
import { CompensatedSum } from './quadrature.js';
import {
  alignEvents,
  chargeAtoms,
  DEFAULT_LAMBDA_DATE,
  type AlignableEvent,
  type EventAlignment,
  type EventAtomMass,
} from './eventAlignment.js';
import {
  articulationDefAtom,
  effectiveAttributes,
  type ArticulationAtom,
  type ArticulationAtoms,
} from './articulationAtoms.js';
import { defaultArticulationAt, type DefaultArticulationCurve } from './articulationDefault.js';
import { bottom, valued, type Valued } from './values.js';
import type { Element } from '../xml/XomTypes.js';
import type { ComparisonWindow } from './window.js';

/** `x ↦ (replacement ?? x)·factor + offset` — the closed form both families take. */
export interface AffineEffect {
  readonly replacement: number | null;
  readonly factor: number;
  readonly offset: number;
}

/** The identity: no atom touched this family. */
export const NEUTRAL_EFFECT: AffineEffect = { replacement: null, factor: 1, offset: 0 };

/**
 * Apply `first`, then `second` — the order two atoms on one note are applied in.
 *
 * A later replacement wipes everything before it, which is what the renderer's outright
 * `setValue` does; otherwise the factors multiply and the earlier offset is carried through the
 * later factor. Both follow from substituting one map into the other, and the test suite checks
 * the composition against the renderer rather than against this algebra.
 */
export function composeEffects(first: AffineEffect, second: AffineEffect): AffineEffect {
  if (second.replacement !== null) return second;
  return {
    replacement: first.replacement,
    factor: first.factor * second.factor,
    offset: first.offset * second.factor + second.offset,
  };
}

/** Everything one anchor performs, in the four families the renderer keeps apart. */
export interface EffectiveModifier {
  /** Ticks. `@absoluteDuration` / `@relativeDuration` / `@absoluteDurationChange`. */
  readonly duration: AffineEffect;
  /** Milliseconds. `@absoluteDurationMs` / `@absoluteDurationChangeMs`, never mixed with ticks. */
  readonly durationMs: AffineEffect;
  /** Velocity. `@absoluteVelocity` / `@relativeVelocity` / `@absoluteVelocityChange`. */
  readonly velocity: AffineEffect;
  /** Onset shift in ticks, additive. */
  readonly delayTicks: number;
  /** Onset shift in milliseconds, additive. */
  readonly delayMs: number;
  /** Written onto the note and read by nothing (R14) — reported, never priced. */
  readonly detuneCents: number;
  readonly detuneHz: number;
}

export const NEUTRAL_MODIFIER: EffectiveModifier = {
  duration: NEUTRAL_EFFECT,
  durationMs: NEUTRAL_EFFECT,
  velocity: NEUTRAL_EFFECT,
  delayTicks: 0,
  delayMs: 0,
  detuneCents: 0,
  detuneHz: 0,
};

/** One anchor: a date, or a note id, with the composed modifier every atom there built. */
export interface ArticulationAnchor extends AlignableEvent {
  readonly dateTicks: number;
  /** The note id for an id-anchored group, else null — and the aligner's pin. */
  readonly id: string | null;
  readonly datePositionKnown: boolean;
  readonly modifier: EffectiveModifier;
  /** How many atoms composed into it, for the report. */
  readonly atomCount: number;
}

/** The effect one atom's live attributes have on one family. */
function effectOf(
  atom: ArticulationAtom,
  replacementAttribute: string,
  factorAttribute: string,
  offsetAttribute: string,
): AffineEffect {
  // Live attributes are already in application order — def first, then instruction — and
  // within an element in the order `articulateNote` writes them.
  let effect = NEUTRAL_EFFECT;
  for (const candidate of effectiveAttributes(atom)) {
    if (candidate.attribute === replacementAttribute)
      effect = composeEffects(effect, { replacement: candidate.value, factor: 1, offset: 0 });
    else if (candidate.attribute === factorAttribute)
      effect = composeEffects(effect, { replacement: null, factor: candidate.value, offset: 0 });
    else if (candidate.attribute === offsetAttribute)
      effect = composeEffects(effect, { replacement: null, factor: 1, offset: candidate.value });
  }
  return effect;
}

/** The sum of one atom's live values of an additive attribute. */
function additiveOf(atom: ArticulationAtom, name: string): number {
  let total = 0;
  for (const candidate of effectiveAttributes(atom))
    if (candidate.attribute === name) total += candidate.value;
  return total;
}

/** One atom's own effective modifier, before it is composed with its neighbours. */
export function modifierOf(atom: ArticulationAtom): EffectiveModifier {
  return {
    duration: effectOf(atom, 'absoluteDuration', 'relativeDuration', 'absoluteDurationChange'),
    durationMs: effectOf(atom, 'absoluteDurationMs', '', 'absoluteDurationChangeMs'),
    velocity: effectOf(atom, 'absoluteVelocity', 'relativeVelocity', 'absoluteVelocityChange'),
    delayTicks: additiveOf(atom, 'absoluteDelay'),
    delayMs: additiveOf(atom, 'absoluteDelayMs'),
    detuneCents: additiveOf(atom, 'detuneCents'),
    detuneHz: additiveOf(atom, 'detuneHz'),
  };
}

export function composeModifiers(
  first: EffectiveModifier,
  second: EffectiveModifier,
): EffectiveModifier {
  return {
    duration: composeEffects(first.duration, second.duration),
    durationMs: composeEffects(first.durationMs, second.durationMs),
    velocity: composeEffects(first.velocity, second.velocity),
    delayTicks: first.delayTicks + second.delayTicks,
    delayMs: first.delayMs + second.delayMs,
    detuneCents: first.detuneCents + second.detuneCents,
    detuneHz: first.detuneHz + second.detuneHz,
  };
}

/**
 * Group a scope's atoms into anchors and compose each group, in map order.
 *
 * Date-anchored and id-anchored groups are kept apart (see the module note). Within a group the
 * order is the map's, which is the order the renderer applies them in.
 */
export function anchorsOf(read: ArticulationAtoms): readonly ArticulationAnchor[] {
  // A `Map` preserves insertion order by specification — across buckets by first encounter and,
  // in `groupBy`, within a bucket by encounter — so the groups arrive in map order, which is
  // the order the renderer applies them in. The seedless `reduce` left-associates,
  // `compose(compose(a, b), c)`, and `composeModifiers` is not commutative: a later replacement
  // wipes what precedes it.
  const anchors = [...groupBy(read.atoms, anchorKeyOf).values()].map(
    (group): ArticulationAnchor => {
      const first = head(group);
      return {
        dateTicks: first.dateTicks,
        id: first.noteid,
        datePositionKnown: first.datePositionKnown,
        modifier: group.map(modifierOf).reduce(composeModifiers),
        atomCount: group.length,
      };
    },
  );

  // Date order, then id, so the aligner sees two monotone lists and the ordering is a function
  // of the documents rather than of which atom happened to arrive first.
  //
  // Code-unit order, never `localeCompare` — `compare.ts` bans it by name for the report (§9.5),
  // and here the order is the aligner's input and decides a distance rather than a
  // presentation. Measured under `LC_ALL=sv_SE`/`da_DK`, where 'ä' collates after 'z': two
  // documents with two anchors each at one date and disjoint id sets scored
  // `d_articulation = 13.469` instead of 0, with different report hashes. ASCII moves too ('a'
  // vs 'B', 'x_1' vs 'x-1'), and so do small-icu builds and ICU/CLDR upgrades. The vendored
  // corpus never caught it because every `@noteid` in it is a lowercase `meico_<uuid>`, where
  // collation and code-unit order coincide.
  return anchors.sort((x, y) => {
    const left = x.id ?? '';
    const right = y.id ?? '';
    return x.dateTicks - y.dateTicks || (left < right ? -1 : left > right ? 1 : 0);
  });
}

/**
 * The anchor an atom belongs to: its date when it names no note, its `@noteid` when it does.
 *
 * Prefixed so the two namespaces cannot collide — a note whose id is literally `0` must not be
 * grouped with the atoms anchored at tick 0.
 */
function anchorKeyOf(atom: ArticulationAtom): string {
  return atom.noteid === null ? `date:${String(atom.dateTicks)}` : `id:${atom.noteid}`;
}

/** A row and the pair of values it prices, with `⊥` where one side has no value at all. */
function priceRowWith(
  key: ComparisonJndKey,
  a: Valued<number>,
  b: Valued<number>,
  jnd: JndOverrides,
  capped?: { capped: boolean },
): number {
  const row: ComparisonRegistryRow = comparisonRowWith(key, jnd);
  const local = localDistance(row, a, b);
  if (local.capped && capped !== undefined) capped.capped = true;
  return local.distance;
}

/** A replacement attribute: present-vs-absent is `⊥`, never a difference from a neutral (AD-2). */
function replacementValue(effect: AffineEffect): Valued<number> {
  return effect.replacement === null ? bottom('renderer-error') : valued(effect.replacement);
}

/**
 * `d(modifier_A, modifier_B)` — §5.5's `Σ_live-rows d_row` over the composed effects.
 *
 * Ticks are divided by `ticksPerQuarter` for the rows whose unit is quarters, which is what
 * `ppqSensitive` means: the row's JND is 1/16 quarter and the value arrives in common ticks.
 *
 * `⊥` for a replacement present on one side only is the whole reason §5.5 has that paragraph:
 * a structural finding would contribute 0 and give `A=2, B=absent, C=100` the zero-set
 * violation `d(A,B) = d(B,C) = 0 < d(A,C)` (M1c).
 */
export function modifierDistance(
  a: EffectiveModifier,
  b: EffectiveModifier,
  ticksPerQuarter: number,
  jnd: JndOverrides = {},
  capped?: { capped: boolean },
): number {
  const total = new CompensatedSum();
  const quarters = (ticks: number) => ticks / ticksPerQuarter;
  // Closed over `jnd`: the override belongs to the run, not to each row.
  const priceRow = (key: ComparisonJndKey, x: Valued<number>, y: Valued<number>): number =>
    priceRowWith(key, x, y, jnd, capped);

  total.add(
    priceRow(
      'articulation/articulation@relativeDuration',
      valued(a.duration.factor),
      valued(b.duration.factor),
    ),
  );
  total.add(
    priceRow(
      'articulation/articulation@absoluteDurationChange',
      valued(quarters(a.duration.offset)),
      valued(quarters(b.duration.offset)),
    ),
  );
  if (a.duration.replacement !== null || b.duration.replacement !== null)
    total.add(
      priceRow(
        'articulation/articulation@absoluteDuration',
        replacementValue(a.duration),
        replacementValue(b.duration),
      ),
    );

  total.add(
    priceRow(
      'articulation/articulation@absoluteDurationChangeMs',
      valued(a.durationMs.offset),
      valued(b.durationMs.offset),
    ),
  );
  if (a.durationMs.replacement !== null || b.durationMs.replacement !== null)
    total.add(
      priceRow(
        'articulation/articulation@absoluteDurationMs',
        replacementValue(a.durationMs),
        replacementValue(b.durationMs),
      ),
    );

  total.add(
    priceRow(
      'articulation/articulation@relativeVelocity',
      valued(a.velocity.factor),
      valued(b.velocity.factor),
    ),
  );
  total.add(
    priceRow(
      'articulation/articulation@absoluteVelocityChange',
      valued(a.velocity.offset),
      valued(b.velocity.offset),
    ),
  );
  if (a.velocity.replacement !== null || b.velocity.replacement !== null)
    total.add(
      priceRow(
        'articulation/articulation@absoluteVelocity',
        replacementValue(a.velocity),
        replacementValue(b.velocity),
      ),
    );

  total.add(
    priceRow(
      'articulation/articulation@absoluteDelay',
      valued(quarters(a.delayTicks)),
      valued(quarters(b.delayTicks)),
    ),
  );
  total.add(
    priceRow('articulation/articulation@absoluteDelayMs', valued(a.delayMs), valued(b.delayMs)),
  );

  // detuneCents / detuneHz are inert (R14): read, written onto the note, consumed by nothing.
  // R9b's rule is zero density, reported where the documents differ, so they are deliberately
  // absent from this sum.
  return total.total;
}

/** A difference in an inert attribute: reported, never priced (R9b). */
export interface InertFinding {
  readonly attribute: 'detuneCents' | 'detuneHz';
  readonly dateTicks: number;
  readonly a: number;
  readonly b: number;
}

export interface ArticulationDistance {
  readonly distance: number;
  readonly matched: number;
  readonly unmatchedA: number;
  readonly unmatchedB: number;
  /** False where a crossing id-pin set forced the aligner back to the unpinned optimum. */
  readonly pinsHonoured: boolean;
  readonly inertFindings: readonly InertFinding[];
  /**
   * The optimum placed on the timeline (AD-51.2) — §5.0's atoms, in JND, before `κ`.
   *
   * They sum to {@link distance} up to summation order: the DP accumulates along its path and
   * this list is summed by the caller, so the two agree to within floating-point associativity
   * rather than bit for bit. AD-19's table closes on this decomposition, which is why the
   * aggregation takes it rather than the scalar.
   */
  readonly atoms: readonly EventAtomMass[];
  /**
   * False where any anchor in play is id-anchored without an MSM, so its mass is spread over
   * the window rather than placed (AD-7, AD-39.1). The report states it (§9.3).
   */
  readonly datePositionKnown: boolean;
  /**
   * How many anchors of the chosen alignment had §4's cap bind on at least one row (AD-2).
   *
   * Counted over the optimum rather than inside the cost function, which the DP evaluates at
   * every cell of its table: a counter incremented there would report the search rather than
   * the answer.
   */
  readonly cappedAnchors: number;
}

/**
 * `d_articulation` over the window — the alignment's own optimum (§5.6/AD-7).
 *
 * The alignment is the distance: §5.6 makes the minimized functional the semantic definition,
 * so this function supplies the two costs and hands the argmin's value back. An anchor outside
 * the window is dropped before aligning, because §5.0's window is what every other dimension
 * integrates over and an atom beyond it is not performed in the compared interval.
 */
export function articulationDistance(
  a: ArticulationAtoms,
  b: ArticulationAtoms,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  lambdaDate: number = DEFAULT_LAMBDA_DATE,
  jnd: JndOverrides = {},
): ArticulationDistance {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  // An id-anchored atom has no known date, so the window cannot exclude it (§5.5): it is
  // carried, which is the conservative reading — dropping it would silently forgive a
  // difference the renderer performs somewhere in the piece.
  const inWindow = (anchor: ArticulationAnchor) =>
    !anchor.datePositionKnown || (anchor.dateTicks >= startTicks && anchor.dateTicks < endTicks);

  const anchorsA = anchorsOf(a).filter(inWindow);
  const anchorsB = anchorsOf(b).filter(inWindow);

  const alignment = alignEvents(
    anchorsA,
    anchorsB,
    {
      matched: (x, y) => modifierDistance(x.modifier, y.modifier, ticksPerQuarter, jnd),
      unmatched: (x) => modifierDistance(x.modifier, NEUTRAL_MODIFIER, ticksPerQuarter, jnd),
      lambdaDate,
    },
    ticksPerQuarter,
  );

  const inertFindings: InertFinding[] = [];
  for (const pair of alignment.pairs) {
    const anchorA = elementAt(anchorsA, pair.a, A_ANCHORS);
    const x = anchorA.modifier;
    const y = elementAt(anchorsB, pair.b, B_ANCHORS).modifier;
    if (x.detuneCents !== y.detuneCents)
      inertFindings.push({
        attribute: 'detuneCents',
        dateTicks: anchorA.dateTicks,
        a: x.detuneCents,
        b: y.detuneCents,
      });
    if (x.detuneHz !== y.detuneHz)
      inertFindings.push({
        attribute: 'detuneHz',
        dateTicks: anchorA.dateTicks,
        a: x.detuneHz,
        b: y.detuneHz,
      });
  }

  return {
    distance: alignment.cost,
    matched: alignment.pairs.length,
    unmatchedA: alignment.unmatchedA.length,
    unmatchedB: alignment.unmatchedB.length,
    pinsHonoured: alignment.pinsHonoured,
    inertFindings,
    cappedAnchors: cappedAnchorsOf(alignment, anchorsA, anchorsB, ticksPerQuarter, jnd),
    atoms: chargeAtoms(anchorsA, anchorsB, alignment, (anchor) => anchor.datePositionKnown, {
      startTicks,
      endTicks,
    }),
    datePositionKnown: [...anchorsA, ...anchorsB].every((anchor) => anchor.datePositionKnown),
  };
}

/** One cell of the two default step functions' joint refinement. */
export interface DefaultArticulationCell {
  readonly startQuarters: number;
  readonly endQuarters: number;
  /** JND per quarter — constant across the cell, since both defaults are. */
  readonly densityPerQuarter: number;
  /** JND·quarters. */
  readonly mass: number;
  readonly capped: boolean;
}

export interface DefaultArticulationDistance {
  readonly distance: number;
  readonly cells: readonly DefaultArticulationCell[];
  readonly cappedCells: number;
}

/**
 * `d_default` over the window — the `@defaultArticulation` step function's own component.
 *
 * The two curves are piecewise constant, so their joint refinement is the union of their step
 * dates and the integrand is constant inside every cell: the cell's mass is the modifier
 * distance times the cell's length, with no quadrature in the time domain at all. That is
 * §5.7's `step` epsilon family, exactly, and it is why this component adds no numerical error
 * to the one the alignment already carries.
 *
 * A step with no def in force — the two cancelling dispositions of AD-37.2, and the whole
 * pre-first-switch region of a document that has no default at all — prices as the neutral
 * modifier and never as `⊥`: the renderer performs such a note at its written duration, a known
 * value rather than an unreadable one.
 */
export function defaultArticulationDistance(
  a: DefaultArticulationCurve,
  b: DefaultArticulationCurve,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  jnd: JndOverrides = {},
): DefaultArticulationDistance {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;

  const edges = new Set<number>([startTicks, endTicks]);
  for (const curve of [a, b])
    for (const step of curve.steps)
      if (step.startTicks > startTicks && step.startTicks < endTicks) edges.add(step.startTicks);
  const grid = [...edges].sort((x, y) => x - y);

  // One modifier per def, not per cell: a default in force across twenty steps would otherwise
  // resolve the same element twenty times, and the resolution is the expensive half.
  const modifiers = new Map<Element | null, EffectiveModifier>();
  const modifierAt = (curve: DefaultArticulationCurve, ticks: number): EffectiveModifier => {
    const def = defaultArticulationAt(curve, ticks);
    if (def === null) return NEUTRAL_MODIFIER;
    const known = modifiers.get(def);
    if (known !== undefined) return known;
    const modifier = modifierOf(articulationDefAtom(def, ticks));
    modifiers.set(def, modifier);
    return modifier;
  };

  const total = new CompensatedSum();
  const cells: DefaultArticulationCell[] = [];
  let cappedCells = 0;

  for (const [lowTicks, highTicks] of pairwise(grid)) {
    const lengthQuarters = (highTicks - lowTicks) / ticksPerQuarter;
    if (!(lengthQuarters > 0)) continue;

    const flag = { capped: false };
    const density = modifierDistance(
      modifierAt(a, lowTicks),
      modifierAt(b, lowTicks),
      ticksPerQuarter,
      jnd,
      flag,
    );
    if (density === 0 && !flag.capped) continue;
    if (flag.capped) cappedCells += 1;

    const mass = density * lengthQuarters;
    total.add(mass);
    cells.push({
      startQuarters: lowTicks / ticksPerQuarter,
      endQuarters: highTicks / ticksPerQuarter,
      densityPerQuarter: density,
      mass,
      capped: flag.capped,
    });
  }

  return { distance: total.total, cells, cappedCells };
}

/** What an out-of-range read into an anchor list is called (`indexing.ts`). */
const A_ANCHORS = 'the a-side articulation anchors';
const B_ANCHORS = 'the b-side articulation anchors';

/** AD-2's cap events, counted over the chosen alignment (see {@link ArticulationDistance}). */
function cappedAnchorsOf(
  alignment: EventAlignment,
  a: readonly ArticulationAnchor[],
  b: readonly ArticulationAnchor[],
  ticksPerQuarter: number,
  jnd: JndOverrides,
): number {
  let count = 0;
  for (const charge of alignment.charges) {
    const flag = { capped: false };
    const left = charge.a === null ? NEUTRAL_MODIFIER : elementAt(a, charge.a, A_ANCHORS).modifier;
    const right = charge.b === null ? NEUTRAL_MODIFIER : elementAt(b, charge.b, B_ANCHORS).modifier;
    modifierDistance(left, right, ticksPerQuarter, jnd, flag);
    if (flag.capped) count += 1;
  }
  return count;
}

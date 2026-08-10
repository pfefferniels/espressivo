/**
 * The ornamentation distance — DESIGN.md §5.6, and the event aligner's **second consumer**.
 *
 * §5.6 makes the alignment the semantic distance, so this module's whole job is to supply the
 * two costs `eventAlignment` asks for and hand its optimum back. That the module can do so
 * without changing the aligner's interface is the point AD-37.6 built it for: articulation
 * anchors carry a composed affine modifier and ornaments carry a resolved gradient and frame,
 * and the aligner never learns the difference.
 *
 * Every value priced here is a **resolved performed effect** (AD-40.2): the gradient arrives as
 * `(from·scale, to·scale)` from `ornamentAtoms`, so `@scale` is never priced on its own and two
 * encodings of one performed ramp are distance 0.
 *
 * ## Absence is NEUTRAL, not incomparable (AD-42.3, AD-43.2ii)
 *
 * An ornament whose def carries no `<dynamicsGradient>` performs exactly what one with
 * `transition.from="0" transition.to="0"` performs, and one with no `<temporalSpread>` exactly
 * what `frame.start="0" frameLength="0"` performs — both measured through `Performance.perform`,
 * which is the test AD-43.2ii sets. A neutral parameterization reproduces absence, so absence
 * has a neutral and prices as a deviation from it rather than as `⊥`. That matters twice over:
 * `⊥` is reserved for AD-2's narrow incomparable list, and a flat `⊥` for every dropped ornament
 * makes the alignment blind to what the dropped ornament actually performs — every drop would
 * cost the same constant.
 *
 * The one genuinely incomparable case survives: two frames in different `@time.unit` domains are
 * not a large difference, they are not comparable at all, and those rows read `⊥` (AD-43.2ii
 * keeps this explicitly). So does a frame or gradient the renderer performs as NaN, which erases
 * the note — R24's condition, priced at `δ_row` since AD-1.
 *
 * ## Unmatched events price per row against neutral (AD-42.3)
 *
 * `gap(a) ≤ sub(a, b) + gap(b)` is the T-space triangle inequality anchored at neutral, which is
 * the construction that makes the alignment a metric. It holds because every gap cost here is
 * the same row-wise functional evaluated against the neutral ornament, and not a constant.
 */
import {
  comparisonRowFor,
  localDistance,
  type ComparisonJndKey,
  type ComparisonRegistryRow,
} from './registry.js';
import { CompensatedSum } from './quadrature.js';
import { alignEvents, DEFAULT_LAMBDA_DATE } from './eventAlignment.js';
import {
  NEUTRAL_SPREAD,
  type OrnamentAtom,
  type OrnamentAtoms,
  type PerformedGradient,
  type PerformedSpread,
} from './ornamentAtoms.js';
import { bottom, valued, isBottom, type Valued } from './values.js';
import type { ComparisonWindow } from './window.js';

/** A structural difference §5.6 reports rather than prices. */
export interface OrnamentFinding {
  readonly kind: 'note-order-ids' | 'time-unit' | 'v3-spelling' | 'shape' | 'def-name';
  readonly dateTicks: number;
  readonly a: string;
  readonly b: string;
}

export interface OrnamentationDistance {
  readonly distance: number;
  readonly matched: number;
  readonly unmatchedA: number;
  readonly unmatchedB: number;
  readonly pinsHonoured: boolean;
  readonly findings: readonly OrnamentFinding[];
}

function price(key: ComparisonJndKey, a: Valued<number>, b: Valued<number>): number {
  const row: ComparisonRegistryRow = comparisonRowFor(key);
  return localDistance(row, a, b).distance;
}

/** `⊥` on one side costs `δ_row` whatever the other side holds, so this is swap-symmetric. */
function incomparable(key: ComparisonJndKey, other: number): number {
  return price(key, bottom('renderer-error'), valued(other));
}

/** The gradient a side performs: absent means the neutral pair, which it performs identically. */
const NEUTRAL_GRADIENT: PerformedGradient = { from: 0, to: 0 };

function gradientOf(atom: OrnamentAtom): Valued<PerformedGradient> {
  return atom.gradient ?? valued(NEUTRAL_GRADIENT);
}

/** The frame a side performs, in the atom's own domain so that absence is a real zero frame. */
function spreadOf(atom: OrnamentAtom): Valued<PerformedSpread> {
  return atom.spread ?? valued(NEUTRAL_SPREAD);
}

/** 0 = "ascending pitch" (also the absent default), 1 = "descending pitch" (AD-41.1). */
function noteOrderValue(atom: OrnamentAtom): number | null {
  switch (atom.noteOrderKind) {
    case 'descending':
      return 1;
    case 'ascending':
    case null:
      return 0;
    // An id list and the v3 grammar NAME notes; that is an identity claim, not a magnitude,
    // and it goes to the finding channel on §5.8's @controller precedent.
    default:
      return null;
  }
}

/**
 * `Σ_rows d_row` between two ornaments' resolved effects — the aligner's `matched` cost.
 *
 * Tick-valued frame quantities are divided by `ticksPerQuarter` because their rows are stated in
 * quarters; a millisecond frame is not, and a `relative` one is a percentage, which is why the
 * domains must agree before any of them is compared.
 */
export function ornamentDistance(
  a: OrnamentAtom,
  b: OrnamentAtom,
  ticksPerQuarter: number,
): number {
  const total = new CompensatedSum();

  const gradientA = gradientOf(a);
  const gradientB = gradientOf(b);
  const fromA = isBottom(gradientA) ? gradientA : valued(gradientA.value.from);
  const fromB = isBottom(gradientB) ? gradientB : valued(gradientB.value.from);
  const toA = isBottom(gradientA) ? gradientA : valued(gradientA.value.to);
  const toB = isBottom(gradientB) ? gradientB : valued(gradientB.value.to);
  total.add(price('ornamentation/dynamicsGradient@transition.from', fromA, fromB));
  total.add(price('ornamentation/dynamicsGradient@transition.to', toA, toB));

  const spreadA = spreadOf(a);
  const spreadB = spreadOf(b);
  // The v3 spelling picks the row for the report; both rows carry the same space, unit and jnd,
  // so the choice never moves the number, and "either side is v3" keeps it swap-symmetric.
  const startKey: ComparisonJndKey =
    (!isBottom(spreadA) && spreadA.value.source === 'v3') ||
    (!isBottom(spreadB) && spreadB.value.source === 'v3')
      ? 'ornamentation/temporalSpread@frame.offset'
      : 'ornamentation/temporalSpread@frame.start';

  if (isBottom(spreadA) || isBottom(spreadB)) {
    const known = isBottom(spreadA) ? spreadB : spreadA;
    const value = isBottom(known) ? 0 : known.value.frameStart;
    total.add(incomparable(startKey, value));
    total.add(incomparable('ornamentation/temporalSpread@frameLength', value));
    total.add(incomparable('ornamentation/temporalSpread@intensity', 1));
  } else if (spreadA.value.domain !== spreadB.value.domain) {
    // Genuinely incomparable, and AD-43.2ii keeps this at ⊥ regardless of the neutral rule: a
    // frame in milliseconds and one in ticks are not a big difference, they are not commensurable.
    total.add(incomparable(startKey, spreadB.value.frameStart));
    total.add(incomparable('ornamentation/temporalSpread@frameLength', spreadB.value.frameLength));
    total.add(
      price(
        'ornamentation/temporalSpread@intensity',
        valued(spreadA.value.intensity),
        valued(spreadB.value.intensity),
      ),
    );
  } else {
    // Ticks are stated in quarters by their rows; milliseconds and percent are already absolute.
    const scale = spreadA.value.domain === 'ticks' ? 1 / ticksPerQuarter : 1;
    total.add(
      price(
        startKey,
        valued(spreadA.value.frameStart * scale),
        valued(spreadB.value.frameStart * scale),
      ),
    );
    total.add(
      price(
        'ornamentation/temporalSpread@frameLength',
        valued(spreadA.value.frameLength * scale),
        valued(spreadB.value.frameLength * scale),
      ),
    );
    total.add(
      price(
        'ornamentation/temporalSpread@intensity',
        valued(spreadA.value.intensity),
        valued(spreadB.value.intensity),
      ),
    );
  }

  const orderA = noteOrderValue(a);
  const orderB = noteOrderValue(b);
  if (orderA !== null && orderB !== null)
    total.add(price('ornamentation/ornament@note.order', valued(orderA), valued(orderB)));

  total.add(
    price('ornamentation/ornament@repetitions', valued(a.repetitions), valued(b.repetitions)),
  );

  return total.total;
}

/**
 * The neutral counterpart of an ornament: what "no ornament here" performs.
 *
 * It adopts the atom's own frame DOMAIN, because a millisecond frame's deviation from no frame
 * is its own magnitude in milliseconds and not an incomparability — substituting the tick
 * default would price every dropped millisecond frame at `δ_row` and lose exactly the
 * content-dependence AD-42.3 restored.
 */
function neutralCounterpart(atom: OrnamentAtom): OrnamentAtom {
  const domain =
    atom.spread !== null && !isBottom(atom.spread) ? atom.spread.value.domain : 'ticks';
  const source = atom.spread !== null && !isBottom(atom.spread) ? atom.spread.value.source : 'v2';
  return {
    ...atom,
    noteOrderKind: null,
    repetitions: 0,
    gradient: valued(NEUTRAL_GRADIENT),
    spread: valued({ ...NEUTRAL_SPREAD, domain, source }),
  };
}

/** What one ornament costs to leave unmatched — its deviation from performing nothing. */
export function deviationFromNeutral(atom: OrnamentAtom, ticksPerQuarter: number): number {
  return ornamentDistance(atom, neutralCounterpart(atom), ticksPerQuarter);
}

/** The structural differences a matched pair reports without pricing (§5.6). */
function findingsFor(x: OrnamentAtom, y: OrnamentAtom): OrnamentFinding[] {
  const found: OrnamentFinding[] = [];
  const at = x.dateTicks;
  if (noteOrderValue(x) === null || noteOrderValue(y) === null) {
    if ((x.noteOrder ?? '') !== (y.noteOrder ?? ''))
      found.push({
        kind: 'note-order-ids',
        dateTicks: at,
        a: x.noteOrder ?? '',
        b: y.noteOrder ?? '',
      });
  }
  const domainOf = (atom: OrnamentAtom): string =>
    atom.spread === null || isBottom(atom.spread) ? 'none' : atom.spread.value.domain;
  if (domainOf(x) !== domainOf(y))
    found.push({ kind: 'time-unit', dateTicks: at, a: domainOf(x), b: domainOf(y) });
  const spellingOf = (atom: OrnamentAtom): string =>
    atom.spread === null || isBottom(atom.spread) ? 'none' : atom.spread.value.source;
  if (spellingOf(x) !== spellingOf(y))
    found.push({ kind: 'v3-spelling', dateTicks: at, a: spellingOf(x), b: spellingOf(y) });
  if (x.shape !== y.shape) found.push({ kind: 'shape', dateTicks: at, a: x.shape, b: y.shape });
  if ((x.nameRef ?? '') !== (y.nameRef ?? ''))
    found.push({ kind: 'def-name', dateTicks: at, a: x.nameRef ?? '', b: y.nameRef ?? '' });
  return found;
}

/**
 * `d_ornamentation` over the window — the alignment's own optimum (§5.6/AD-7).
 *
 * The aligner is used **unchanged** from its articulation debut: the same `alignEvents`, the
 * same `AlignableEvent` shape (`dateTicks` plus an `id` pin), the same three-field cost. That is
 * the interface question AD-37.6 posed, answered by a second consumer rather than by assertion.
 */
export function ornamentationDistance(
  a: OrnamentAtoms,
  b: OrnamentAtoms,
  window: ComparisonWindow,
  ticksPerQuarter: number,
  lambdaDate: number = DEFAULT_LAMBDA_DATE,
): OrnamentationDistance {
  const startTicks = window.startQuarters * ticksPerQuarter;
  const endTicks = window.endQuarters * ticksPerQuarter;
  const inWindow = (atom: OrnamentAtom): boolean =>
    atom.dateTicks >= startTicks && atom.dateTicks < endTicks;

  const atomsA = a.atoms.filter(inWindow);
  const atomsB = b.atoms.filter(inWindow);

  const alignment = alignEvents(
    atomsA,
    atomsB,
    {
      matched: (x, y) => ornamentDistance(x, y, ticksPerQuarter),
      unmatched: (x) => deviationFromNeutral(x, ticksPerQuarter),
      lambdaDate,
    },
    ticksPerQuarter,
  );

  const findings: OrnamentFinding[] = [];
  for (const pair of alignment.pairs) findings.push(...findingsFor(atomsA[pair.a], atomsB[pair.b]));

  return {
    distance: alignment.cost,
    matched: alignment.pairs.length,
    unmatchedA: alignment.unmatchedA.length,
    unmatchedB: alignment.unmatchedB.length,
    pinsHonoured: alignment.pinsHonoured,
    findings,
  };
}

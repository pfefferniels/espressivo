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
 */
import { comparisonRowFor, localDistance, type ComparisonJndKey } from './registry.js';
import { CompensatedSum } from './quadrature.js';
import { alignEvents, DEFAULT_LAMBDA_DATE } from './eventAlignment.js';
import type { OrnamentAtom, OrnamentAtoms } from './ornamentAtoms.js';
import { bottom, valued, type Valued } from './values.js';
import type { ComparisonWindow } from './window.js';

/** A structural difference §5.6 reports rather than prices. */
export interface OrnamentFinding {
  readonly kind: 'note-order' | 'time-unit' | 'v3-spelling';
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
  return localDistance(comparisonRowFor(key), a, b).distance;
}

/**
 * A quantity one side performs and the other does not.
 *
 * `⊥` rather than a difference from a neutral, for §5.5's reason carried over: a `<temporalSpread>`
 * that is present on one side only has no neutral to be measured against — there is no
 * "unspread frame" of width 0 that the document meant — and pricing it at 0 would reopen M1c's
 * zero-set violation.
 */
const presence = (value: number | null): Valued<number> =>
  value === null ? bottom('renderer-error') : valued(value);

/**
 * `Σ_rows d_row` between two ornaments' resolved effects — the aligner's `matched` cost.
 *
 * Tick-valued frame quantities are divided by `ticksPerQuarter` because their rows are stated
 * in quarters; a frame in the millisecond domain is NOT, which is what makes `@time.unit` a
 * structural finding rather than a unit conversion.
 */
export function ornamentDistance(
  a: OrnamentAtom,
  b: OrnamentAtom,
  ticksPerQuarter: number,
): number {
  const total = new CompensatedSum();

  // The gradient, already scaled (AD-40.2). Priced only where at least one side performs one.
  if (a.gradient !== null || b.gradient !== null) {
    total.add(
      price(
        'ornamentation/dynamicsGradient@transition.from',
        presence(a.gradient?.from ?? null),
        presence(b.gradient?.from ?? null),
      ),
    );
    total.add(
      price(
        'ornamentation/dynamicsGradient@transition.to',
        presence(a.gradient?.to ?? null),
        presence(b.gradient?.to ?? null),
      ),
    );
  }

  if (a.spread !== null || b.spread !== null) {
    // A frame in milliseconds is not commensurable with one in ticks; where the two domains
    // disagree the numbers are not comparable at all, which is a ⊥ and not a big difference.
    const domainsAgree = (a.spread?.milliseconds ?? false) === (b.spread?.milliseconds ?? false);
    const inQuarters = (atom: OrnamentAtom, value: number | undefined): number | null => {
      if (value === undefined) return null;
      return atom.spread?.milliseconds === true ? value : value / ticksPerQuarter;
    };

    const startKey: ComparisonJndKey =
      a.spread?.v3Offset === true || b.spread?.v3Offset === true
        ? 'ornamentation/temporalSpread@frame.offset'
        : 'ornamentation/temporalSpread@frame.start';

    if (domainsAgree) {
      total.add(
        price(
          startKey,
          presence(inQuarters(a, a.spread?.frameStart)),
          presence(inQuarters(b, b.spread?.frameStart)),
        ),
      );
      total.add(
        price(
          'ornamentation/temporalSpread@frameLength',
          presence(inQuarters(a, a.spread?.frameLength)),
          presence(inQuarters(b, b.spread?.frameLength)),
        ),
      );
    } else {
      // Incommensurable domains: both frame rows read ⊥ on one side.
      total.add(price(startKey, presence(null), presence(inQuarters(b, b.spread?.frameStart))));
      total.add(
        price(
          'ornamentation/temporalSpread@frameLength',
          presence(null),
          presence(inQuarters(b, b.spread?.frameLength)),
        ),
      );
    }

    total.add(
      price(
        'ornamentation/temporalSpread@intensity',
        presence(a.spread?.intensity ?? null),
        presence(b.spread?.intensity ?? null),
      ),
    );
  }

  return total.total;
}

/** What one ornament costs to leave unmatched — its distance from performing nothing. */
function deviationFromNeutral(atom: OrnamentAtom, ticksPerQuarter: number): number {
  const neutral: OrnamentAtom = {
    ...atom,
    gradient: null,
    spread: null,
  };
  return ornamentDistance(atom, neutral, ticksPerQuarter);
}

/**
 * `d_ornamentation` over the window — the alignment's own optimum (§5.6/AD-7).
 *
 * The aligner is used **unchanged** from its articulation debut: the same `alignEvents`, the
 * same `AlignableEvent` shape (`dateTicks` plus an `id` pin), the same three-field cost. That
 * is the interface question AD-37.6 posed, answered by a second consumer rather than by
 * assertion.
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
  const inWindow = (atom: OrnamentAtom) =>
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
  for (const pair of alignment.pairs) {
    const x = atomsA[pair.a];
    const y = atomsB[pair.b];
    if ((x.noteOrder ?? '') !== (y.noteOrder ?? ''))
      findings.push({
        kind: 'note-order',
        dateTicks: x.dateTicks,
        a: x.noteOrder ?? '',
        b: y.noteOrder ?? '',
      });
    if ((x.spread?.milliseconds ?? false) !== (y.spread?.milliseconds ?? false))
      findings.push({
        kind: 'time-unit',
        dateTicks: x.dateTicks,
        a: x.spread?.milliseconds === true ? 'milliseconds' : 'ticks',
        b: y.spread?.milliseconds === true ? 'milliseconds' : 'ticks',
      });
    if ((x.spread?.v3Offset ?? false) !== (y.spread?.v3Offset ?? false))
      findings.push({
        kind: 'v3-spelling',
        dateTicks: x.dateTicks,
        a: x.spread?.v3Offset === true ? 'frame.offset' : 'frame.start',
        b: y.spread?.v3Offset === true ? 'frame.offset' : 'frame.start',
      });
  }

  return {
    distance: alignment.cost,
    matched: alignment.pairs.length,
    unmatchedA: alignment.unmatchedA.length,
    unmatchedB: alignment.unmatchedB.length,
    pinsHonoured: alignment.pinsHonoured,
    findings,
  };
}

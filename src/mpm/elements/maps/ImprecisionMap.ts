import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { RandomNumberProvider } from '../../../supplementary/RandomNumberProvider.js';
import {
  andThen,
  elementAt,
  err,
  mapOk,
  mapPresent,
  matchKind,
  ok,
  type Result,
} from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { GenericMap } from './GenericMap.js';
import {
  DISTRIBUTION_BROWNIAN,
  DISTRIBUTION_COMPENSATING_TRIANGLE,
  DISTRIBUTION_GAUSSIAN,
  DISTRIBUTION_TRIANGULAR,
  DISTRIBUTION_UNIFORM,
  minAndMaxOfDistributionList,
  parseDistribution,
  type Distribution,
  type UnknownDistributionFamily,
} from './data/distribution.js';
import { deriveSeed } from '../../RenderOptions.js';
import type { RenderContext } from '../../RenderOptions.js';

/** One distribution together with the stretch of the timeline it governs. */
export interface DistributionSpan {
  readonly distribution: Distribution;
  /**
   * The date of the immediately following entry, whatever kind of entry that is, or
   * `Number.MAX_VALUE` for the last one. See {@link ImprecisionMap.distributionAt}.
   */
  readonly endDate: number;
}

/** Why {@link ImprecisionMap.distributionAt} could not produce a {@link DistributionSpan}. */
export type DistributionEntryProblem =
  | {
      /** The map has no entry at that index — it is empty, or the index was negative. */
      readonly kind: 'noEntry';
      readonly index: number;
    }
  | {
      /** The entry is something else: a `<style>` switch, most often. */
      readonly kind: 'notADistribution';
      readonly localName: string;
    }
  | UnknownDistributionFamily;

/**
 * What one distribution leaves behind for the next.
 *
 * A correlated distribution continues its predecessor's sequence rather than starting a
 * fresh one, and the single thing it needs from that predecessor is the grid the
 * predecessor's draws were indexed on. Naming that as its own one-field type, rather than
 * keeping the whole previous `DistributionData` alive to read one field off it, is what
 * makes the handover's actual dependency visible.
 *
 * `timingBasisMs` is `number | null` for one reason only: an unrecognised `distribution.*`
 * element becomes a predecessor before any basis has been resolved for it, and null is
 * what the incumbent then divided by. See {@link UnknownDistributionFamily}.
 */
export interface Predecessor {
  readonly timingBasisMs: number | null;
}

/**
 * A distribution parameter on its way into {@link RandomNumberProvider}.
 *
 * The provider's factories are typed `number`, and for a document that declares every
 * attribute of its family they are. MPM does not require that, and **the port's behaviour
 * for a document that omits one is specified, measured and depended upon**: the `null`
 * reaches the provider's arithmetic, where `null - null` is 0, `d > null` is `d > 0`, and
 * `clip()` can return the `null` itself, which the write-back then adds to an attribute as
 * a no-op (`attValue + null === attValue`). That is how a clip-less triangular performs
 * exactly δ₀ rather than `NaN` — see `src/comparison/imprecisionLaws.ts` for the full
 * nine-case table and `tests/comparison/imprecisionDegenerate.test.ts` for the pin.
 *
 * Substituting `0` for the `null` is **not** equivalent, which is why this is a cast and
 * not a `?? 0`: `RandomNumberProvider.triangularDistribution` opens with
 * `upperLimit === lowerLimit`, a *strict* comparison that separates a declared `0` from an
 * absent limit and takes a different number of draws from the sequence depending on the
 * answer.
 *
 * So this is deliberately not the thirty `!`s it replaces. A `!` claims the value is
 * present, which here is false. This claims something true — that `null` is a legal
 * argument at this boundary, with a defined meaning — and says it once instead of thirty
 * times.
 */
function asProviderParameter(value: number | null): number {
  return value as number;
}

/**
 * The provider one distribution draws from, correlated handover included.
 *
 * Exhaustive by construction: a seventh family added to {@link Distribution} fails to
 * compile here. The two correlated arms draw from `randomPrev` exactly once, before their
 * own provider exists — the position of that draw is part of the output sequence (see the
 * class's randomness contract).
 *
 * Exported for the tests rather than for callers: this table is six transcriptions of six
 * positional factory signatures, which is precisely the kind of thing that can be wrong in
 * a way no end-to-end assertion notices — swapping a triangular's `mode` and `clip.lower`
 * still renders plausible numbers. The suite reads the parameters back off the provider.
 */
export function providerFor(
  distribution: Distribution,
  randomPrev: RandomNumberProvider | null,
  predecessor: Predecessor | null,
): RandomNumberProvider {
  return matchKind(distribution, {
    uniform: (d) =>
      RandomNumberProvider.createRandomNumberProvider_uniformDistribution(
        asProviderParameter(d.lowerLimit),
        asProviderParameter(d.upperLimit),
      ),
    gaussian: (d) =>
      RandomNumberProvider.createRandomNumberProvider_gaussianDistribution(
        asProviderParameter(d.standardDeviation),
        asProviderParameter(d.lowerLimit),
        asProviderParameter(d.upperLimit),
      ),
    triangular: (d) =>
      RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
        asProviderParameter(d.lowerLimit),
        asProviderParameter(d.upperLimit),
        asProviderParameter(d.mode),
        asProviderParameter(d.lowerClip),
        asProviderParameter(d.upperClip),
      ),
    brownian: (d) => {
      const handover = handoverValue(randomPrev, predecessor, d);
      const random = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(
        asProviderParameter(d.maxStepWidth),
        asProviderParameter(d.lowerLimit),
        asProviderParameter(d.upperLimit),
      );
      applyHandover(handover, random);
      return random;
    },
    compensatingTriangle: (d) => {
      const handover = handoverValue(randomPrev, predecessor, d);
      const random =
        RandomNumberProvider.createRandomNumberProvider_compensatingTriangleDistribution(
          asProviderParameter(d.degreeOfCorrelation),
          asProviderParameter(d.lowerLimit),
          asProviderParameter(d.upperLimit),
          asProviderParameter(d.lowerClip),
          asProviderParameter(d.upperClip),
        );
      applyHandover(handover, random);
      return random;
    },
    list: (d) =>
      RandomNumberProvider.createRandomNumberProvider_distributionList(d.distributionList),
  });
}

/**
 * The value a correlated distribution should continue from when it succeeds another
 * one — drawn from the *previous* provider at the new distribution's own start date,
 * so the two sequences meet without a discontinuity.
 *
 * Draws from `randomPrev` exactly once, and only when there is a predecessor to draw
 * from. Both the count and the position of that draw are part of the output sequence
 * (class doc). Returns null when there is no predecessor, which
 * {@link applyHandover} then treats as "seed a fresh sequence".
 *
 * The date is read off the element with the namespace-tolerant `attribute()` rather than
 * from the already-parsed `startDate`, and the two are not the same lookup — that is why
 * {@link Distribution} keeps its source element.
 */
function handoverValue(
  randomPrev: RandomNumberProvider | null,
  predecessor: Predecessor | null,
  next: Distribution,
): number | null {
  if (predecessor === null || randomPrev === null) return null;

  const ddMsDateEndAtt = attribute('milliseconds.date', next.xml);
  if (ddMsDateEndAtt === null) return null;

  const ddMsDateEnd = parseFloat(ddMsDateEndAtt.getValue());
  const endIndex = ddMsDateEnd / asProviderParameter(predecessor.timingBasisMs);
  return randomPrev.getValue(endIndex);
}

/**
 * Seed a correlated distribution's starting value: continue from `value` if a
 * predecessor supplied one, otherwise start from a random point in the middle half of
 * the provider's range (the `* 0.5` scale factor plus the `+ scaleFactor * 0.5`
 * offset), so a fresh sequence does not begin pinned to a limit.
 *
 * The fallback uses `Math.random()`, not the provider — this is one of the places the
 * class doc's "nondeterministic by design" caveat comes from.
 */
function applyHandover(value: number | null, random: RandomNumberProvider): void {
  if (value !== null) {
    random.setInitialValue(value);
  } else {
    const scaleFactor = (random.getUpperLimit() - random.getLowerLimit()) * 0.5;
    const firstValue = Math.random() * scaleFactor + random.getLowerLimit() + scaleFactor * 0.5;
    random.setInitialValue(firstValue);
  }
}

/**
 * The sampling grid this distribution's draws are indexed on.
 *
 * A declared `milliseconds.timingBasis` is used verbatim, **including a zero or negative
 * one** — the `<= 0` fallback below guards only the *derived* value, and a declared 0
 * makes the index infinite and the render throw, which is the ⊥ route
 * `src/comparison/imprecisionLaws.ts` documents. Keeping that asymmetry is the reason for
 * the early return rather than one combined test at the end.
 *
 * Where nothing is declared, the basis is derived from the family's own spread, and only
 * in the timing domain, where a spread measured in milliseconds means something. Every
 * other domain, and every derivation that comes out at zero or below, falls back to 100.
 *
 * Exported for the tests, for the reason {@link providerFor} gives: the comparison module
 * has its own independent copy of this derivation (`src/comparison/imprecisionLaws.ts`),
 * so a test that reads a timing basis through *that* reader cannot see a mistake in this
 * one.
 *
 * `?? 0` is not a behaviour change from the incumbent's `upperLimit! - lowerLimit!`:
 * subtraction ToNumber-coerces, `Number(null)` is 0, so `null - x`, `x - null` and
 * `null - null` are already `0 - x`, `x - 0` and `0 - 0`. It is spelled out here because
 * the same substitution is *not* safe at {@link asProviderParameter}, and the difference
 * between the two sites is worth being able to see.
 */
export function resolveTimingBasis(distribution: Distribution, isTimingDomain: boolean): number {
  if (distribution.millisecondsTimingBasis !== null) return distribution.millisecondsTimingBasis;

  const derived = isTimingDomain
    ? matchKind<Distribution, number | null>(distribution, {
        uniform: (d) => (d.upperLimit ?? 0) - (d.lowerLimit ?? 0),
        gaussian: (d) => (d.upperLimit ?? 0) - (d.lowerLimit ?? 0),
        brownian: (d) => (d.upperLimit ?? 0) - (d.lowerLimit ?? 0),
        triangular: (d) => (d.upperClip ?? 0) - (d.lowerClip ?? 0),
        compensatingTriangle: (d) => (d.upperClip ?? 0) - (d.lowerClip ?? 0),
        list: (d) =>
          mapPresent(minAndMaxOfDistributionList(d.distributionList), (mm) => mm.max - mm.min),
      })
    : null;

  // `NaN <= 0` is false, so a malformed limit derives a NaN basis and keeps it — the
  // incumbent's behaviour, and the one the index guard in `RandomNumberProvider` catches.
  return derived === null || derived <= 0.0 ? 100.0 : derived;
}

/**
 * An MPM `imprecisionMap`: deliberate human inaccuracy — notes that land slightly early
 * or late, louder or softer, longer or shorter, or slightly out of tune.
 *
 * There is one map per **domain**, and the domain is encoded in the element's own local
 * name (`imprecisionMap.timing`, `.dynamics`, `.toneduration`, `.tuning`), not in an
 * attribute. Each domain perturbs a different attribute, which is why
 * {@link renderImprecisionToMap} switches on it in two places: once to pick the source
 * attribute and once to decide whether the result needs clamping.
 *
 * RANDOMNESS CONTRACT — read before changing anything in this file.
 * {@link RandomNumberProvider} is a deterministic sequence, not a stream of independent
 * samples: correlated distributions (brownian noise, compensating triangle) derive each
 * value from the previous one, and `getValue(index)` is what advances that state.
 * Consequently **the number and order of `getValue` calls is part of the output**. One
 * extra draw, one skipped draw, or two draws swapped desynchronises the whole sequence
 * and every subsequent value changes. This constrains ordinary-looking refactors: the
 * `continue`s that skip an entry must keep skipping its draw, the deferred
 * `pendingDurations` pass must stay after the main loop rather than being folded into
 * it, and the handover between successive correlated distributions
 * ({@link handoverValue} / {@link applyHandover}, which draw exactly once) must keep its
 * position. Note also that output is nondeterministic by design where no `seed` is given
 * — docs/history/refactor/CHARTER.md exempts this map from byte comparison for that reason, so the test suite
 * will *not* catch a desync here. Reason it through instead.
 *
 * Port of meico.mpm.elements.maps.ImprecisionMap
 */
export class ImprecisionMap extends GenericMap {
  private static readonly TIMING = 1;
  private static readonly DYNAMICS = 2;
  private static readonly TONEDURATION = 3;
  private static readonly TUNING = 4;

  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * The one place in the map cluster where a subclass adds a check of its own, and **the
   * order of it is load-bearing**.
   *
   * The check ran, in the incumbent, at the foot of this class's constructor — after
   * `super(…)` had already indexed and **re-sorted** the element's children. So an element
   * that passes `GenericMap`'s "is a map" test but fails this one comes back with its
   * children reordered and no map to show for it. That is visible from outside, so the check
   * stays after construction here too rather than moving up beside its sibling, where it
   * would read better and would silently stop touching the caller's element.
   *
   * (The history is one step older still: `GenericMap`'s constructor used to end in
   * `this.parseData(xml)`, dispatching into an override in this class before this class's own
   * field initialisers had run.)
   */
  static createImprecisionMap(domain: string): ImprecisionMap;
  static createImprecisionMap(xml: Element): Result<ImprecisionMap, MpmParseError>;
  static createImprecisionMap(
    domainOrXml: string | Element | null,
  ): ImprecisionMap | Result<ImprecisionMap, MpmParseError> {
    // Total for a domain, and for the same reason as the other twelve maps' no-argument
    // form: the name is built from this class's own prefix, so it passes both checks by
    // construction — `imprecisionMap` contains "Map", and it contains "imprecisionMap".
    if (typeof domainOrXml === 'string') {
      const name = `imprecisionMap${domainOrXml === '' ? '' : `.${domainOrXml}`}`;
      return new ImprecisionMap(GenericMap.emptyMapElement(name));
    }
    return andThen(
      GenericMap.makeMap(domainOrXml, 'ImprecisionMap', (elt) => new ImprecisionMap(elt)),
      (map) => {
        const localName = map.getXml().getLocalName();
        return localName.includes('imprecisionMap')
          ? ok(map)
          : err<MpmParseError>({
              kind: 'wrongLocalName',
              what: 'ImprecisionMap',
              localName,
              requirement: 'must contain "imprecisionMap"',
            });
      },
    );
  }

  /**
   * PARITY NOTE — a stub, for the same reason as {@link GenericMap.setType}: Java
   * changes the domain by calling `Element.setLocalName()`, which the XomTypes layer
   * cannot do. The domain is therefore fixed at construction. Nothing in the
   * MEI/MSM ⇒ MIDI pipeline calls this.
   */
  setDomain(domain: string | null): void {
    if (domain === null || domain === '') {
      return;
    }
  }

  getDomain(): string {
    // `.at(1)` and not `[1]`: the length test it replaces said exactly this, and `at` answers
    // `undefined` for the missing slot whether or not the strict-index flag is on.
    return this.getXml().getLocalName().split('.').at(1) ?? '';
  }

  /** `"Hertz"` is normalised to `"Hz"`; any other spelling is stored verbatim. */
  setDetuneUnit(unit: string): void {
    const value = unit === 'Hertz' ? 'Hz' : unit;
    this.getXml().addAttribute(new Attribute('detuneUnit', value));
  }

  getDetuneUnit(): string {
    return this.getXml().getAttributeValue('detuneUnit') ?? '';
  }

  addDistributionUniform(
    date: number,
    lowerLimit: number,
    upperLimit: number,
    seed?: number | null,
  ): number {
    const e = new Element(DISTRIBUTION_UNIFORM, MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionGaussian(
    date: number,
    standardDeviation: number,
    lowerLimit: number,
    upperLimit: number,
    seed?: number | null,
  ): number {
    const e = new Element(DISTRIBUTION_GAUSSIAN, MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('deviation.standard', String(standardDeviation)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionTriangular(
    date: number,
    lowerLimit: number,
    upperLimit: number,
    mode: number,
    lowerClip: number,
    upperClip: number,
    seed?: number | null,
  ): number {
    const e = new Element(DISTRIBUTION_TRIANGULAR, MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('mode', String(mode)));
    e.addAttribute(new Attribute('clip.lower', String(lowerClip)));
    e.addAttribute(new Attribute('clip.upper', String(upperClip)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionBrownianNoise(
    date: number,
    maxStepWidth: number,
    lowerLimit: number,
    upperLimit: number,
    millisecondsTimingBasis: number,
    seed?: number | null,
  ): number {
    const e = new Element(DISTRIBUTION_BROWNIAN, MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('stepWidth.max', String(maxStepWidth)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionCompensatingTriangle(
    date: number,
    degreeOfCorrelation: number,
    lowerLimit: number,
    upperLimit: number,
    lowerClip: number,
    upperClip: number,
    millisecondsTimingBasis: number,
    seed?: number | null,
  ): number {
    const e = new Element(DISTRIBUTION_COMPENSATING_TRIANGLE, MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(
      new Attribute('degreeOfCorrelation', String(Math.max(degreeOfCorrelation, 0.0))),
    );
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('clip.lower', String(lowerClip)));
    e.addAttribute(new Attribute('clip.upper', String(upperClip)));
    e.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionList(date: number, list: Element, millisecondsTimingBasis: number): number {
    list.addAttribute(new Attribute('date', String(date)));
    list.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    return this.insertElement(new KeyValue(date, list), false);
  }

  /**
   * Read the distribution at `index`, together with the span it governs.
   *
   * Unlike the other maps' `getXDataOf`, the end date is the date of the **immediately
   * following entry** whatever it is, rather than of the next entry of the same kind. A
   * distribution is therefore ended by any element in the map, not only by another
   * distribution.
   *
   * The three ways this can fail are three different things, and
   * {@link renderImprecisionToMap} treats them differently, which is why they are named
   * arms of {@link DistributionEntryProblem} rather than one `null`. The predecessor a
   * correlated distribution hands over from is carried past a `notADistribution` entry
   * unchanged, but is *replaced* by an `unknownFamily` one — behaviour inherited verbatim
   * from the incumbent, where `dd = ddPrev` ran on the first path and not on the second.
   */
  distributionAt(index: number): Result<DistributionSpan, DistributionEntryProblem> {
    const i = this.clampEntryIndex(index);
    if (i < 0) return err({ kind: 'noEntry', index });

    // `clampEntryIndex` has already answered -1 for an empty map and pulled everything else
    // into range, so this is never null. Asking rather than asserting costs one comparison and
    // keeps the "-1 means nothing" contract in the one place that states it.
    const e = this.getElement(i);
    if (e === null) return err({ kind: 'noEntry', index });
    const localName = e.getLocalName();
    if (!localName.startsWith('distribution.')) return err({ kind: 'notADistribution', localName });

    return mapOk(parseDistribution(e), (distribution) => ({
      distribution,
      // The span ends at the next entry of ANY name, or at the end of time when there is
      // none — which is what `at(i + 1)` returning undefined says.
      endDate: this.elements.at(i + 1)?.getKey() ?? Number.MAX_VALUE,
    }));
  }

  /**
   * Perturb `map` according to this map's domain and distributions.
   *
   * Offsets are **collected first and applied last**, and that two-phase structure is
   * required rather than stylistic: `shakeOffsets`/`shakeTimingOffsets` need to see all
   * the offsets sharing a millisecond date together, which is only possible once
   * collection has finished. The `offsets` map is keyed by that shared date for exactly
   * this reason.
   *
   * An entry that is not a distribution leaves {@link Predecessor} standing, so the *next*
   * correlated distribution still gets a valid handover partner and the sequence does not
   * restart. That looks redundant and is not — see {@link distributionAt} for the one kind
   * of failure that does replace the predecessor.
   *
   * The timing basis is the grid the random sequence is indexed on; {@link resolveTimingBasis}
   * derives one where the document declares none.
   *
   * `shakePolyphonicPart` addresses simultaneous notes: without it, every note of a chord
   * receives the same offset and the chord stays mechanically together. Shaking re-rolls
   * all but one of them so the chord spreads. The timing variant additionally keeps notes
   * of the *same pitch* on the same offset, since two voices sounding one pitch must not
   * separate into an audible flam.
   *
   * See the class doc's randomness contract before changing any control flow here: the
   * `continue`s, the deferred `pendingDurations` pass, and the handover calls each
   * correspond to a specific number of draws from the sequence.
   */
  renderImprecisionToMap(
    map: GenericMap | null,
    shakePolyphonicPart: boolean,
    ctx?: RenderContext,
  ): void {
    // Read once per call, before anything can return early, so it counts calls rather
    // than distributions: `impIndex` below distinguishes the distributions *within* one
    // map, this distinguishes the maps within one render, and the pair is unique per
    // RandomNumberProvider. Order-dependent by design — for identical input and options
    // the call order is fixed, so the derived seeds reproduce.
    const ordinal = ctx !== undefined ? ctx.streamOrdinal++ : 0;

    if (map === null || this.elements.length === 0) return;

    let domain: number;
    switch (this.getDomain()) {
      case 'timing':
        domain = ImprecisionMap.TIMING;
        break;
      case 'dynamics':
        domain = ImprecisionMap.DYNAMICS;
        break;
      case 'toneduration':
        domain = ImprecisionMap.TONEDURATION;
        break;
      case 'tuning':
        domain = ImprecisionMap.TUNING;
        break;
      default:
        return;
    }

    const pendingDurations: { endDate: number; msDateEnd: number; attribute: Attribute }[] = [];
    const offsets = new Map<number, KeyValue<number, Attribute>[]>();
    let mapIndex = 0;
    let predecessor: Predecessor | null = null;
    let random: RandomNumberProvider | null = null;

    for (let impIndex = 0; impIndex < this.size(); ++impIndex) {
      const entry = this.distributionAt(impIndex);
      if (!entry.ok) {
        // The three ways an entry is not a usable distribution, and what each leaves the
        // next correlated distribution to hand over from. Written as a table so that the
        // asymmetry — an unknown family REPLACES the predecessor, the other two do not —
        // is stated rather than implied by which branch happens to omit an assignment.
        predecessor = matchKind(entry.error, {
          noEntry: () => predecessor,
          notADistribution: () => predecessor,
          unknownFamily: (e) => ({ timingBasisMs: e.millisecondsTimingBasis }),
        });
        continue;
      }
      const { distribution, endDate } = entry.value;

      // initialize the seed, generate correlated distribution functions
      random = providerFor(distribution, random, predecessor);

      // A `seed` in the MPM always wins (RULE F7); `options.seed` supplies one only where
      // the MPM supplies none. With neither, the provider keeps its constructor's
      // Math.random() seed — today's behaviour, deliberately untouched.
      if (distribution.seed !== null) random.setSeed(distribution.seed);
      else if (ctx?.options.seed !== undefined)
        random.setSeed(deriveSeed(ctx.options.seed, ordinal, impIndex));

      // make sure that the timing resolution is specified, and if not, compute a reasonable value
      const timingBasisMs = resolveTimingBasis(distribution, domain === ImprecisionMap.TIMING);

      // Only now, after the handover above has read the *previous* distribution's resolved
      // basis. The incumbent got that ordering from writing the resolved value back into
      // the `DistributionData` object the next iteration would see as `ddPrev`; the order
      // of these two statements is what replaces that mutation.
      predecessor = { timingBasisMs };

      // apply distribution to map elements
      for (; mapIndex < map.size(); ++mapIndex) {
        // A random access and not an iteration: `mapIndex` is a cursor that survives the
        // distribution loop around this one, and the `break` below deliberately leaves the
        // entry that ended this span for the next distribution to re-examine.
        const mapEntry = elementAt(map.elements, mapIndex, 'imprecision target');

        if (mapEntry.getKey() < distribution.startDate) continue;

        if (mapEntry.getKey() >= endDate) break;

        const msDateAtt = attribute('milliseconds.date', mapEntry.getValue());
        if (msDateAtt === null) continue;

        let msDate: number;
        let index: number;
        let offset: KeyValue<number, Attribute>;

        switch (domain) {
          case ImprecisionMap.TIMING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            offset = new KeyValue(random.getValue(index), msDateAtt);

            const msEndAtt = attribute('milliseconds.date.end', mapEntry.getValue());
            if (msEndAtt !== null) {
              const msDateEnd = parseFloat(msEndAtt.getValue());
              pendingDurations.push({
                endDate: parseFloat(
                  getAttributeValue('milliseconds.date.end', mapEntry.getValue()),
                ),
                msDateEnd: msDateEnd,
                attribute: msEndAtt,
              });
            }
            break;
          }
          case ImprecisionMap.TONEDURATION: {
            const msEndAtt = attribute('milliseconds.date.end', mapEntry.getValue());
            if (msEndAtt !== null) {
              msDate = parseFloat(msEndAtt.getValue());
              index = msDate / timingBasisMs;
              offset = new KeyValue(random.getValue(index), msEndAtt);
            } else {
              continue;
            }
            break;
          }
          case ImprecisionMap.DYNAMICS: {
            const velAtt = attribute('velocity', mapEntry.getValue());
            if (velAtt === null) continue;
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            offset = new KeyValue(random.getValue(index), velAtt);
            break;
          }
          case ImprecisionMap.TUNING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            let tuneAtt = attribute('tuning.offset', mapEntry.getValue());
            if (tuneAtt === null) {
              tuneAtt = new Attribute('tuning.offset', '0.0');
              mapEntry.getValue().addAttribute(tuneAtt);
            }
            offset = new KeyValue(random.getValue(index), tuneAtt);
            break;
          }
          default:
            continue;
        }

        ImprecisionMap.addToOffsetsMap(offsets, msDate, offset);
      }

      // Offset the milliseconds.date.end attributes: drain the leading run of pending
      // durations that end inside this distribution's span, stopping at the first that
      // does not. The loop this replaces spliced each drained entry out individually and
      // stepped `i` back, which is the same prefix drain written so that every removal
      // shifts the whole remainder — quadratic in the number of notes, and the single
      // largest cost of rendering a long part with an imprecision map. Entries are
      // consumed in the same order, so the RandomNumberProvider sees the same call
      // sequence and produces the same offsets.
      let drained = 0;
      for (const pd of pendingDurations) {
        if (pd.endDate >= endDate) break;

        const msDate = pd.msDateEnd;
        const endIndex = msDate / timingBasisMs;
        const offset = new KeyValue(random.getValue(endIndex), pd.attribute);
        ImprecisionMap.addToOffsetsMap(offsets, msDate, offset);

        ++drained;
      }
      if (drained > 0) pendingDurations.splice(0, drained);
    }

    if (shakePolyphonicPart) {
      if (domain === ImprecisionMap.TIMING) ImprecisionMap.shakeTimingOffsets(offsets);
      else ImprecisionMap.shakeOffsets(offsets);
    }

    ImprecisionMap.addOffsetsToAttributes(offsets, domain);
  }

  private static addToOffsetsMap(
    offsetsMap: Map<number, KeyValue<number, Attribute>[]>,
    millisecondsDate: number,
    offsetAndAttribute: KeyValue<number, Attribute>,
  ): void {
    let list = offsetsMap.get(millisecondsDate);
    if (list === undefined) {
      list = [];
      list.push(offsetAndAttribute);
      offsetsMap.set(millisecondsDate, list);
    } else {
      list.push(offsetAndAttribute);
    }
  }

  private static shakeOffsets(offsets: Map<number, KeyValue<number, Attribute>[]>): void {
    for (const [, entries] of offsets) {
      if (entries.length < 2) continue;

      const keepOffset = Math.floor(Math.random() * entries.length);

      for (const [i, entry] of entries.entries()) {
        if (i === keepOffset) continue;

        entry.setKey(ImprecisionMap.shake(entry.getKey()));
      }
    }
  }

  private static shakeTimingOffsets(offsets: Map<number, KeyValue<number, Attribute>[]>): void {
    for (const [, entries] of offsets) {
      if (entries.length < 2) continue;

      const keepOffset = Math.floor(Math.random() * entries.length);
      const pitchOffsetTuplet = new Map<number, number>();

      // as this applies also to the element that keeps its offset, it should be added to the hashmap first
      const keeper = elementAt(entries, keepOffset, 'shake keeper');
      const keeperParent = keeper.getValue().getParent();
      if (keeperParent !== null) {
        const pitchAtt = attribute('midi.pitch', keeperParent);
        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, keeper.getKey());
        }
      }

      for (const [i, entry] of entries.entries()) {
        if (i === keepOffset) continue;

        // check whether we have already an offset value for this pitch
        const entryParent = entry.getValue().getParent();
        let pitchAtt: Attribute | null = null;
        if (entryParent !== null) {
          pitchAtt = attribute('midi.pitch', entryParent);
          if (pitchAtt !== null) {
            const pitch = parseFloat(pitchAtt.getValue());
            const existingOffset = pitchOffsetTuplet.get(pitch);
            if (existingOffset !== undefined) {
              entry.setKey(existingOffset);
              continue;
            }
          }
        }

        entry.setKey(ImprecisionMap.shake(entry.getKey()));

        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, entry.getKey());
        }
      }
    }
  }

  /**
   * Re-roll one offset into a nearby but different value, so that simultaneous notes do
   * not all move together.
   *
   * The replacement is drawn from a triangular distribution spanning the offset and half
   * of it, with the mode at the halved end — so the shaken value stays on the same side
   * of zero and is biased towards being smaller in magnitude, never larger. The two
   * branches exist because a triangular distribution needs its limits in ascending order,
   * and which of `offset` and `offset * 0.5` is the smaller flips with the sign.
   */
  private static shake(offset: number): number {
    const of_ = offset * 0.5;
    if (offset < 0.0)
      return RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
        offset,
        of_,
        of_,
        offset,
        of_,
      ).getValue(0);
    return RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
      of_,
      offset,
      offset,
      of_,
      offset,
    ).getValue(0);
  }

  /**
   * Apply the collected offsets to the attributes they were paired with. In the timing
   * domain the result is floored at 0 — a negative offset on an early note must not
   * produce a negative timestamp — while the other domains are left unclamped, so
   * velocity and tuning may legitimately leave their nominal ranges here and be clamped
   * later by the MIDI export.
   */
  private static addOffsetsToAttributes(
    offsets: Map<number, KeyValue<number, Attribute>[]>,
    domain: number,
  ): void {
    for (const [, entries] of offsets) {
      for (const entry of entries) {
        const attValue = parseFloat(entry.getValue().getValue());
        if (domain === ImprecisionMap.TIMING)
          entry.getValue().setValue(String(Math.max(0.0, attValue + entry.getKey())));
        else entry.getValue().setValue(String(attValue + entry.getKey()));
      }
    }
  }

  static renderImprecisionToMap(
    map: GenericMap | null,
    imprecisionMap: ImprecisionMap | null,
    shakePolyphonicPart: boolean,
    ctx?: RenderContext,
  ): void {
    if (imprecisionMap !== null)
      imprecisionMap.renderImprecisionToMap(map, shakePolyphonicPart, ctx);
  }
}

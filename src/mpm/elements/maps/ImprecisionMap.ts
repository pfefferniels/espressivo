import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import type { KeyValue } from '../../../supplementary/KeyValue.js';
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
 * What one distribution leaves behind for the next: the grid its draws were indexed on, which
 * is all a correlated distribution needs to continue its predecessor's sequence.
 *
 * `timingBasisMs` is `number | null` for one reason only: an unrecognised `distribution.*`
 * element becomes a predecessor before any basis has been resolved for it, and that null is
 * what the handover then divides by. See {@link UnknownDistributionFamily}.
 */
export interface Predecessor {
  readonly timingBasisMs: number | null;
}

/**
 * A distribution parameter on its way into {@link RandomNumberProvider}.
 *
 * The provider's factories are typed `number`, but MPM does not require a document to declare
 * every attribute of its family, and the behaviour for one that omits an attribute is
 * specified and depended upon: the `null` reaches the provider's arithmetic, where
 * `null - null` is 0, `d > null` is `d > 0`, and `clip()` can return the `null` itself, which
 * the write-back then adds to an attribute as a no-op (`attValue + null === attValue`). That
 * is how a clip-less triangular performs exactly δ₀ rather than `NaN` — see
 * `src/comparison/imprecisionLaws.ts` for the full nine-case table and
 * `tests/comparison/imprecisionDegenerate.test.ts` for the pin.
 *
 * Substituting `0` for the `null` is not equivalent, which is why this is a cast and not a
 * `?? 0`: `RandomNumberProvider.triangularDistribution` opens with
 * `upperLimit === lowerLimit`, a *strict* comparison that separates a declared `0` from an
 * absent limit and takes a different number of draws from the sequence depending on the
 * answer.
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
 * Exported for the tests rather than for callers: six transcriptions of six positional factory
 * signatures can be wrong in a way no end-to-end assertion notices — swapping a triangular's
 * `mode` and `clip.lower` still renders plausible numbers — so the suite reads the parameters
 * back off the provider.
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
 * Draws from `randomPrev` exactly once, and only when there is a predecessor to draw from.
 * Both the count and the position of that draw are part of the output sequence (class doc).
 * Returns null when there is no predecessor, which {@link applyHandover} then treats as "seed
 * a fresh sequence".
 *
 * The date is read off the element with the namespace-tolerant `attribute()` rather than from
 * the already-parsed `startDate`; the two are not the same lookup, which is why
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
 * A declared `milliseconds.timingBasis` is used verbatim, including a zero or negative one —
 * the `<= 0` fallback below guards only the *derived* value, and a declared 0 makes the index
 * infinite and the render throw, which is the ⊥ route `src/comparison/imprecisionLaws.ts`
 * documents. That asymmetry is why the declared case returns early rather than joining one
 * combined test at the end.
 *
 * Where nothing is declared, the basis is derived from the family's own spread, and only in
 * the timing domain, where a spread measured in milliseconds means something. Every other
 * domain, and every derivation that comes out at zero or below, falls back to 100.
 *
 * Exported for the tests, for the reason {@link providerFor} gives: the comparison module has
 * its own independent copy of this derivation (`src/comparison/imprecisionLaws.ts`), so a test
 * that reads a timing basis through *that* reader cannot see a mistake in this one.
 *
 * `?? 0` is safe here where it would not be at {@link asProviderParameter}: subtraction
 * ToNumber-coerces and `Number(null)` is 0, so `null - x`, `x - null` and `null - null` are
 * already `0 - x`, `x - 0` and `0 - 0`.
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

  // `NaN <= 0` is false, so a malformed limit derives a NaN basis and keeps it, which the
  // index guard in `RandomNumberProvider` catches.
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
 * Consequently the number and order of `getValue` calls is part of the output. One extra
 * draw, one skipped draw, or two draws swapped desynchronises the whole sequence and every
 * subsequent value changes. So the `continue`s that skip an entry must keep skipping its
 * draw, the deferred `pendingDurations` pass must stay after the main loop rather than being
 * folded into it, and the handover between successive correlated distributions
 * ({@link handoverValue} / {@link applyHandover}, which draw exactly once) must keep its
 * position. Output is nondeterministic by design where no `seed` is given —
 * docs/history/refactor/CHARTER.md exempts this map from byte comparison for that reason, so
 * the test suite will *not* catch a desync here. Reason it through instead.
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
   * A fresh, empty `imprecisionMap` of one domain, or one read from an existing element —
   * which must additionally be named `imprecisionMap*`, the one place in the map cluster where
   * a subclass adds a check of its own.
   *
   * The order of that check is load-bearing: it runs after construction, by which time
   * `GenericMap` has indexed and RE-SORTED the element's children. An element that passes
   * "is a map" but fails this one therefore comes back with its children reordered and no map
   * to show for it, which is visible from outside.
   */
  static createImprecisionMap(domain: string): ImprecisionMap;
  static createImprecisionMap(xml: Element): Result<ImprecisionMap, MpmParseError>;
  static createImprecisionMap(
    domainOrXml: string | Element | null,
  ): ImprecisionMap | Result<ImprecisionMap, MpmParseError> {
    // Total for a domain: the name is built from this class's own prefix, so it passes both
    // checks by construction — `imprecisionMap` contains "Map", and contains "imprecisionMap".
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

  /** The domain suffix of the element's local name, or `''` for a bare `imprecisionMap`. */
  getDomain(): string {
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
    return this.insertElement({ key: date, value: e }, false);
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
    return this.insertElement({ key: date, value: e }, false);
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
    return this.insertElement({ key: date, value: e }, false);
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
    return this.insertElement({ key: date, value: e }, false);
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
    return this.insertElement({ key: date, value: e }, false);
  }

  addDistributionList(date: number, list: Element, millisecondsTimingBasis: number): number {
    list.addAttribute(new Attribute('date', String(date)));
    list.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    return this.insertElement({ key: date, value: list }, false);
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
   * {@link renderImprecisionToMap} treats them differently, which is why they are named arms
   * of {@link DistributionEntryProblem} rather than one `null`. The predecessor a correlated
   * distribution hands over from is carried past a `notADistribution` entry unchanged, but is
   * *replaced* by an `unknownFamily` one.
   */
  distributionAt(index: number): Result<DistributionSpan, DistributionEntryProblem> {
    const i = this.clampEntryIndex(index);
    if (i < 0) return err({ kind: 'noEntry', index });

    // `clampEntryIndex` has already answered -1 for an empty map and pulled everything else
    // into range, so this is never null.
    const e = this.getElement(i);
    if (e === null) return err({ kind: 'noEntry', index });
    const localName = e.getLocalName();
    if (!localName.startsWith('distribution.')) return err({ kind: 'notADistribution', localName });

    return mapOk(parseDistribution(e), (distribution) => ({
      distribution,
      // The span ends at the next entry of ANY name, or at the end of time when there is
      // none — which is what `at(i + 1)` returning undefined says.
      endDate: this.elements.at(i + 1)?.key ?? Number.MAX_VALUE,
    }));
  }

  /**
   * Perturb `map` according to this map's domain and distributions.
   *
   * Offsets are **collected first and applied last**, and that two-phase structure is
   * required rather than stylistic: `shakeOffsets`/`shakeTimingOffsets` need to see all the
   * offsets sharing a millisecond date together, which is why `offsets` is keyed by that date
   * and why it can only run once collection has finished.
   *
   * An entry that is not a distribution leaves {@link Predecessor} standing, so the *next*
   * correlated distribution still gets a valid handover partner and the sequence does not
   * restart. See {@link distributionAt} for the one kind of failure that does replace the
   * predecessor.
   *
   * The timing basis is the grid the random sequence is indexed on; {@link resolveTimingBasis}
   * derives one where the document declares none.
   *
   * `shakePolyphonicPart` addresses simultaneous notes: without it every note of a chord
   * receives the same offset and the chord stays mechanically together, so shaking re-rolls
   * all but one of them. The timing variant additionally keeps notes of the *same pitch* on
   * the same offset, since two voices sounding one pitch must not separate into a flam.
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
    // Read once per call, before anything can return early, so it counts calls rather than
    // distributions: `impIndex` below distinguishes the distributions within one map, this
    // distinguishes the maps within one render, and the pair is unique per
    // RandomNumberProvider. Order-dependent by design — for identical input and options the
    // call order is fixed, so the derived seeds reproduce.
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
        // What each kind of unusable entry leaves the next correlated distribution to hand
        // over from: an unknown family REPLACES the predecessor, the other two do not.
        predecessor = matchKind(entry.error, {
          noEntry: () => predecessor,
          notADistribution: () => predecessor,
          unknownFamily: (e) => ({ timingBasisMs: e.millisecondsTimingBasis }),
        });
        continue;
      }
      const { distribution, endDate } = entry.value;

      random = providerFor(distribution, random, predecessor);

      // A `seed` in the MPM always wins (RULE F7); `options.seed` supplies one only where
      // the MPM supplies none. With neither, the provider keeps its constructor's
      // Math.random() seed.
      if (distribution.seed !== null) random.setSeed(distribution.seed);
      else if (ctx?.options.seed !== undefined)
        random.setSeed(deriveSeed(ctx.options.seed, ordinal, impIndex));

      const timingBasisMs = resolveTimingBasis(distribution, domain === ImprecisionMap.TIMING);

      // Only now, after the handover above has read the *previous* distribution's resolved
      // basis: the order of these two statements is the handover.
      predecessor = { timingBasisMs };

      for (; mapIndex < map.size(); ++mapIndex) {
        // `mapIndex` is a cursor that survives the distribution loop around this one, and the
        // `break` below leaves the entry that ended this span for the next distribution.
        const mapEntry = elementAt(map.elements, mapIndex, 'imprecision target');

        if (mapEntry.key < distribution.startDate) continue;

        if (mapEntry.key >= endDate) break;

        const msDateAtt = attribute('milliseconds.date', mapEntry.value);
        if (msDateAtt === null) continue;

        let msDate: number;
        let index: number;
        let offset: KeyValue<number, Attribute>;

        switch (domain) {
          case ImprecisionMap.TIMING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            offset = { key: random.getValue(index), value: msDateAtt };

            const msEndAtt = attribute('milliseconds.date.end', mapEntry.value);
            if (msEndAtt !== null) {
              const msDateEnd = parseFloat(msEndAtt.getValue());
              pendingDurations.push({
                endDate: parseFloat(getAttributeValue('milliseconds.date.end', mapEntry.value)),
                msDateEnd: msDateEnd,
                attribute: msEndAtt,
              });
            }
            break;
          }
          case ImprecisionMap.TONEDURATION: {
            const msEndAtt = attribute('milliseconds.date.end', mapEntry.value);
            if (msEndAtt !== null) {
              msDate = parseFloat(msEndAtt.getValue());
              index = msDate / timingBasisMs;
              offset = { key: random.getValue(index), value: msEndAtt };
            } else {
              continue;
            }
            break;
          }
          case ImprecisionMap.DYNAMICS: {
            const velAtt = attribute('velocity', mapEntry.value);
            if (velAtt === null) continue;
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            offset = { key: random.getValue(index), value: velAtt };
            break;
          }
          case ImprecisionMap.TUNING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / timingBasisMs;
            let tuneAtt = attribute('tuning.offset', mapEntry.value);
            if (tuneAtt === null) {
              tuneAtt = new Attribute('tuning.offset', '0.0');
              mapEntry.value.addAttribute(tuneAtt);
            }
            offset = { key: random.getValue(index), value: tuneAtt };
            break;
          }
          default:
            continue;
        }

        ImprecisionMap.addToOffsetsMap(offsets, msDate, offset);
      }

      // Offset the milliseconds.date.end attributes: drain the leading run of pending
      // durations that end inside this distribution's span, stopping at the first that does
      // not. The order entries are consumed in is part of the randomness contract — it is
      // what the RandomNumberProvider's call sequence is made of.
      let drained = 0;
      for (const pd of pendingDurations) {
        if (pd.endDate >= endDate) break;

        const msDate = pd.msDateEnd;
        const endIndex = msDate / timingBasisMs;
        const offset = { key: random.getValue(endIndex), value: pd.attribute };
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

        entry.key = ImprecisionMap.shake(entry.key);
      }
    }
  }

  private static shakeTimingOffsets(offsets: Map<number, KeyValue<number, Attribute>[]>): void {
    for (const [, entries] of offsets) {
      if (entries.length < 2) continue;

      const keepOffset = Math.floor(Math.random() * entries.length);
      const pitchOffsetTuplet = new Map<number, number>();

      // The kept entry defines the offset for its pitch, so it is filed before the others are
      // looked up against it.
      const keeper = elementAt(entries, keepOffset, 'shake keeper');
      const keeperParent = keeper.value.getParent();
      if (keeperParent !== null) {
        const pitchAtt = attribute('midi.pitch', keeperParent);
        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, keeper.key);
        }
      }

      for (const [i, entry] of entries.entries()) {
        if (i === keepOffset) continue;

        const entryParent = entry.value.getParent();
        let pitchAtt: Attribute | null = null;
        if (entryParent !== null) {
          pitchAtt = attribute('midi.pitch', entryParent);
          if (pitchAtt !== null) {
            const pitch = parseFloat(pitchAtt.getValue());
            const existingOffset = pitchOffsetTuplet.get(pitch);
            if (existingOffset !== undefined) {
              entry.key = existingOffset;
              continue;
            }
          }
        }

        entry.key = ImprecisionMap.shake(entry.key);

        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, entry.key);
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
        const attValue = parseFloat(entry.value.getValue());
        if (domain === ImprecisionMap.TIMING)
          entry.value.setValue(String(Math.max(0.0, attValue + entry.key)));
        else entry.value.setValue(String(attValue + entry.key));
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

import type { Element } from '../../../../xml/XomTypes.js';
import {
  err,
  filterMap,
  foldl,
  isNonEmpty,
  mapPresent,
  ok,
  type Result,
} from '../../../../prelude/index.js';

/**
 * One MPM `distribution.*` element, read into the six-armed sum type the six families
 * actually form.
 *
 * Each arm carries exactly the parameters its own `RandomNumberProvider` factory consumes,
 * spelled out one by one rather than factored over a shared "has limits" base: five of the
 * six do share `limit.lower` and `limit.upper`, but the point of the type is that each arm
 * is a legible transcription of one factory signature.
 *
 * ## Absence is a value here, and it must stay one
 *
 * The numeric fields are `number | null` because that is the format: MPM does not require
 * these attributes, the renderer does not reject a document that omits them, and what an
 * absent attribute performs is specified and measured. It reaches `RandomNumberProvider` as
 * a literal `null`, whose arithmetic then defines the law.
 * `src/comparison/imprecisionLaws.ts` tabulates all nine cases against executed controls (a
 * clip-less triangular performs exactly δ₀ via a `null` draw; a gaussian missing
 * `limit.upper` truncates to `[lower, 0]`; a compensating triangle missing
 * `degreeOfCorrelation` divides by zero and reaches ⊥), and
 * `tests/comparison/imprecisionDegenerate.test.ts` pins the first of them end to end.
 * Turning an omission into a parse failure would retune every degenerate document in the
 * corpus.
 *
 * What {@link parseDistribution}'s `Result` rejects is therefore the one thing that has no
 * reading at all — an element in the `distribution.` namespace whose family this port does
 * not know — and it hands back the one field the caller still needs from such an element
 * rather than discarding it (see {@link UnknownDistributionFamily}).
 *
 * Port of meico.mpm.elements.maps.data.DistributionData, restructured.
 */

/** The six `distribution.*` element local names, which are also the family discriminants. */
export const DISTRIBUTION_UNIFORM = 'distribution.uniform';
export const DISTRIBUTION_GAUSSIAN = 'distribution.gaussian';
export const DISTRIBUTION_TRIANGULAR = 'distribution.triangular';
export const DISTRIBUTION_BROWNIAN = 'distribution.correlated.brownianNoise';
export const DISTRIBUTION_COMPENSATING_TRIANGLE = 'distribution.correlated.compensatingTriangle';
export const DISTRIBUTION_LIST = 'distribution.list';

/**
 * The six families, as short names.
 *
 * These are the `kind` discriminants rather than the local names themselves so that a
 * `matchKind` table reads as prose (`brownian:` rather than
 * `'distribution.correlated.brownianNoise':`). {@link DISTRIBUTION_LOCAL_NAME} is the
 * bijection back to the wire spelling, and it is the only place the two vocabularies meet.
 */
export type DistributionKind =
  'uniform' | 'gaussian' | 'triangular' | 'brownian' | 'compensatingTriangle' | 'list';

/**
 * The element local name each family is spelled with.
 *
 * Typed as a total `Record` over {@link DistributionKind}, so a seventh family cannot be
 * added to the union without being given a name here.
 */
export const DISTRIBUTION_LOCAL_NAME: Readonly<Record<DistributionKind, string>> = {
  uniform: DISTRIBUTION_UNIFORM,
  gaussian: DISTRIBUTION_GAUSSIAN,
  triangular: DISTRIBUTION_TRIANGULAR,
  brownian: DISTRIBUTION_BROWNIAN,
  compensatingTriangle: DISTRIBUTION_COMPENSATING_TRIANGLE,
  list: DISTRIBUTION_LIST,
};

/**
 * The inverse of {@link DISTRIBUTION_LOCAL_NAME}, derived rather than written twice. The
 * cast is sound by construction: `Object.entries` loses the key type of a `Record`, but the
 * record it is applied to is declared over {@link DistributionKind} exactly.
 */
const KIND_OF_LOCAL_NAME: ReadonlyMap<string, DistributionKind> = new Map(
  Object.entries(DISTRIBUTION_LOCAL_NAME).map(
    ([kind, localName]) => [localName, kind as DistributionKind] as const,
  ),
);

/**
 * What every family carries, whichever it is.
 *
 * `xml` is kept because the correlated families need the element's own
 * `milliseconds.date` when they hand over from their predecessor
 * (`ImprecisionMap`'s `handoverValue`) — that read goes through the namespace-tolerant
 * `attribute()` rather than the plain `@date` this module parses into `startDate`, and the
 * two are not interchangeable.
 */
interface DistributionCommon {
  readonly xml: Element;
  /** `@date`, in ticks — where this distribution starts governing. 0 when absent. */
  readonly startDate: number;
  /**
   * `@seed`. Present means reproducible: it beats `RenderOptions.seed` (RULE F7), and
   * absent leaves the provider on its constructor's `Math.random()` seed.
   */
  readonly seed: number | null;
  /**
   * `@milliseconds.timingBasis` **as declared** — the sampling grid a note's millisecond
   * date is divided by to index the random sequence.
   *
   * Null here means "not declared", not "no grid": `ImprecisionMap` derives one from the
   * family's own spread, and only in the timing domain. That derivation is deliberately
   * not done here, because it needs the map's domain, which is not a property of the
   * distribution.
   */
  readonly millisecondsTimingBasis: number | null;
}

/** `distribution.uniform` — `RandomNumberProvider.…_uniformDistribution`. */
export interface UniformDistribution extends DistributionCommon {
  readonly kind: 'uniform';
  readonly lowerLimit: number | null;
  readonly upperLimit: number | null;
}

/** `distribution.gaussian` — `RandomNumberProvider.…_gaussianDistribution`. */
export interface GaussianDistribution extends DistributionCommon {
  readonly kind: 'gaussian';
  readonly standardDeviation: number | null;
  readonly lowerLimit: number | null;
  readonly upperLimit: number | null;
}

/** `distribution.triangular` — `RandomNumberProvider.…_triangularDistribution`. */
export interface TriangularDistribution extends DistributionCommon {
  readonly kind: 'triangular';
  readonly lowerLimit: number | null;
  readonly upperLimit: number | null;
  readonly mode: number | null;
  readonly lowerClip: number | null;
  readonly upperClip: number | null;
}

/** `distribution.correlated.brownianNoise` — `RandomNumberProvider.…_brownianNoiseDistribution`. */
export interface BrownianNoiseDistribution extends DistributionCommon {
  readonly kind: 'brownian';
  readonly maxStepWidth: number | null;
  readonly lowerLimit: number | null;
  readonly upperLimit: number | null;
}

/**
 * `distribution.correlated.compensatingTriangle` —
 * `RandomNumberProvider.…_compensatingTriangleDistribution`.
 */
export interface CompensatingTriangleDistribution extends DistributionCommon {
  readonly kind: 'compensatingTriangle';
  readonly degreeOfCorrelation: number | null;
  readonly lowerLimit: number | null;
  readonly upperLimit: number | null;
  readonly lowerClip: number | null;
  readonly upperClip: number | null;
}

/**
 * `distribution.list` — `RandomNumberProvider.…_distributionList`.
 *
 * The only family with no limits at all: the `<measurement value="…">` children *are* the
 * series, and `getValue(i)` reads `series[i % n]` instead of drawing.
 */
export interface ListDistribution extends DistributionCommon {
  readonly kind: 'list';
  readonly distributionList: readonly number[];
}

/** One imprecision distribution, discriminated by family. */
export type Distribution =
  | UniformDistribution
  | GaussianDistribution
  | TriangularDistribution
  | BrownianNoiseDistribution
  | CompensatingTriangleDistribution
  | ListDistribution;

/**
 * An element in the `distribution.` namespace whose family this port does not know —
 * `<distribution.foo>`.
 *
 * It is a failure with a payload rather than a plain absence because the renderer's
 * behaviour depends on the payload. An unknown family governs nothing and draws nothing,
 * but it *does* become the predecessor a following correlated distribution hands over
 * from, and the only thing the handover reads off a predecessor is its timing basis —
 * unresolved, because resolution happens after the family dispatch that this element never
 * survives. `tests/comparison/imprecisionLaws.test.ts` pins the "performs nothing, reads
 * δ₀ not ⊥" half of that behaviour; the field is what keeps the other half intact.
 */
export interface UnknownDistributionFamily {
  readonly kind: 'unknownFamily';
  readonly localName: string;
  /** `@milliseconds.timingBasis` as declared, for the handover described above. */
  readonly millisecondsTimingBasis: number | null;
}

/**
 * `parseFloat` of an attribute, or null where the element does not carry it.
 *
 * Deliberately `Element.getAttribute` and not `xml/tree.ts`'s namespace-tolerant
 * `attribute()`: a distribution's parameters are unprefixed by the schema, and widening the
 * lookup would change which documents parse. `parseFloat` and not `parseJavaDouble` for the
 * same reason — a malformed value becomes `NaN` and travels, which is the ⊥ route
 * `imprecisionLaws.ts` documents.
 */
function floatAttribute(xml: Element, name: string): number | null {
  return mapPresent(xml.getAttribute(name), (a) => parseFloat(a.getValue()));
}

/** As {@link floatAttribute}, for the one integer-valued attribute (`@seed`). */
function intAttribute(xml: Element, name: string): number | null {
  return mapPresent(xml.getAttribute(name), (a) => parseInt(a.getValue()));
}

/** The `<measurement value="…">` children, in document order. A child with no value is skipped. */
function measurementValues(xml: Element): readonly number[] {
  return filterMap(xml.getChildElements('measurement'), (m) => floatAttribute(m, 'value'));
}

/**
 * One builder per family, as a total table over {@link DistributionKind}.
 *
 * A seventh family added to the union fails to compile here as well as at every read site:
 * this is the parse end of the same guarantee `matchKind` gives the render end.
 */
const BUILD_DISTRIBUTION: {
  readonly [K in DistributionKind]: (
    xml: Element,
    common: DistributionCommon,
  ) => Extract<Distribution, { readonly kind: K }>;
} = {
  uniform: (xml, common) => ({
    ...common,
    kind: 'uniform',
    lowerLimit: floatAttribute(xml, 'limit.lower'),
    upperLimit: floatAttribute(xml, 'limit.upper'),
  }),
  gaussian: (xml, common) => ({
    ...common,
    kind: 'gaussian',
    standardDeviation: floatAttribute(xml, 'deviation.standard'),
    lowerLimit: floatAttribute(xml, 'limit.lower'),
    upperLimit: floatAttribute(xml, 'limit.upper'),
  }),
  triangular: (xml, common) => ({
    ...common,
    kind: 'triangular',
    lowerLimit: floatAttribute(xml, 'limit.lower'),
    upperLimit: floatAttribute(xml, 'limit.upper'),
    mode: floatAttribute(xml, 'mode'),
    lowerClip: floatAttribute(xml, 'clip.lower'),
    upperClip: floatAttribute(xml, 'clip.upper'),
  }),
  brownian: (xml, common) => ({
    ...common,
    kind: 'brownian',
    maxStepWidth: floatAttribute(xml, 'stepWidth.max'),
    lowerLimit: floatAttribute(xml, 'limit.lower'),
    upperLimit: floatAttribute(xml, 'limit.upper'),
  }),
  compensatingTriangle: (xml, common) => ({
    ...common,
    kind: 'compensatingTriangle',
    degreeOfCorrelation: floatAttribute(xml, 'degreeOfCorrelation'),
    lowerLimit: floatAttribute(xml, 'limit.lower'),
    upperLimit: floatAttribute(xml, 'limit.upper'),
    lowerClip: floatAttribute(xml, 'clip.lower'),
    upperClip: floatAttribute(xml, 'clip.upper'),
  }),
  list: (xml, common) => ({
    ...common,
    kind: 'list',
    distributionList: measurementValues(xml),
  }),
};

/**
 * Read one `distribution.*` element. Only the attributes the element's own family consumes
 * are read — the partition `tests/comparison/registry.test.ts` declares as the meaningful
 * one ("the consumed set is read off the factory calls").
 */
export function parseDistribution(xml: Element): Result<Distribution, UnknownDistributionFamily> {
  const localName = xml.getLocalName();
  const kind = KIND_OF_LOCAL_NAME.get(localName);
  if (kind === undefined)
    return err({
      kind: 'unknownFamily',
      localName,
      millisecondsTimingBasis: floatAttribute(xml, 'milliseconds.timingBasis'),
    });

  const common: DistributionCommon = {
    xml,
    // The default defends against absence, not against `NaN` — a malformed `@date` stays
    // `NaN` and travels.
    startDate: floatAttribute(xml, 'date') ?? 0.0,
    seed: intAttribute(xml, 'seed'),
    millisecondsTimingBasis: floatAttribute(xml, 'milliseconds.timingBasis'),
  };

  return ok(BUILD_DISTRIBUTION[kind](xml, common));
}

/** The extent of a {@link ListDistribution}'s measurements. */
export interface MinAndMax {
  readonly min: number;
  readonly max: number;
}

/**
 * The smallest and largest measurement in a distribution list, or null for an empty one.
 * Only the timing-basis derivation reads this.
 *
 * The two tests are exclusive rather than independent, which is correct because `min <= max`
 * holds at every step: a value below the running minimum cannot also be above the running
 * maximum.
 */
export function minAndMaxOfDistributionList(list: readonly number[]): MinAndMax | null {
  if (!isNonEmpty(list)) return null;

  return foldl<number, MinAndMax>(list, { min: list[0], max: list[0] }, (acc, d) => {
    if (d < acc.min) return { min: d, max: acc.max };
    if (d > acc.max) return { min: acc.min, max: d };
    return acc;
  });
}

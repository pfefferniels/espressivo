/**
 * §8's corpus level: `N` performances in, one matrix and everything read off it.
 *
 * The whole product rests on one rule — **every cell of every matrix is a value of ONE
 * function** (R3). That is what makes a dendrogram or an MDS plot mean anything: one window,
 * one settings record, one weight/JND/invariance vector for the entire run, so a distance in
 * row 3 and a distance in row 40 are comparable. The window is derived once, from the MSM's
 * score end or from the maximum last date across the corpus, and it does not vary with the pair
 * — which is why AD-4's guarantee survives even though it is corpus-derived.
 *
 * ## Labels, and why they are required unique
 *
 * Every tie in §8's products is broken on a LABEL (AD-25.2), and the medoid is the one product
 * whose entire value is naming a real performer. Two documents legitimately labelled
 * `"Welte 1905"` each holding a performance called `"default"` would make "the most typical
 * Hofmann" ambiguous, so a collision is an `InvalidOptionError` that names every colliding label
 * and the item indices that produced it.
 *
 * An item naming no performance in a MULTI-performance document EXPANDS to one item per
 * performance, labelled `«docLabel»:«perfName»` — the natural reading of the official
 * multi-performance samples, which are the only real multi-performance documents in existence.
 *
 * ## What this module is not
 *
 * It is not a second comparison. Every cell comes from `compareInterior` — the same engine the
 * pairwise facade uses, with the same options record — so a corpus number and a pairwise number
 * for the same two documents under the same window are the same number, and the matrix cannot
 * drift from the product it is assembled out of.
 */
import { agglomerate, pam, silhouette, SILHOUETTE_RELIABLE_MINIMUM } from './clustering.js';
import type { Linkage } from './clustering.js';
import { classicalMds, seriationOrder } from './embedding.js';
import {
  compareInterior,
  effectiveJnd,
  note,
  sortNotes,
  type InteriorCompareOptions,
} from './compare.js';
import { readPerformances } from '../expression/mpmTree.js';
import { CorpusLabelCollisionError, CorpusOptionRangeError, CorpusSizeError } from './errors.js';
import {
  COMPARISON_DIMENSIONS,
  COMPARISON_JND_KEYS,
  comparisonRowFor,
  type ComparisonDimension,
  type ComparisonJndKey,
} from './registry.js';
import type { Element } from '../xml/XomTypes.js';
import type {
  ComparisonNote,
  ComparisonNoteKind,
  ComparisonReport,
  CorpusReport,
  ResolvedComparisonSettings,
} from './report.js';

/** One item as the facade hands it over: already parsed, selectors unresolved. */
export interface InteriorCorpusItem {
  readonly root: Element;
  readonly performance?: string | number;
  readonly label?: string;
}

export interface InteriorCorpusOptions extends Omit<
  InteriorCompareOptions,
  'a' | 'b' | 'performanceA' | 'performanceB' | 'profile'
> {
  readonly items: readonly InteriorCorpusItem[];
  readonly maxItems: number;
  readonly normalization: 'fixed' | 'corpus';
  readonly linkage: Linkage;
  readonly k?: number;
  /**
   * §8's MDS axes, or null where the caller did not ask.
   *
   * The distinction is §9.4's, not a convenience: an EXPLICIT value outside `[1, N−1]` is the
   * knowable branch and errors, while the DEFAULT must never error — a two-item corpus has one
   * axis, and a caller who never set the option has made no mistake to be told about. R7's
   * three-state degradation governs a field the caller did not request.
   */
  readonly embeddingAxes: number | null;
  readonly noiseFloor: boolean;
  /** AD-27.8; omit or null for none. */
  readonly scape?: { readonly bins: number } | null;
}

/** One expanded row of the corpus: a document, a performance in it, and its label. */
interface ExpandedItem {
  readonly root: Element;
  readonly itemIndex: number;
  readonly performance: string;
  readonly selector: string | number;
  readonly label: string;
}

/**
 * §8's expansion: an item naming no performance in a multi-performance document becomes one
 * item per performance.
 *
 * A SINGLE-performance document expands to itself and keeps the caller's label unchanged, which
 * is what makes the ordinary case — one file, one label — read the way a caller expects. The
 * `«docLabel»:«perfName»` form appears only where a document really carried several.
 */
function expand(items: readonly InteriorCorpusItem[]): readonly ExpandedItem[] {
  const expanded: ExpandedItem[] = [];
  for (const [itemIndex, item] of items.entries()) {
    const docLabel = item.label ?? `items[${String(itemIndex)}]`;
    const performances = readPerformances(item.root);

    if (item.performance !== undefined) {
      const named =
        typeof item.performance === 'number'
          ? (performances[item.performance] as (typeof performances)[number] | undefined)
          : performances.find((candidate) => candidate.name === item.performance);
      expanded.push({
        root: item.root,
        itemIndex,
        performance: named?.name ?? String(item.performance),
        selector: item.performance,
        label: docLabel,
      });
      continue;
    }

    if (performances.length <= 1) {
      expanded.push({
        root: item.root,
        itemIndex,
        performance: performances[0]?.name ?? '',
        selector: 0,
        label: docLabel,
      });
      continue;
    }

    for (const performance of performances)
      expanded.push({
        root: item.root,
        itemIndex,
        performance: performance.name,
        selector: performance.name,
        label: `${docLabel}:${performance.name}`,
      });
  }
  return expanded;
}

/** Every label that appears more than once, with the item indices that produced it (A8). */
function collisions(items: readonly ExpandedItem[]): ReadonlyMap<string, readonly number[]> {
  const byLabel = new Map<string, number[]>();
  for (const item of items) {
    const seen = byLabel.get(item.label);
    if (seen === undefined) byLabel.set(item.label, [item.itemIndex]);
    else seen.push(item.itemIndex);
  }
  const bad = new Map<string, readonly number[]>();
  for (const [label, indices] of byLabel) if (indices.length > 1) bad.set(label, indices);
  return bad;
}

/** The median of a list, or null for an empty one — §8's `normalizationConstants` (AD-25.5). */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The `p`-th percentile of a sorted list by linear interpolation, or 0 for an empty one. */
function percentileOf(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = fraction * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.min(sorted.length - 1, low + 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

export function compareCorpusInterior(options: InteriorCorpusOptions): CorpusReport {
  const items = expand(options.items);
  const collided = collisions(items);
  if (collided.size > 0) throw new CorpusLabelCollisionError(collided);
  if (items.length > options.maxItems) throw new CorpusSizeError(items.length, options.maxItems);

  const n = items.length;
  if (options.k !== undefined && options.k > n)
    throw new CorpusOptionRangeError('k', options.k, n, n);
  if (options.embeddingAxes !== null && n > 1 && options.embeddingAxes > n - 1)
    throw new CorpusOptionRangeError('embeddingAxes', options.embeddingAxes, n - 1, n);
  const axes = options.embeddingAxes ?? Math.min(2, Math.max(1, n - 1));

  const labels = items.map((item) => item.label);
  const notes: ComparisonNote[] = [];

  // ONE window for the whole matrix (R3). Derived from the corpus rather than from a pair: the
  // maximum last date across every item, which every pairwise call is then handed as
  // `corpusEndQuarters` so no cell can pick a different one.
  const corpusEnd = corpusEndOf(options, items);

  const pairwise = new Map<string, ComparisonReport>();
  const aggregate = new Array<number>(n * n).fill(0);
  const byDimension = {} as Record<ComparisonDimension, number[]>;
  for (const dimension of COMPARISON_DIMENSIONS) byDimension[dimension] = new Array(n * n).fill(0);
  const signed = new Array<Record<ComparisonDimension, number | null>>(n * n);

  for (let i = 0; i < n; ++i)
    for (let j = i + 1; j < n; ++j) {
      const report = compareInterior({
        a: items[i].root,
        b: items[j].root,
        performanceA: items[i].selector,
        performanceB: items[j].selector,
        msm: options.msm,
        window: options.window,
        corpusEndQuarters: corpusEnd,
        weights: options.weights,
        jnd: options.jnd,
        plausibleRange: options.plausibleRange,
        invariance: options.invariance,
        lambdaDate: options.lambdaDate,
      });
      pairwise.set(`${String(i)},${String(j)}`, report);

      // BOTH triangles written from the SAME number, so `m[i*n+j] === m[j*n+i]` is bit-symmetry
      // by construction rather than by an appeal to the metric being symmetric (A4).
      aggregate[i * n + j] = report.aggregate.distance;
      aggregate[j * n + i] = report.aggregate.distance;
      for (const dimension of COMPARISON_DIMENSIONS) {
        const value = report.dimensions[dimension].distance;
        byDimension[dimension][i * n + j] = value;
        byDimension[dimension][j * n + i] = value;
      }
      const meanSigned = {} as Record<ComparisonDimension, number | null>;
      for (const dimension of COMPARISON_DIMENSIONS)
        meanSigned[dimension] = report.dimensions[dimension].meanSigned;
      signed[i * n + j] = meanSigned;
      // The descriptor is antisymmetric where the distance is symmetric: "A is faster than B"
      // read the other way round is "B is slower than A" (§7.5).
      const flipped = {} as Record<ComparisonDimension, number | null>;
      for (const dimension of COMPARISON_DIMENSIONS) {
        const value = meanSigned[dimension];
        flipped[dimension] = value === null ? null : -value;
      }
      signed[j * n + i] = flipped;

      for (const entry of report.notes)
        if (entry.kind === 'length-mismatch')
          notes.push({
            ...entry,
            itemIndex: i,
            message: `${labels[i]} | ${labels[j]}: ${entry.message}`,
          });
    }

  // AD-25.5's normalization, written out as a formula rather than stamped as a constant.
  const normalizationConstants =
    options.normalization === 'corpus' ? ({} as Record<ComparisonDimension, number | null>) : null;
  if (normalizationConstants !== null) {
    for (const dimension of COMPARISON_DIMENSIONS) {
      const nonzero: number[] = [];
      for (let i = 0; i < n; ++i)
        for (let j = i + 1; j < n; ++j) {
          const value = byDimension[dimension][i * n + j];
          if (value !== 0) nonzero.push(value);
        }
      normalizationConstants[dimension] = median(nonzero);
    }
    // The aggregate is REBUILT from the derived weights, so `aggregate` and `byDimension` stay
    // one function of one weight vector. A dimension with an empty nonzero set keeps the fixed
    // default `ω_k` and its constant is null — stamped, per A3d.
    for (let i = 0; i < n; ++i)
      for (let j = 0; j < n; ++j) {
        if (i === j) continue;
        let total = 0;
        for (const dimension of COMPARISON_DIMENSIONS) {
          const constant = normalizationConstants[dimension];
          const omega =
            constant === null || constant === 0 ? options.weights[dimension] : 1 / constant;
          total += omega * byDimension[dimension][i * n + j];
        }
        aggregate[i * n + j] = total;
      }
    notes.push(
      note(
        'structural',
        null,
        null,
        null,
        null,
        'normalization: "corpus" — ω_k = 1 / median(nonzero d_k) over this matrix (AD-25.5), so ' +
          'the aggregate compares dimensions on the spread they exhibit HERE rather than on ' +
          'their JND scales. The derived vector is corpus-dependent and carries the same ' +
          'reproducibility caveat the corpus window does; a dimension whose nonzero set is ' +
          'empty keeps the fixed default and its constant is null',
      ),
    );
  }

  const matrix = { n, values: aggregate };
  const dendrogram = agglomerate(matrix, options.linkage, labels);
  const partition = options.k === undefined ? null : pam(matrix, options.k, labels);
  const scores = partition === null ? null : silhouette(matrix, partition.clusters);
  const embedding = classicalMds(matrix, Math.max(1, axes), labels);
  const seriation = seriationOrder(embedding, labels);

  if (partition !== null && !partition.exhaustive)
    notes.push(
      note(
        'estimate-degradation',
        null,
        null,
        null,
        null,
        `PAM's medoids are BUILD + SWAP's, not the global optimum: C(${String(n)}, ${String(
          options.k ?? 0,
        )}) is past the exhaustive limit. Measured on random corpora the heuristic misses the ` +
          'optimum about 6 % of the time, worst excess 41 %, so a medoid read as "the most ' +
          'typical performance" here is a local answer',
      ),
    );
  if (partition !== null && n < SILHOUETTE_RELIABLE_MINIMUM)
    notes.push(
      note(
        'estimate-degradation',
        null,
        null,
        null,
        null,
        `silhouette is noisy below ${String(SILHOUETTE_RELIABLE_MINIMUM)} items and this corpus ` +
          `has ${String(n)}: it should inform a choice of k rather than decide one (A22)`,
      ),
    );

  // The corpus MEDOID — a single one, whatever `k` was asked for — is what §8's profiles are
  // taken against: "who is extreme in what", relative to the one performance that is most
  // typical of the whole corpus.
  const corpusMedoid = pam(matrix, 1, labels)?.medoids[0] ?? null;
  const profiles = items.map((_item, index) =>
    profileOf(index, corpusMedoid, n, byDimension, signed, aggregate),
  );

  const suspectPairs: { i: number; j: number; reason: ComparisonNoteKind }[] = [];
  for (let i = 0; i < n; ++i)
    for (let j = i + 1; j < n; ++j) {
      const report = pairwise.get(`${String(i)},${String(j)}`);
      if (report?.comparability.suspectPair === true)
        suspectPairs.push({ i, j, reason: 'length-mismatch' });
    }

  const context = options.noiseFloor ? contextOf(aggregate, n) : null;
  const scape =
    options.scape == null ? null : corpusScape(options, items, corpusEnd, corpusMedoid, n);
  const first = pairwise.values().next().value;

  return {
    n,
    labels,
    items: items.map((item) => ({
      itemIndex: item.itemIndex,
      performance: item.performance,
    })),
    matrices: { aggregate, byDimension },
    dendrogram,
    medoids: partition?.medoids ?? null,
    clusters: partition?.clusters ?? null,
    silhouette: scores,
    silhouetteReliable: n >= SILHOUETTE_RELIABLE_MINIMUM,
    embedding,
    seriationOrder: seriation,
    profiles,
    normalizationConstants,
    context,
    suspectPairs,
    scape,
    // A corpus of fewer than two items ran no comparison, so there is no report to read the
    // window and the echo off. The values are the ones §9.6 gives a degenerate shape: an empty
    // window, stamped as pair-derived because nothing derived it.
    window: first?.window ?? {
      startQuarters: 0,
      endQuarters: 0,
      rule: 'pair-derived' as const,
      metricGuarantee: 'window-restricted' as const,
    },
    settings: first?.inputs.settings ?? degenerateSettings(options),
    notes: sortNotes(notes),
  };
}

/**
 * §8's Sapp variant: per (start, size) cell, WHICH item is closest to the corpus medoid.
 *
 * Computed after the matrix, from `N − 1` extra comparisons against the medoid alone — a `2/N`
 * overhead on the `N(N−1)/2` the matrix already cost, which is why the corpus variant is
 * affordable at all. Each of those comparisons asks for its own pairwise scape, so every cell of
 * every candidate row comes from the SAME prefix-summed aggregate density the pairwise product
 * reports; the reduction is an argmin over item indices and introduces no new arithmetic.
 *
 * Ties go to the lowest LABEL, which is AD-25.2 reaching the one corpus product that had not
 * needed it yet — two performances equally typical over a bar is exactly the situation §8 says
 * is structural here rather than measure-zero.
 */
function corpusScape(
  options: InteriorCorpusOptions,
  items: readonly ExpandedItem[],
  corpusEnd: number | null,
  medoid: number | null,
  n: number,
): CorpusReport['scape'] {
  const bins = options.scape?.bins ?? 0;
  if (medoid === null || n < 2) return { bins: 0, kind: 'closest-to-medoid', medoid, cells: [] };

  const rows = new Map<number, readonly number[]>();
  let width = 0;
  for (let index = 0; index < n; ++index) {
    if (index === medoid) continue;
    const report = compareInterior({
      a: items[index].root,
      b: items[medoid].root,
      performanceA: items[index].selector,
      performanceB: items[medoid].selector,
      msm: options.msm,
      window: options.window,
      corpusEndQuarters: corpusEnd,
      weights: options.weights,
      jnd: options.jnd,
      plausibleRange: options.plausibleRange,
      invariance: options.invariance,
      lambdaDate: options.lambdaDate,
      scape: { bins },
    });
    rows.set(index, report.scape?.cells ?? []);
    width = report.scape?.bins ?? width;
  }

  const cellCount = (width * (width + 1)) / 2;
  // The medoid is at distance 0 from itself and would win every cell outright, so the reduction
  // is over the OTHERS — "which of the rest plays most like the typical one here".
  const cells = new Array<number>(cellCount).fill(medoid);
  for (let cell = 0; cell < cellCount; ++cell) {
    let best = -1;
    let bestValue = Number.POSITIVE_INFINITY;
    for (const [index, values] of rows) {
      const value = values[cell];
      if (
        value < bestValue ||
        (value === bestValue && best >= 0 && lowerLabel(items, index, best))
      ) {
        best = index;
        bestValue = value;
      }
    }
    cells[cell] = best < 0 ? medoid : best;
  }

  return { bins: width, kind: 'closest-to-medoid', medoid, cells };
}

/** Code-unit order on labels — AD-25.2's tie rule, reaching the scape. */
function lowerLabel(items: readonly ExpandedItem[], x: number, y: number): boolean {
  return items[x].label < items[y].label;
}

/**
 * The echo for a corpus too small to have run a comparison — `N ≤ 1`, which §8 makes legal.
 *
 * Built from the options rather than from a report, so the field is the settings the run WOULD
 * have used rather than a null a caller has to interpret.
 */
function degenerateSettings(options: InteriorCorpusOptions): ResolvedComparisonSettings {
  const plausibleRange: Partial<Record<ComparisonJndKey, readonly [number, number]>> = {};
  for (const key of COMPARISON_JND_KEYS) {
    const band = options.plausibleRange[key] ?? comparisonRowFor(key).plausibleRange;
    if (band !== null) plausibleRange[key] = band;
  }
  return {
    window: { start: options.window?.start ?? 0, end: options.window?.end ?? 0 },
    weights: { ...options.weights },
    jnd: effectiveJnd(options.jnd),
    plausibleRange,
    invariance: { ...options.invariance },
  };
}

/**
 * The corpus-shared window end: the MSM's score end, or the maximum last date over the items.
 *
 * A self-comparison per item is what reads that date, because `readComparisonPair` is the one
 * place `@pulsesPerQuarter` normalization and the `<part>` walk live and a second reading of a
 * document is a second thing to keep in step. It costs one parse-free pass per item.
 */
function corpusEndOf(
  options: InteriorCorpusOptions,
  items: readonly ExpandedItem[],
): number | null {
  if (items.length === 0) return null;
  let end = 0;
  for (const item of items) {
    const report = compareInterior({
      a: item.root,
      b: item.root,
      performanceA: item.selector,
      performanceB: item.selector,
      msm: options.msm,
      window: options.window,
      weights: options.weights,
      jnd: options.jnd,
      plausibleRange: options.plausibleRange,
      invariance: options.invariance,
      lambdaDate: options.lambdaDate,
    });
    end = Math.max(end, report.window.endQuarters);
  }
  return end;
}

function profileOf(
  index: number,
  medoid: number | null,
  n: number,
  byDimension: Record<ComparisonDimension, readonly number[]>,
  signed: readonly Record<ComparisonDimension, number | null>[],
  aggregate: readonly number[],
): CorpusReport['profiles'][number] {
  const toMedoid = {} as Record<ComparisonDimension, number>;
  const toMedoidSigned = {} as Record<ComparisonDimension, number | null>;
  for (const dimension of COMPARISON_DIMENSIONS) {
    toMedoid[dimension] = medoid === null ? 0 : byDimension[dimension][index * n + medoid];
    toMedoidSigned[dimension] =
      medoid === null || index === medoid ? null : (signed[index * n + medoid][dimension] ?? null);
  }
  let total = 0;
  for (let other = 0; other < n; ++other)
    if (other !== index) total += aggregate[index * n + other];
  return { toMedoid, toMedoidSigned, toMeanDistance: n > 1 ? total / (n - 1) : 0 };
}

/**
 * AD-26.3's per-piece percentile context — CONTEXT, never a rescaling.
 *
 * survey-lit L10's finding is that a raw number is not portable across pieces: the modal
 * correlation between two RANDOM performances is 0.67 for Mazurka 17/4 and 0.87 for 68/3, so
 * "two MPM files alone cannot tell you whether 0.8 is close". This says where a pair sits in
 * THIS corpus's own distribution. The matrices are untouched, so R3 and every metric guarantee
 * stand — which is the whole reason it is a separate block rather than a transform.
 */
function contextOf(aggregate: readonly number[], n: number): CorpusReport['context'] {
  const offDiagonal: number[] = [];
  for (let i = 0; i < n; ++i)
    for (let j = i + 1; j < n; ++j) offDiagonal.push(aggregate[i * n + j]);
  const sorted = [...offDiagonal].sort((x, y) => x - y);

  const percentile = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; ++i)
    for (let j = 0; j < n; ++j) {
      if (i === j) continue;
      const value = aggregate[i * n + j];
      // The fraction of pairs at or below this one — a rank, so equal distances share a rank.
      let below = 0;
      for (const other of sorted) if (other <= value) below += 1;
      percentile[i * n + j] = sorted.length === 0 ? 0 : below / sorted.length;
    }

  return {
    percentile,
    corpusMedian: median(sorted) ?? 0,
    corpusIqr: percentileOf(sorted, 0.75) - percentileOf(sorted, 0.25),
    // Sapp's sense: the boundary of the bottom half of the ranked distances.
    noiseFloor: percentileOf(sorted, 0.5),
  };
}

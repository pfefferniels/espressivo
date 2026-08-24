/**
 * The comparison window, and the two stamps that say how much the resulting number is worth.
 *
 * the design fixes both the precedence and the honesty:
 *
 * > `end` is, in precedence order: the MSM score end (`windowRule: 'msm'`); an explicit
 * > `options.window` (`'explicit'`); the corpus-shared window (`'corpus'`); otherwise the
 * > max over both documents of the last dated instruction (`'pair-derived'`). The first
 * > three are piece-derived and carry `metricGuarantee: 'unconditional'`; the fourth
 * > carries `'window-restricted'` and the documented prohibition on assembling such numbers
 * > into a matrix.
 *
 * The fourth is not metric, and a three-document counterexample shows why: for
 * `A = {60@0}`, `B = {60@0, 120@100}`, `C = {60@0, 60@200}` the three pairwise windows differ
 * and the triangle inequality reads `100·ln2 ≤ 0`. Hence the stamp, and hence its travelling
 * with the number rather than living in prose.
 *
 * `start` is 0 unless the caller supplies one, in every rule.
 */

/** Which of the four rules produced `end`. */
export type WindowRule = 'msm' | 'explicit' | 'corpus' | 'pair-derived';

/** Whether the metric guarantee holds for numbers computed in this window. */
export type MetricGuarantee = 'unconditional' | 'window-restricted';

/** the `window` block. Quarters throughout, as every reported date is. */
export interface ComparisonWindow {
  readonly startQuarters: number;
  readonly endQuarters: number;
  readonly rule: WindowRule;
  readonly metricGuarantee: MetricGuarantee;
}

/**
 * Everything the precedence chain can consult, all optional but the pair-derived floor. The
 * last-date figures are in quarters on the common grid, already normalized by the caller: the
 * window is a piece-level quantity and must not depend on which document happened to have the
 * finer tick grid.
 */
export interface WindowInputs {
  /** The MSM score end, when an MSM was supplied and could answer. */
  readonly msmEndQuarters?: number | null;
  /** `options.window`, already validated (`0 <= start < end`, both finite). */
  readonly explicit?: { readonly start: number; readonly end: number } | null;
  /** The corpus-shared end, when this pair is one cell of a corpus matrix. */
  readonly corpusEndQuarters?: number | null;
  /** Last dated instruction in each document; the floor of the chain. */
  readonly lastDateQuartersA: number;
  readonly lastDateQuartersB: number;
}

function guaranteeOf(rule: WindowRule): MetricGuarantee {
  return rule === 'pair-derived' ? 'window-restricted' : 'unconditional';
}

/**
 * the precedence chain.
 *
 * An explicit window outranks the MSM (which reordered the list): an explicit
 * caller choice winning is what every other option in this codebase does, and a silently
 * ignored `window` is the worse surprise. When an MSM is *also* present and its end differs,
 * the facade records the score end as a note rather than dropping it — the value is still
 * information, it just does not decide the window.
 *
 * A non-finite or non-positive candidate is skipped rather than propagated: an end that is
 * not a real number would make every integral `NaN`, and the chain has a well-defined floor
 * that cannot fail.
 */
export function computeWindow(inputs: WindowInputs): ComparisonWindow {
  const start = inputs.explicit?.start ?? 0;

  const candidates: readonly { readonly rule: WindowRule; readonly end: number | null }[] = [
    { rule: 'explicit', end: inputs.explicit?.end ?? null },
    { rule: 'msm', end: inputs.msmEndQuarters ?? null },
    { rule: 'corpus', end: inputs.corpusEndQuarters ?? null },
  ];

  for (const candidate of candidates) {
    if (candidate.end === null || !Number.isFinite(candidate.end)) continue;
    if (candidate.end <= start) continue;
    return {
      startQuarters: start,
      endQuarters: candidate.end,
      rule: candidate.rule,
      metricGuarantee: guaranteeOf(candidate.rule),
    };
  }

  // The floor. `Math.max` over two finite numbers; a document whose every date is
  // unparseable contributes 0 rather than NaN, which the caller guarantees by passing 0
  // for an empty document (see `lastDateQuarters` in document.ts).
  const derived = Math.max(inputs.lastDateQuartersA, inputs.lastDateQuartersB);
  return {
    startQuarters: start,
    endQuarters: Number.isFinite(derived) && derived > start ? derived : start,
    rule: 'pair-derived',
    metricGuarantee: guaranteeOf('pair-derived'),
  };
}

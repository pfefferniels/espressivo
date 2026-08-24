/**
 * the edit path as a report: eleven dimensions' scripts, one document pair, one orientation.
 *
 * `editScript.ts` searches, `editState.ts` presents a state as a map view, `dimensions.ts`
 * supplies each dimension's `Φ` and `‖·‖₁`. This file turns the result into the `DiffReport`
 * — sites, dates, measures, attribute deltas, the two totals per dimension — and is where
 * the orientation rule lives.
 *
 * ## The script is computed once and inverted
 *
 * The traceback precedence `substitute > delete > insert` is deterministic but not
 * transposition-covariant: transposing the inputs maps "delete `a_i`" to "insert `a_i`", so at a
 * tied cell each direction takes its own delete branch and the two runs are not mirrors of one
 * another. Mirroring is made true by construction — the canonical orientation is decided from
 * content, the script is computed in it, and the other direction is the inversion.
 *
 * Content-derived, not label-derived: `diffMpm(a, b)` and `diffMpm(b, a)` present the
 * same role names in both directions, so a rule keyed on `'a'` and `'b'` would not distinguish
 * the two calls at all. The key is the document's canonical serialization followed by the
 * performance selector, compared in code-unit order; equal keys mean identical inputs and the
 * orientation is irrelevant.
 *
 * ## What the report does not carry
 *
 * No `applyEditScript` writer: the ops carry concrete values and are machine-applicable
 * in principle, but a writer ships when a consumer asks for one. And no `boundary_prf` — the
 * derives it from `opCounts` in a cookbook recipe with the non-equivalence caveat, because
 * mpmify's matcher is greedy-nearest with a tolerance while this one is a cost-minimizing DP.
 */
import { filterMap } from '../prelude/index.js';
import { attribute } from '../xml/tree.js';
import { readAttributeValue, readNumericAttributeValue } from '../expression/attributes.js';
import { serializeMpmRoot, parseMpmRoot } from '../expression/mpmDocument.js';
import {
  effectiveJnd,
  epsilonRecord,
  note,
  resolvedSettings,
  scopeSides,
  sortNotes,
  type InteriorCompareOptions,
} from './compare.js';
import { plausibilityFindings } from './plausibility.js';
import {
  editScriptForDimension,
  type DimensionEditScript,
  type DimensionSettings,
  type ScopeSide,
} from './dimensions.js';
import type { EditInstruction } from './editState.js';
import type { EditStep } from './editScript.js';
import { invertSteps } from './editScript.js';
import { readComparisonPair } from './document.js';
import { beatGridOf, measurePositionAt, readComparisonMsm, type ComparisonMsm } from './msm.js';
import {
  COMPARISON_DIMENSIONS,
  COMPARISON_REGISTRY_ROWS,
  comparisonRowFor,
  localDistance,
  type ComparisonDimension,
  type ComparisonRegistryRow,
} from './registry.js';
import { CompensatedSum } from './quadrature.js';
import { bottom, valued, type Valued } from './values.js';
import type { Element } from '../xml/XomTypes.js';
import type {
  ComparisonNote,
  ComparisonSiteRef,
  DiffReport,
  EditOp,
  EditOpAttribute,
  EditScript,
} from './report.js';

/** What the facade hands the interior, with every default already resolved. */
export interface InteriorDiffOptions extends InteriorCompareOptions {
  /** the `fragment`/`consolidate` ops (the `moves`); off unless the caller asks. */
  readonly moves?: boolean;
}

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------

/**
 * the canonical key: the document's canonical serialization, then the performance selector.
 *
 * `serializeMpmRoot` is what `canonicalMpm` is built on — the facade's function cannot be used
 * here, since the comparison layer may not import `src/api` (MINOR-5's zone) — so the bytes are
 * the same bytes a caller would see from `canonicalMpm`. The selector joins with `U+0000`,
 * which no XML serialization contains, so no selector can forge a key boundary.
 *
 * The separator is written as the escape `\u0000` and never as the character itself. A raw NUL
 * in the source makes the file binary to the tools this project is reviewed with: `git diff`
 * reports "Binary files differ" and shows no lines, `grep` and `rg` skip it in silence, and
 * `file` calls it data. `clustering.ts` writes the same separator the same way.
 */
function orientationKey(root: Element, selector: string | number | undefined): string {
  return `${serializeMpmRoot(root)}\u0000${selector === undefined ? '' : String(selector)}`;
}

/** True where the caller's `(a, b)` is already the canonical order and no inversion is needed. */
function callerIsCanonical(
  rootA: Element,
  selectorA: string | number | undefined,
  rootB: Element,
  selectorB: string | number | undefined,
): boolean {
  // Code-unit order (`<`), never `localeCompare`, which is locale-dependent and would break
  // the byte-identity across environments — the module's own ban, applied to itself.
  return orientationKey(rootA, selectorA) <= orientationKey(rootB, selectorB);
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

export function diffInterior(options: InteriorDiffOptions): DiffReport {
  const rootA = typeof options.a === 'string' ? parseMpmRoot(options.a) : options.a;
  const rootB =
    options.b === undefined
      ? rootA
      : typeof options.b === 'string'
        ? parseMpmRoot(options.b)
        : options.b;

  const canonical = callerIsCanonical(rootA, options.performanceA, rootB, options.performanceB);

  const forward: InteriorDiffOptions = canonical
    ? { ...options, a: rootA, b: rootB }
    : {
        ...options,
        a: rootB,
        b: rootA,
        performanceA: options.performanceB,
        performanceB: options.performanceA,
        invariance: options.invariance,
      };

  const report = buildDiff(forward);
  return canonical ? report : invertReport(report);
}

function buildDiff(options: InteriorDiffOptions): DiffReport {
  const msm = options.msm == null ? null : readComparisonMsm(options.msm);
  const pair = readComparisonPair({
    a: options.a,
    b: options.b,
    performanceA: options.performanceA,
    performanceB: options.performanceB,
    msmEndQuarters: msm === null ? null : msm.endQuarters,
    window: options.window ?? null,
    corpusEndQuarters: options.corpusEndQuarters ?? null,
  });

  const ticksPerQuarter = pair.ppq.lcm;
  const settings: DimensionSettings = {
    window: pair.window,
    ticksPerQuarter,
    jnd: options.jnd,
    invariance: options.invariance,
    beatGrid: msm === null ? null : beatGridOf(msm, ticksPerQuarter),
    lambdaDate: options.lambdaDate,
  };

  const scopes = scopeSides(pair, msm);
  const notes: ComparisonNote[] = [];
  const scripts: EditScript[] = [];

  // the notes, on the edit path. Which kinds belong here is decided by what the
  // diff consumes — the rule for the option surface, applied to the report surface. Two
  // do.
  //
  // `plausibility` is the one the design names, and the reason `plausibleRange` stays on
  // `DiffMpmOptions` rather than joining the `Omit`: `plausibilityFindings` reads the two
  // documents and nothing else — not the aggregate, not the weights, not the comparison — and
  // the diff parses the same two documents. An implausible `@bpm` is also exactly the site the
  // script will price a large op at, so "the distance is unchanged" stops it being read as the
  // cause.
  for (const side of ['a', 'b'] as const)
    for (const finding of plausibilityFindings(
      pair[side],
      side,
      ticksPerQuarter,
      options.plausibleRange,
    ))
      notes.push({
        kind: 'plausibility',
        dimension: comparisonRowFor(finding.key).dimension,
        document: side,
        itemIndex: null,
        site: finding.site,
        startQuarters: finding.site.date,
        endQuarters: finding.site.date,
        message:
          `@${finding.site.attribute} = ${String(finding.value)} is outside its plausible band ` +
          `[${String(finding.range[0])}, ${String(finding.range[1])}]; the distance is unchanged`,
      });

  // `estimate-degradation` for the MPM-derived scope rule: `DiffReport.scopes` reports
  // `rule: 'mpm'`, and the design says that rule carries this note. The wording is
  // `compare.ts`'s, because it is the same fact about the same documents.
  if (scopes.rule === 'mpm')
    notes.push(
      note(
        'estimate-degradation',
        null,
        null,
        pair.window.startQuarters,
        pair.window.endQuarters,
        `the per-part sum runs over ${String(scopes.sides.length)} scopes taken from the MPM's ` +
          'own <part> elements, because no MSM was supplied. What the renderer performs is one ' +
          'scope per rendered MSM part, which the documents alone cannot answer: an ' +
          'MPM part the score never names performs nothing, and a score part with no MPM ' +
          'counterpart performs the global maps anyway. Supply an `msm` for the counted quantity',
      ),
    );
  // Compensated, and in the same order `dimensionComparison` sums its scopes, so `dCurve` is
  // bit-identical to the `d_k` the comparison reports rather than merely close to it: a plain
  // `+=` here differed from it in the last ulps on the vendored rubato rows.
  const totals = new Map<
    ComparisonDimension,
    {
      dCurve: CompensatedSum;
      scriptCost: CompensatedSum;
      replayedDelta: CompensatedSum;
      replayResidual: CompensatedSum;
    }
  >(
    COMPARISON_DIMENSIONS.map((dimension) => [
      dimension,
      {
        dCurve: new CompensatedSum(),
        scriptCost: new CompensatedSum(),
        replayedDelta: new CompensatedSum(),
        replayResidual: new CompensatedSum(),
      },
    ]),
  );

  for (const [a, b] of scopes.sides) {
    const part = a.scope.scope === 'global' ? null : (a.scope.number ?? b.scope.number ?? null);
    for (const dimension of COMPARISON_DIMENSIONS) {
      const result = editScriptForDimension(dimension, a, b, settings, {
        moves: options.moves,
      });
      const total = totals.get(dimension);
      if (total !== undefined) {
        total.dCurve.add(result.script.directDistance);
        total.scriptCost.add(result.script.scriptCost);
        total.replayedDelta.add(result.script.replayedDelta);
        total.replayResidual.add(result.script.replayResidual);
      }
      if (result.script.steps.length === 0) continue;
      scripts.push(editScriptOf(result, a, b, part, ticksPerQuarter, msm));
    }
  }

  const dimensions = {} as DiffReport['dimensions'];
  for (const dimension of COMPARISON_DIMENSIONS) {
    const total = totals.get(dimension);
    const dCurve = total?.dCurve.total ?? 0;
    const scriptCost = total?.scriptCost.total ?? 0;
    dimensions[dimension] = {
      // the guarantee is a statement about the curve-shaped dimensions, and the null case is
      // the event-shaped ones: their `d_k` is an alignment optimum rather than a curve
      // integral, so calling it `dCurve` would name it as something it is not.
      dCurve: EVENT_SHAPED.includes(dimension) ? null : dCurve,
      scriptCost,
      replayedDelta: total?.replayedDelta.total ?? 0,
      reworking: scriptCost - dCurve,
      replayResidual: total?.replayResidual.total ?? 0,
    };
  }

  return {
    inputs: {
      settings: resolvedSettings(options, pair),
      jnd: effectiveJnd(options.jnd),
      msmUsed: msm !== null,
      epsilon: epsilonRecord(),
    },
    window: {
      startQuarters: pair.window.startQuarters,
      endQuarters: pair.window.endQuarters,
      rule: pair.window.rule,
      metricGuarantee: pair.window.metricGuarantee,
    },
    ppq: {
      a: pair.ppq.a,
      b: pair.ppq.b,
      lcm: pair.ppq.lcm,
      fallbackUsed: pair.ppq.fallbackUsed,
      assumed: pair.ppq.assumed,
      unusableDeclaration: {
        a: pair.a.ppq.unusableDeclaration,
        b: pair.b.ppq.unusableDeclaration,
      },
    },
    parts: pair.scopes.map((pairing) => ({
      numberA: pairing.numberA,
      numberB: pairing.numberB,
      nameA: pairing.nameA,
      nameB: pairing.nameB,
      matched: pairing.matched,
    })),
    scopes: { rule: scopes.rule, count: scopes.sides.length },
    scripts: scripts.toSorted(compareScripts),
    dimensions,
    notes: sortNotes(notes),
  };
}

/** The two dimensions whose `d_k` is an alignment optimum rather than a curve integral. */
const EVENT_SHAPED: readonly ComparisonDimension[] = ['articulation', 'ornamentation'];

/**
 * the total order on scripts: part, then map, then dimension.
 *
 * A null part is the global scope and sorts first, which is the order `readScopes` produces and
 * the order `parts` is reported in. Two scripts cannot tie on all three, since one (part, map)
 * carries at most one dimension's script.
 */
function compareScripts(x: EditScript, y: EditScript): number {
  const partDelta = (x.part ?? -1) - (y.part ?? -1);
  if (partDelta !== 0) return partDelta;
  if (x.map !== y.map) return x.map < y.map ? -1 : 1;
  return x.dimension < y.dimension ? -1 : x.dimension > y.dimension ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Ops
// ---------------------------------------------------------------------------

function editScriptOf(
  result: DimensionEditScript,
  a: ScopeSide,
  b: ScopeSide,
  part: number | null,
  ticksPerQuarter: number,
  msm: ComparisonMsm | null,
): EditScript {
  const rows = COMPARISON_REGISTRY_ROWS.filter((row) =>
    row.sites.some((site) => site.kind === 'instruction' && site.container === result.container),
  );
  const ops = result.script.steps.map((step) =>
    editOpOf(step, result, a, b, part, ticksPerQuarter, msm, rows),
  );
  return {
    part,
    map: result.container,
    dimension: result.dimension,
    ops,
    topByCost: [...result.script.topByCost],
    opCounts: { ...result.script.opCounts },
  };
}

function editOpOf(
  step: EditStep<EditInstruction>,
  result: DimensionEditScript,
  a: ScopeSide,
  b: ScopeSide,
  part: number | null,
  ticksPerQuarter: number,
  msm: ComparisonMsm | null,
  rows: readonly ComparisonRegistryRow[],
): EditOp {
  const attributes = attributeDeltas(step, rows);
  const dateA = step.a === null ? null : step.a.dateTicks / ticksPerQuarter;
  const dateB = step.b === null ? null : step.b.dateTicks / ticksPerQuarter;
  // The site points at the element the op is about, preferring the A side because the script
  // transforms A: that is where a reader following along in the score stands until the op has
  // been applied, and the side `dateA ?? dateB` keys the delivered order on.
  const anchor = step.a ?? step.b;
  const anchorSide = step.a === null ? b : a;

  return {
    op: step.move,
    map: result.container,
    part,
    site: {
      document: anchorSide.role,
      scope: anchorSide.scope.scope,
      partIndex: anchorSide.scope.partIndex,
      container: result.container,
      date: anchor === null ? null : anchor.dateTicks / ticksPerQuarter,
      index: anchor?.entry.documentIndex ?? -1,
      // The attribute the op is most about — the largest priced delta — so `site` names
      // something a reader can look at rather than an arbitrary first field. Empty where the op
      // changes no priced attribute at all, which a pure element insertion can be.
      attribute: attributes[0]?.name ?? '',
      xmlId: anchor === null ? null : readAttributeValue(anchor.entry.element, 'id'),
    },
    dateA,
    dateB,
    measureA: msm === null || dateA === null ? null : measurePositionAt(msm.measures, dateA),
    measureB: msm === null || dateB === null ? null : measurePositionAt(msm.measures, dateB),
    attributes,
    count: { a: step.aItems.length, b: step.bItems.length },
    cost: step.cost,
    free: step.free,
    applicationIndex: step.applicationIndex,
    costRank: step.costRank,
  };
}

/**
 * Every registry attribute the op changes, priced by the capped local metric.
 *
 * A registry-driven walk rather than eleven hooks — `plausibility.ts`'s shape, for the same
 * reason: the rows already say which attributes each container's elements carry, and a
 * per-dimension list here would be a second inventory to keep in step with the first.
 *
 * Sorted by `deltaJnd` descending, so `attributes[0]` is what the op is most about and the
 * site's `attribute` field names something worth looking at. Ties keep the registry's own row
 * order, which is a single-document order and cannot leak an orientation.
 */
function attributeDeltas(
  step: EditStep<EditInstruction>,
  rows: readonly ComparisonRegistryRow[],
): readonly EditOpAttribute[] {
  const elementA = step.a?.entry.element ?? null;
  const elementB = step.b?.entry.element ?? null;
  const localName = (elementA ?? elementB)?.getLocalName() ?? '';

  // The three guards precede `localDistance`, the only arithmetic here, so a row no guard admits
  // is never priced.
  return filterMap(rows, (row) => {
    // An op's two elements can differ in local name — a `<style>` substituted for an
    // `<articulation>` is a legal DP move — so a row applies where it names either side's
    // element, and the absent side reads `⊥` exactly as an absent attribute does.
    if (
      row.element !== localName &&
      row.element !== elementA?.getLocalName() &&
      row.element !== elementB?.getLocalName()
    )
      return null;
    const rawA = elementA === null ? null : readAttributeValue(elementA, row.attribute);
    const rawB = elementB === null ? null : readAttributeValue(elementB, row.attribute);
    if (rawA === null && rawB === null) return null;
    if (rawA === rawB) return null;

    return {
      key: row.key,
      name: row.attribute,
      valueA: rawA === null ? null : (readValue(elementA, row) ?? rawA),
      valueB: rawB === null ? null : (readValue(elementB, row) ?? rawB),
      deltaJnd: localDistance(row, readValued(elementA, row), readValued(elementB, row)).distance,
    };
  }).toSorted((x, y) => y.deltaJnd - x.deltaJnd);
}

/** The row's value as a number, or null where the attribute is absent or not numeric. */
function readValue(element: Element | null, row: ComparisonRegistryRow): number | null {
  if (element === null) return null;
  if (attribute(row.attribute, element) === null) return null;
  const value = readNumericAttributeValue(element, row.attribute);
  return Number.isFinite(value) ? value : null;
}

/**
 * The row's value for the metric: `⊥` where it is absent or outside the row's own domain.
 *
 * The `⊥` reading of an absent attribute is what `localDistance`'s documentation prescribes for
 * the edit path — "no comparable value gets a metric-safe price instead of a hole in the
 * domain" — and it prices at `δ_row`, the same figure the report's `⊥` carries everywhere else.
 */
function readValued(element: Element | null, row: ComparisonRegistryRow): Valued<number> {
  const value = readValue(element, row);
  if (value === null) return bottom('renderer-error');
  return row.valueDomain(value) ? valued(value) : bottom('renderer-error');
}

// ---------------------------------------------------------------------------
// The mirror
// ---------------------------------------------------------------------------

/**
 * The report for the other direction, by inversion rather than by a second traceback.
 *
 * Every field that carries a document identity swaps and every cost is untouched: `‖·‖₁` is
 * symmetric, so the reversed script's ops cost what the forward ones do and a caller who
 * inverts gets bit-identical numbers instead of a second run's arbitrary choice among ties.
 */
function invertReport(report: DiffReport): DiffReport {
  return {
    ...report,
    inputs: report.inputs,
    ppq: {
      ...report.ppq,
      a: report.ppq.b,
      b: report.ppq.a,
      unusableDeclaration: {
        a: report.ppq.unusableDeclaration.b,
        b: report.ppq.unusableDeclaration.a,
      },
    },
    parts: report.parts.map((pairing) => ({
      numberA: pairing.numberB,
      numberB: pairing.numberA,
      nameA: pairing.nameB,
      nameB: pairing.nameA,
      matched: pairing.matched,
    })),
    scripts: report.scripts.map(invertScript),
    // Re-sorted after the swap: `sortNotes` orders on `document` and on the
    // serialized note, both of which the swap changes, so mapping in place would leave the
    // mirrored report holding the forward report's order — and the claim is byte-identity,
    // not set equality.
    notes: sortNotes(
      report.notes.map((entry) => ({
        ...entry,
        document: entry.document === 'a' ? 'b' : entry.document === 'b' ? 'a' : null,
        site: entry.site === null ? null : invertSite(entry.site),
      })),
    ),
  };
}

function invertSite(site: ComparisonSiteRef): ComparisonSiteRef {
  return { ...site, document: site.document === 'a' ? 'b' : 'a' };
}

function invertScript(script: EditScript): EditScript {
  // The moves and their order come from `invertSteps`, the one place the swap rule lives; this
  // function carries the report-shaped fields across it.
  const byIdentity = new Map(script.ops.map((op) => [identityOf(op), op]));
  const inverted = invertSteps(
    script.ops.map((op) => {
      const anchorA = op.dateA === null ? null : { dateTicks: op.dateA, key: identityOf(op) };
      const anchorB = op.dateB === null ? null : { dateTicks: op.dateB, key: identityOf(op) };
      return {
        move: op.op,
        a: anchorA,
        b: anchorB,
        // One representative per side, not the whole group: the mirror swaps sides, and the
        // group's own size travels on the `EditOp` it is copied from.
        aItems: anchorA === null ? [] : [anchorA],
        bItems: anchorB === null ? [] : [anchorB],
        indexA: op.dateA === null ? null : op.applicationIndex,
        indexB: op.dateB === null ? null : op.applicationIndex,
        cost: op.cost,
        free: op.free,
        applicationIndex: op.applicationIndex,
        costRank: op.costRank,
      };
    }),
  );

  const ops = inverted.map((step, index): EditOp => {
    const original = byIdentity.get((step.a ?? step.b)?.key ?? '');
    if (original === undefined)
      throw new Error('comparison: an op lost its identity in the mirror');
    return {
      ...original,
      op: step.move,
      site: invertSite(original.site),
      dateA: original.dateB,
      dateB: original.dateA,
      measureA: original.measureB,
      measureB: original.measureA,
      attributes: original.attributes.map((entry) => ({
        ...entry,
        valueA: entry.valueB,
        valueB: entry.valueA,
      })),
      // The group sizes swap with the sides: one-became-three read the other way round is
      // three-became-one.
      count: { a: original.count.b, b: original.count.a },
      applicationIndex: index,
      costRank: step.costRank,
    };
  });

  // Decorated before sorting, `editScript.rankByCostDescending`'s shape: the cost travels with
  // its delivery index, so the comparator reads no second array.
  const ranking = ops
    .map((op, index) => ({ cost: op.cost, index }))
    .sort((x, y) => y.cost - x.cost || x.index - y.index)
    .map((entry) => entry.index);

  return {
    ...script,
    ops,
    topByCost: ranking,
    opCounts: {
      ...script.opCounts,
      insert: script.opCounts.delete,
      delete: script.opCounts.insert,
      // the pair swaps for the same reason the plain pair does: on a real pair the forward
      // direction had 9 fragments and 2 consolidates, and the reverse reported 2 and 9 in the
      // ops while unswapped counts still said 9 and 2.
      fragment: script.opCounts.consolidate,
      consolidate: script.opCounts.fragment,
    },
  };
}

/** A key that survives the mirror: an op is identified by where it sits in the forward order. */
function identityOf(op: EditOp): string {
  return String(op.applicationIndex);
}

/**
 * The MSM-dependent half of the report (A10's R1 carve-out), computed from the score and the
 * **transformed** document.
 *
 * `report.ts` declares the four fields and ships them null; this is what fills them in when a
 * caller supplies `options.msm`. Nothing here decides a transform — the applier has already
 * run and the tree these walks read is the one it wrote. That is deliberate rather than
 * incidental: reading the OUTPUT means the estimates are about the values a caller is going to
 * render, and it means this module holds no copy of the transform arithmetic that could drift
 * from the engine's.
 *
 * ## `null` is a third answer, and it is the honest one
 *
 * Each count is `number | null`, and the null does more work than "no MSM was given":
 *
 * - **`0`** — the document has sites of this family and none of them is at risk.
 * - **`n`** — that many sites are at risk.
 * - **`null`** — the document has at least one site of this family whose risk this MSM does
 *   not determine.
 *
 * The third case is not hypothetical. Three of the four cliffs are millisecond quantities
 * (§7.7's pass-two commit guard, §7.13's toneduration offsets, and the milliseconds half of
 * §7.9's frame), and a note's length in milliseconds exists only in an MSM that has already
 * been performed — deriving it from a score needs the tempo map, i.e. a render, which R1 puts
 * out of reach. Answering `0` there would report "no risk found" for a question that was never
 * asked, which is the failure mode C2 forbids in its numeric form. So a caller who wants the
 * millisecond cliffs passes a performed MSM (`performMsm({msm, mpm})` on the pre-exaggeration
 * pair, which is the baseline the renderer's guards are measured against) and a caller who
 * passes a raw score gets the symbolic estimates and an explicit null for the rest.
 *
 * ## What "at risk" means
 *
 * Each cliff is a renderer guard that fires when an offset reaches a note's length, and the
 * note it fires on is not knowable from the MPM — an ornament names its notes by id, an
 * imprecision distribution covers a span, an articulation applies to whatever the map reaches.
 * So the comparison is against the **shortest note in the score**: a site counts as at risk
 * when its transformed magnitude reaches that length, i.e. when there exists a note the guard
 * could fire on. It is a screening estimate and it is stated as one — §7.9's own words are
 * "the report carries the frame magnitude and flags cliff risk rather than a bound".
 */
import { readAttributeValue } from './attributes.js';
import {
  FRAME_LENGTH_ATTRIBUTE,
  FRAME_START_ATTRIBUTE,
  NOTEOFF_SHIFT_ATTRIBUTE,
  ORNAMENT_DEF_ELEMENT,
  ORNAMENT_STYLE_COLLECTION,
  TEMPORAL_SPREAD_ELEMENT,
  TRANSITION_TO_ATTRIBUTE,
  DISTRIBUTION_ELEMENTS,
  DISTRIBUTION_LIST_ELEMENT,
  MEASUREMENT_ELEMENT,
  IMPRECISION_DIMENSION_MAPS,
  imprecisionGroupAttributes,
} from './registry.js';
import { orderedEntries } from './datedView.js';
import { environmentsOf, type MpmEnvironment, type PerformanceView } from './mpmTree.js';
import {
  shortestNoteInMilliseconds,
  shortestNoteInTicks,
  type MsmFacts,
  type MsmPart,
} from './msmFacts.js';
import type { MsmDependentEstimates } from './report.js';
import {
  detectFrameFormat,
  parseTemporalText,
  resolveTemporalDomain,
  v3FrameOffsetAttribute,
  type TemporalDomain,
} from './temporalValue.js';
import { ARTICULATION_MAP, ARTICULATION_STYLE, DYNAMICS_MAP } from '../mpm/names.js';
import type { Element } from '../xml/XomTypes.js';

/** `<articulationDef>` and inline `<articulation>` carry the same twelve modifiers (§7.7). */
const ARTICULATION_DEF_ELEMENT = 'articulationDef';
const ARTICULATION_ELEMENT = 'articulation';

/** §7.7's two millisecond levers — the pair the pass-two commit guard compares. */
const ARTICULATION_DELAY_MS = 'absoluteDelayMs';
const ARTICULATION_DURATION_CHANGE_MS = 'absoluteDurationChangeMs';

/**
 * A `%` frame bound is a percentage OF the principal note, so the note's own length is 100 in
 * that domain whatever the score says — the one cliff comparison no MSM is needed for.
 */
const RELATIVE_NOTE_LENGTH = 100;

/** The MPM's own tick grid, used when a `<performance>` declares none (`Performance`'s default). */
const DEFAULT_PERFORMANCE_PPQ = 720;

/**
 * A count that knows whether it is complete: `at` sites are at risk, and `undecided` records
 * that some site's risk could not be read off this MSM at all.
 *
 * Kept as a pair rather than as a nullable running total because the two facts are
 * independent — a document can hold one site that is provably at risk and another whose
 * domain this MSM cannot answer, and the report must say `null` for that family rather than
 * `1`, which would read as "one, and that is all of them".
 */
class RiskTally {
  private at = 0;
  private undecided = false;

  /** One site whose magnitude was comparable. */
  count(atRisk: boolean): void {
    if (atRisk) this.at += 1;
  }

  /** One site whose magnitude had no length to compare against in this MSM. */
  undecidable(): void {
    this.undecided = true;
  }

  /**
   * Compare one magnitude against a length that may be unavailable, recording either the
   * verdict or the fact that there was none.
   */
  against(magnitude: number, length: number | null): void {
    if (length === null) this.undecidable();
    else this.count(magnitude >= length);
  }

  get total(): number | null {
    return this.undecided ? null : this.at;
  }
}

/**
 * §4/A10's estimates for one performance, given the score.
 *
 * @param performance the transformed performance, as the applier left it.
 * @param facts the MSM the caller supplied, read by `msmFacts.ts`.
 * @param accentuationRan whether the `accentuation` dimension was walked, which is what
 *   {@link MsmDependentEstimates.beatsUnverifiable} reports on.
 */
export function estimatesFromMsm(
  performance: PerformanceView,
  facts: MsmFacts,
  accentuationRan: boolean,
): MsmDependentEstimates {
  const milliseconds = shortestNoteInMilliseconds(facts);
  return {
    unreachableLevels: unreachableLevels(performance, facts),
    articulationCommitCliffs: articulationCommitCliffs(performance, milliseconds),
    ornamentSpreadCliffs: ornamentSpreadCliffs(performance, facts, milliseconds),
    imprecisionDurationCliffs: imprecisionDurationCliffs(performance, milliseconds),
    // Unchanged by the MSM, deliberately: the flag reports how `velocityCoefficients` was
    // computed, and that number is the applier's — computed over the def's own `@beat`
    // anchors, without an MSM to name the beats the score reaches. Flipping the flag here
    // while leaving the coefficient alone would make the report describe a computation that
    // never happened. See this wave's report for the reconciliation item.
    beatsUnverifiable: accentuationRan,
  };
}

// ---------------------------------------------------------------------------
// §7.4 — the levels a dynamics map never delivers
// ---------------------------------------------------------------------------

/**
 * Notes whose dynamics the map cannot reach, however large the factor.
 *
 * Two shapes, both from `DynamicsMap.renderDynamicsToMap`:
 *
 * - **Before the first instruction.** The render loop writes a flat `velocity="100.0"` onto
 *   every note earlier than the first instruction's date (DynamicsMap.ts:251-253), so those
 *   notes carry a constant the document never wrote and no exaggeration of it can move.
 * - **Under an unterminated transition.** `getEndDate` answers `Number.MAX_VALUE` for the
 *   last instruction in a map (DynamicsMap.ts:190-196), so a final `<dynamics>` carrying
 *   `@transition.to` ramps across an unbounded span and never arrives: its target is scaled
 *   by the transform and still never rendered.
 *
 * A part with no dynamics map at all — neither its own nor a global one — is the first case
 * taken to the whole part: `DynamicsMap.renderDynamicsToMap`'s static form writes 100.0 onto
 * every note (DynamicsMap.ts:286-289).
 *
 * Always a number, never null: both facts are symbolic, and every MSM has them.
 */
function unreachableLevels(performance: PerformanceView, facts: MsmFacts): number {
  let count = 0;
  for (const part of facts.parts) {
    const dated = part.notes.filter((note) => Number.isFinite(note.date));
    const map = governingDynamicsMap(performance, part);
    const instructions =
      map === null
        ? []
        : orderedEntries(map).filter(
            (entry) =>
              entry.element.getLocalName() === 'dynamics' &&
              readAttributeValue(entry.element, 'volume') !== null,
          );

    if (instructions.length === 0) {
      count += dated.length;
      continue;
    }

    const first = instructions[0].date;
    const last = instructions[instructions.length - 1];
    const unterminated = readAttributeValue(last.element, TRANSITION_TO_ATTRIBUTE) !== null;
    for (const note of dated) {
      if (note.date < first) count += 1;
      else if (unterminated && note.date >= last.date) count += 1;
    }
  }
  return count;
}

/**
 * The dynamics map that governs one MSM part: its own MPM part's, or the global one.
 *
 * A part with a local map of a type does not additionally receive the global map of that type
 * — `Performance.getGlobalMapRecipients` (Performance.ts:792-808) hands the global map only to
 * the parts that have none.
 */
function governingDynamicsMap(performance: PerformanceView, part: MsmPart): Element | null {
  const local = correspondingEnvironment(performance, part)?.maps.get(DYNAMICS_MAP);
  return local ?? performance.global.maps.get(DYNAMICS_MAP) ?? null;
}

/**
 * The MPM part corresponding to an MSM part: by `@number` first, then by `@name` —
 * `Performance.getCorrespondingPart` (Performance.ts:313-319), in that order.
 */
function correspondingEnvironment(
  performance: PerformanceView,
  part: MsmPart,
): MpmEnvironment | null {
  if (part.number !== null) {
    const byNumber = performance.parts.find(
      (environment) => numberOrNull(environment.element, 'number') === part.number,
    );
    if (byNumber !== undefined) return byNumber;
  }
  if (part.name !== null) {
    const byName = performance.parts.find(
      (environment) => readAttributeValue(environment.element, 'name') === part.name,
    );
    if (byName !== undefined) return byName;
  }
  return null;
}

// ---------------------------------------------------------------------------
// §7.7 — the articulation commit cliff
// ---------------------------------------------------------------------------

/**
 * Articulation sites whose millisecond modifiers can invert a note.
 *
 * Pass two commits its three millisecond modifiers only if `dateNew < endNew` and otherwise
 * discards **all** of them, reverting the note to its unexaggerated date *and* end (§7.7,
 * SURVEY.md:2003-2009). `@absoluteDelayMs` moves the onset alone and
 * `@absoluteDurationChangeMs` moves the end alone, so the guard fires exactly when
 * `delay − change` reaches the note's rendered length.
 *
 * Both site kinds carry the same twelve modifiers, so both are walked: a named
 * `<articulationDef>` and an inline `<articulation>`.
 */
function articulationCommitCliffs(
  performance: PerformanceView,
  millisecondNoteLength: number | null,
): number | null {
  const tally = new RiskTally();
  for (const site of articulationSites(performance)) {
    const delay = numberOrNull(site, ARTICULATION_DELAY_MS);
    const change = numberOrNull(site, ARTICULATION_DURATION_CHANGE_MS);
    if (delay === null && change === null) continue;
    tally.against((delay ?? 0) - (change ?? 0), millisecondNoteLength);
  }
  return tally.total;
}

function articulationSites(performance: PerformanceView): readonly Element[] {
  const sites: Element[] = [];
  for (const environment of environmentsOf(performance)) {
    for (const styleDef of styleDefsOf(environment, ARTICULATION_STYLE)) {
      sites.push(...styleDef.getChildElements(ARTICULATION_DEF_ELEMENT).toArray());
    }
    const map = environment.maps.get(ARTICULATION_MAP);
    if (map !== undefined) sites.push(...map.getChildElements(ARTICULATION_ELEMENT).toArray());
  }
  return sites;
}

// ---------------------------------------------------------------------------
// §7.9 — the ornament spread cliff
// ---------------------------------------------------------------------------

/**
 * `<temporalSpread>` sites whose frame can drive a note's `duration.perf` negative.
 *
 * The cliff is conditional on `@noteoff.shift`: absent, the whole offset is absorbed by the
 * duration with no floor (SURVEY.md:2588-2590); `"true"` moves the note end with the onset,
 * the safe mode; `"monophonic"` makes a wider frame *lengthen* notes, the opposite sign. Only
 * the absent case is a shortening cliff, so only it is counted.
 *
 * Each bound of the frame is compared **in its own domain**, which in MPM v3 may differ
 * between the two (`frame.offset="-22.0ms" frameLength="80%"` is legal, §7.15). A note's
 * offset is drawn from within `[offset, offset + length]`, so either bound's own magnitude
 * reaching a note's length is enough for the guard to have a note to fire on.
 */
function ornamentSpreadCliffs(
  performance: PerformanceView,
  facts: MsmFacts,
  millisecondNoteLength: number | null,
): number | null {
  const lengths: Readonly<Record<TemporalDomain, number | null>> = {
    // The frame counts PERFORMANCE ticks and the score counts MSM ticks, so the note length
    // is converted to the frame's grid — `performance ÷ msm`, not the other way round. The two
    // are equal in every fixture of this corpus, which is exactly why the direction has to be
    // reasoned about rather than observed.
    ticks: scaleOrNull(shortestNoteInTicks(facts), performancePpq(performance) / facts.ppq),
    milliseconds: millisecondNoteLength,
    relative: RELATIVE_NOTE_LENGTH,
  };

  const tally = new RiskTally();
  for (const spread of temporalSpreads(performance)) {
    if (readAttributeValue(spread, NOTEOFF_SHIFT_ATTRIBUTE) !== null) continue;
    const bounds = frameBounds(spread);
    if (bounds.length === 0) continue;

    const measured: number[] = [];
    for (const bound of bounds) {
      const length = lengths[bound.domain];
      if (length === null) break;
      measured.push(bound.magnitude - length);
    }
    // One unanswerable bound makes the whole site unanswerable: the note could be drawn to
    // either end of the frame, so a verdict from the other bound alone would be a guess.
    if (measured.length < bounds.length) tally.undecidable();
    else tally.count(measured.some((slack) => slack >= 0));
  }
  return tally.total;
}

/** One frame bound: how far it can displace a note, and on which clock it counts. */
interface FrameBound {
  readonly magnitude: number;
  readonly domain: TemporalDomain;
}

/**
 * The frame's two bounds as magnitudes, in whichever generation the element is written in.
 *
 * A bound the element does not carry is not a bound: in v2 an absent one is the neutral 0
 * (§7.9), and in v3 an absent `@frameLength` is `100%` — which the applier refuses to scale
 * at all (§7.15 correction 4), so there is no transformed value here to judge either.
 */
function frameBounds(spread: Element): readonly FrameBound[] {
  const bounds: FrameBound[] = [];
  if (detectFrameFormat(spread) === 'v2') {
    const domain = resolveTemporalDomain('', spread);
    for (const name of [FRAME_START_ATTRIBUTE, FRAME_LENGTH_ATTRIBUTE]) {
      const value = numberOrNull(spread, name);
      if (value !== null) bounds.push({ magnitude: Math.abs(value), domain });
    }
    return bounds;
  }

  const offsetAttribute = v3FrameOffsetAttribute(spread);
  for (const name of offsetAttribute === null
    ? [FRAME_LENGTH_ATTRIBUTE]
    : [offsetAttribute, FRAME_LENGTH_ATTRIBUTE]) {
    const text = readAttributeValue(spread, name);
    const temporal = text === null ? null : parseTemporalText(text);
    if (temporal === null) continue;
    bounds.push({
      magnitude: Math.abs(temporal.value),
      domain: resolveTemporalDomain(temporal.suffix, spread),
    });
  }
  return bounds;
}

function temporalSpreads(performance: PerformanceView): readonly Element[] {
  const spreads: Element[] = [];
  for (const environment of environmentsOf(performance)) {
    for (const styleDef of styleDefsOf(environment, ORNAMENT_STYLE_COLLECTION)) {
      for (const ornamentDef of styleDef.getChildElements(ORNAMENT_DEF_ELEMENT).toArray()) {
        spreads.push(...ornamentDef.getChildElements(TEMPORAL_SPREAD_ELEMENT).toArray());
      }
    }
  }
  return spreads;
}

function performancePpq(performance: PerformanceView): number {
  const declared = numberOrNull(performance.element, 'pulsesPerQuarter');
  return declared !== null && declared > 0 ? declared : DEFAULT_PERFORMANCE_PPQ;
}

function scaleOrNull(value: number | null, factor: number): number | null {
  if (value === null) return null;
  const scaled = value * factor;
  return Number.isFinite(scaled) ? scaled : null;
}

// ---------------------------------------------------------------------------
// §7.13 — the toneduration cliff
// ---------------------------------------------------------------------------

/**
 * Toneduration distributions whose offsets can put a note's end before its start.
 *
 * The domain applies its offset to `@milliseconds.date.end` and to nothing else
 * (ImprecisionMap.ts:416-425), so the guard is reached when the widest value a distribution
 * can draw reaches a note's rendered length — and the same code path skips any note carrying
 * no `@milliseconds.date.end`, which is the second reason a raw score cannot answer this.
 *
 * The magnitude is the largest of the distribution's atomic group (D-F), which is exactly the
 * set the transform scaled together.
 */
function imprecisionDurationCliffs(
  performance: PerformanceView,
  millisecondNoteLength: number | null,
): number | null {
  const mapName = IMPRECISION_DIMENSION_MAPS.imprecisionDuration;
  const tally = new RiskTally();
  if (mapName === undefined) return tally.total;

  for (const environment of environmentsOf(performance)) {
    const map = environment.maps.get(mapName);
    if (map === undefined) continue;
    for (const distribution of map.getChildElements().toArray()) {
      if (!DISTRIBUTION_ELEMENTS.includes(distribution.getLocalName())) continue;
      const widest = widestDrawableValue(distribution);
      if (widest === null) continue;
      tally.against(widest, millisecondNoteLength);
    }
  }
  return tally.total;
}

/**
 * The largest magnitude one distribution can contribute — the maximum over its atomic group,
 * plus the `<measurement>` values of a `distribution.list`, whose whole list is the group.
 */
function widestDrawableValue(distribution: Element): number | null {
  const localName = distribution.getLocalName();
  const magnitudes: number[] = [];

  for (const name of imprecisionGroupAttributes('imprecisionDuration', localName)) {
    const value = numberOrNull(distribution, name);
    if (value !== null) magnitudes.push(Math.abs(value));
  }
  if (localName === DISTRIBUTION_LIST_ELEMENT) {
    for (const measurement of distribution.getChildElements(MEASUREMENT_ELEMENT).toArray()) {
      for (const name of imprecisionGroupAttributes('imprecisionDuration', MEASUREMENT_ELEMENT)) {
        const value = numberOrNull(measurement, name);
        if (value !== null) magnitudes.push(Math.abs(value));
      }
    }
  }

  return magnitudes.length === 0 ? null : Math.max(...magnitudes);
}

// ---------------------------------------------------------------------------
// Shared readers
// ---------------------------------------------------------------------------

function styleDefsOf(environment: MpmEnvironment, collectionName: string): readonly Element[] {
  const collection = environment.styleCollections.get(collectionName);
  return collection === undefined ? [] : collection.getChildElements('styleDef').toArray();
}

/**
 * `parseFloat` of an attribute that must be both present and finite.
 *
 * Absent and unreadable collapse onto the same `null` on purpose: every caller here is asking
 * "is there a magnitude to compare", and a `@limit.upper="wide"` supplies one no more than a
 * missing attribute does.
 */
function numberOrNull(element: Element, name: string): number | null {
  const text = readAttributeValue(element, name);
  if (text === null) return null;
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

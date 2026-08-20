/**
 * The two level dimensions, `tempo` and `dynamics` — DESIGN.md §7.1's center algorithm,
 * §7.2/§7.4's rows, and §1.3's two scopes.
 *
 * They are one module because they are one algorithm with two vocabularies. What separates
 * them from every other dimension is that a level is not a number in the document: it is a
 * *string* that may be a number, a `<tempoDef>`/`<dynamicsDef>` name, or an MEI placeholder,
 * and which of those it is decides **where the transform writes** (D-C: never rewrite a name
 * as a number — that severs the style linkage the def-side transform depends on).
 *
 * ## The order is the specification (A4/A5)
 *
 * 1. **Classify every site and build the skip set.** String levels that resolve to nothing,
 *    def values that are not finite, defs reached from instructions with different
 *    `@beatLength`, values failing their row's domain predicate.
 * 2. **Compute the center over exactly what survived.** Population = every numeric level
 *    attribute on its own element, counted once, plus every def `@value` that a surviving
 *    *prevailing-level* string references, counted once per def element. `@transition.to` is
 *    excluded — it is a target, not a prevailing level.
 * 3. **Transform, validate, write.**
 *
 * Doing 2 before 1 breaks P2 by 26% on a heterogeneous-`@beatLength` document, because the
 * population then contains values at sites the run skips and the center is no longer
 * invariant under the transform. Doing 2 without the dedupe makes the "unweighted" mean
 * silently reference-count-weighted, so a name↔literal refactoring of the same performance
 * changes every number written.
 *
 * ## What `@transition.to` costs and does not cost
 *
 * Excluding it from the population stops a later ritardando target from pulling the center
 * down and thereby speeding up the opening constant tempo. It costs nothing expressively: the
 * log-difference of a pair scales by exactly `s` whatever the center is, so the gesture
 * steepens either way. The exclusion extends to a def that only a `@transition.to` names —
 * §7.1 says "at least one in-scope level string references", and reading that as "including
 * targets" would reintroduce through the def side precisely what the literal side excludes.
 * Such a def is still transformed; it is simply not part of the average.
 *
 * ## Why a def is not always a def
 *
 * `styleScope.findStyleDef` resolves a part's header first and the global one second, as a
 * WHOLE `styleDef` (never a per-def merge). So a part that redeclares `<styleDef name="MEI
 * export">` with a single `<dynamicsDef name="p"/>` shadows the global collection wholesale,
 * and the global `f` is not referenced on that part's account — it must not enter the
 * population on that part's account either. Nothing in this module implements that rule; it
 * falls out of asking `resolveLevel` instead of scanning headers, which is the reason to ask
 * `resolveLevel`.
 */
import { filterMap, groupBy } from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { readAttributeValue, readNumericAttributeValue } from './attributes.js';
import { orderedEntries, styleNameAt, type DatedEntry } from './datedView.js';
import { clampIntoRange, gateAndTransform, writeNumber } from './gate.js';
import { environmentsOf, type MpmEnvironment, type PerformanceView } from './mpmTree.js';
import type { ResolvedOptions } from './options.js';
import {
  LEVEL_ATTRIBUTES,
  LEVEL_DIMENSIONS,
  LEVEL_ELEMENTS,
  LEVEL_MAPS,
  LEVEL_STYLE_COLLECTIONS,
  TEMPO_BEAT_LENGTH_ATTRIBUTE,
  TRANSITION_TO_ATTRIBUTE,
  rowFor,
  type ExpressionDimension,
  type RegistryRow,
} from './registry.js';
import type { DimensionAccumulator, ReportSink } from './report.js';
import { defSiteRef, instructionSiteRef, type SiteRef } from './siteRef.js';
import { resolveLevel, type LevelDomain, type LevelReading } from './styleScope.js';
import { geometricMean } from './transforms.js';

/**
 * The quarter-note normalization of a `<tempo>`: raw `bpm` values with different
 * `@beatLength` are not comparable, so the center is computed on `bpm · beatLength · 4` and
 * each value mapped back through its own factor (§7.2). Four because `@beatLength` is a
 * fraction of a whole note, so a quarter note is 0.25 and the normalizer of a quarter-note
 * bpm is 1 — which is what makes `options.center.tempo` readable as quarter-note bpm.
 */
const QUARTER_NOTES_PER_WHOLE = 4;

/** Dynamics values are already commensurable: velocity units, one scale, no normalization. */
const NO_NORMALIZATION = 1;

/** What the level pass computed, for the performance report's `centers` and `bounds`. */
export interface LevelOutcome {
  readonly center: number | null;
  /** §8's `r`: the largest `max(x/c, c/x)` over the population. Null without a center. */
  readonly deviationRatio: number | null;
}

/** One (attribute, resolution) pair on one instruction. */
interface Endpoint {
  readonly row: RegistryRow;
  readonly attribute: string;
  readonly reading: LevelReading;
  readonly site: SiteRef;
  /** The renderer-space value after the run — the transformed one, or the original. */
  after: number;
  /** The number to write at this *instruction attribute*, or null when the site is a def. */
  write: number | null;
  skipped: boolean;
}

/** One `<tempo>` or `<dynamics>` element, classified. */
interface Instruction {
  readonly environment: MpmEnvironment;
  readonly entry: DatedEntry;
  readonly element: Element;
  /** `beatLength · 4` for tempo, 1 for dynamics. */
  readonly normalization: number;
  readonly level: Endpoint | null;
  readonly target: Endpoint | null;
  /** Set when this instruction is the MEI end-marker duplicate of a preceding transition. */
  duplicateOf: Endpoint | null;
}

/** One `<tempoDef>`/`<dynamicsDef>` reached from at least one in-scope level string. */
interface DefRecord {
  readonly def: Element;
  readonly styleDef: Element;
  readonly value: number;
  readonly site: SiteRef;
  /** Every normalization factor a referencing instruction imposes. More than one ⇒ skip. */
  readonly normalizations: Set<number>;
  /** True once a prevailing-level string (not a `@transition.to`) names it — §7.1. */
  referencedByLevel: boolean;
  skipped: boolean;
  /**
   * The transformed value, computed but NOT yet written (F1).
   *
   * Def writes are deferred until every pair has been checked, because the pair-collapse guard
   * cannot un-write a def: a def is one site shared by every instruction that names it, so
   * flushing it before the guard runs makes the refusal unenforceable on exactly the pairs
   * that need it most.
   */
  pending: number | null;
  /** Set when a refused pair resolves through this def, so the pending write is dropped. */
  refused: boolean;
  /** The renderer-space value after the run. */
  after: number;
}

/**
 * Apply one level dimension to one performance.
 *
 * The returned center is echoed in the report so a caller can pass it back through
 * `options.center` and recover exact composition under clamping (A3) — the one remedy for
 * P2's failure there, and an output rather than a proof.
 */
export function applyLevelDimension(
  domain: LevelDomain,
  performance: PerformanceView,
  factor: number,
  options: ResolvedOptions,
  sink: ReportSink,
): LevelOutcome {
  return new LevelPass(domain, performance, factor, options, sink).run();
}

/**
 * One (performance, level dimension) pass.
 *
 * A class rather than a chain of functions because the three phases share eight pieces of
 * state — the rows, the def records keyed by element identity, the accumulator, the
 * normalization rule — and threading those through the phase boundaries as parameters made
 * every signature longer than the body it introduced.
 */
class LevelPass {
  private readonly dimension: ExpressionDimension;
  private readonly accumulator: DimensionAccumulator;
  private readonly mapName: string;
  private readonly elementName: string;
  private readonly levelAttribute: string;
  private readonly levelRow: RegistryRow;
  private readonly targetRow: RegistryRow;
  private readonly defRow: RegistryRow;
  private readonly defs = new Map<Element, DefRecord>();
  private readonly instructions: Instruction[] = [];

  constructor(
    private readonly domain: LevelDomain,
    private readonly performance: PerformanceView,
    private readonly factor: number,
    private readonly options: ResolvedOptions,
    private readonly sink: ReportSink,
  ) {
    this.dimension = LEVEL_DIMENSIONS[domain];
    this.accumulator = sink.dimensions[this.dimension];
    this.mapName = LEVEL_MAPS[domain];
    this.elementName = LEVEL_ELEMENTS[domain];
    this.levelAttribute = LEVEL_ATTRIBUTES[domain];

    const levelRow = rowFor(this.elementName, this.levelAttribute);
    const targetRow = rowFor(this.elementName, TRANSITION_TO_ATTRIBUTE);
    const defRow = rowFor(`${domain}Def`, 'value');
    // A registry missing these is a programmer error, not a document condition.
    if (levelRow === null || targetRow === null || defRow === null) {
      throw new Error(`the registry has no ${domain} level rows`);
    }
    this.levelRow = levelRow;
    this.targetRow = targetRow;
    this.defRow = defRow;
  }

  run(): LevelOutcome {
    this.classify();
    this.gateDefs();

    // A document with no map of this kind has nothing to say about the dimension, and asking
    // for a center would produce a `no-center` note about a dimension that is simply `absent`.
    if (this.instructions.length === 0 && this.defs.size === 0) {
      return { center: null, deviationRatio: null };
    }

    if (this.options.scope === 'gesture') {
      // §1.3: gesture scope has no performance-wide center at all — each pair is scaled around
      // its own geometric mean, and constants and def values are untouched.
      this.applyGestureScope();
      return { center: null, deviationRatio: null };
    }

    const population = this.buildPopulation();
    const center = this.options.center[this.domain] ?? this.centerOf(population);
    if (center === null) {
      // R-W2-5/#10: an empty population is a REFUSAL from `geometricMean`, and the dimension's
      // verdict for this performance is `inert` — the levels resolved to nothing a center could
      // be built from, so no `s` could have moved them. It is not a per-site failure, even
      // though the unresolvable levels that emptied the population were counted as skips.
      this.accumulator.declareNoCenter();
      this.inertEveryEndpoint();
      return { center: null, deviationRatio: null };
    }

    this.transformAndWrite(center);
    this.reportMergedLevels();
    return { center, deviationRatio: deviationRatioOf(population, center) };
  }

  // --- Phase 1: classify every site, building the skip set (A4/A5) ------------------------

  private classify(): void {
    for (const environment of environmentsOf(this.performance)) {
      const map = environment.maps.get(this.mapName);
      if (map === undefined) continue;
      const entries = orderedEntries(map);
      for (const [viewIndex, entry] of entries.entries()) {
        if (entry.element.getLocalName() !== this.elementName) continue;
        this.accumulator.markPresent();
        this.classifyInstruction(environment, entries, viewIndex, entry);
      }
    }
  }

  private classifyInstruction(
    environment: MpmEnvironment,
    entries: readonly DatedEntry[],
    viewIndex: number,
    entry: DatedEntry,
  ): void {
    const normalization = this.normalizationOf(entry.element);
    if (normalization === null) {
      // §7.2: the renderer skips a `<tempo>` without `@beatLength` entirely, so every
      // attribute on it is inert — including its transition target.
      this.accumulator.countInert();
      this.sink.note(
        'missing-beat-length',
        this.dimension,
        instructionSiteRef(environment, this.mapName, entry, TEMPO_BEAT_LENGTH_ATTRIBUTE),
        'the renderer skips a <tempo> without @beatLength entirely',
      );
      return;
    }
    if (!Number.isFinite(normalization) || normalization <= 0) {
      this.accumulator.countSkipped();
      this.sink.note(
        'out-of-domain-input',
        this.dimension,
        instructionSiteRef(environment, this.mapName, entry, TEMPO_BEAT_LENGTH_ATTRIBUTE),
        `@beatLength must be positive and finite; its normalizer came out as ${normalization}`,
      );
      return;
    }

    const styleName = styleNameAt(entries, viewIndex);
    const level = this.classifyEndpoint(
      this.levelRow,
      this.levelAttribute,
      environment,
      entry,
      styleName,
      normalization,
      true,
    );
    const target = this.classifyEndpoint(
      this.targetRow,
      TRANSITION_TO_ATTRIBUTE,
      environment,
      entry,
      styleName,
      normalization,
      false,
    );
    if (level === null && target === null) return;
    this.instructions.push({
      environment,
      entry,
      element: entry.element,
      normalization,
      level,
      target,
      duplicateOf: null,
    });
  }

  /** Seven parameters, all of them one site's own coordinates: the row it belongs to, where it
   *  sits, and whether it is the prevailing level (§7.1's population) or the target. */
  private classifyEndpoint(
    row: RegistryRow,
    attribute: string,
    environment: MpmEnvironment,
    entry: DatedEntry,
    styleName: string | null,
    normalization: number,
    isPrevailingLevel: boolean,
  ): Endpoint | null {
    const raw = readAttributeValue(entry.element, attribute);
    if (raw === null) return null;

    const site = instructionSiteRef(environment, this.mapName, entry, attribute);
    const reading = resolveLevel(raw, this.domain, styleName, environment, this.performance.global);
    const endpoint: Endpoint = {
      row,
      attribute,
      reading,
      site,
      after: reading.value,
      write: null,
      skipped: false,
    };

    if (reading.kind === 'unresolvable') {
      // §7.2: MEI's '+', '-' and '?' placeholders and every unresolvable name land here. The
      // renderer's 100.0 fallback is deliberately NOT reproduced — it is a rendering default,
      // not a reading of the document, and it must never become a center member.
      endpoint.skipped = true;
      this.accumulator.countSkipped();
      this.sink.note(
        'unresolvable-level',
        this.dimension,
        site,
        `${JSON.stringify(raw)} is neither a number nor a def name in scope`,
      );
      return endpoint;
    }

    if (reading.kind === 'def') {
      const record = this.defs.get(reading.def) ?? this.newDefRecord(reading);
      this.defs.set(reading.def, record);
      record.normalizations.add(normalization);
      if (isPrevailingLevel) record.referencedByLevel = true;
      return endpoint;
    }

    // §1.2's gate is applied to the value the transform will actually see — the NORMALIZED one
    // (F11). Gating the raw value instead lets a `<tempo>` whose bpm and beatLength are each
    // finite and positive but whose product underflows enter the population un-gated, where
    // `geometricMean` refuses it and the whole dimension goes inert without the offending site
    // ever being named. §7.1's invariant is that the population IS the transform set.
    const gated = reading.value * normalization;
    if (!row.valueDomain(gated)) {
      endpoint.skipped = true;
      this.accumulator.countSkipped();
      this.sink.note(
        'out-of-domain-input',
        this.dimension,
        site,
        `@${attribute} = ${reading.value}${
          normalization === NO_NORMALIZATION ? '' : ` (normalized: ${gated})`
        } is outside the domain §7 gives it`,
      );
    }
    return endpoint;
  }

  private newDefRecord(reading: Extract<LevelReading, { kind: 'def' }>): DefRecord {
    return {
      def: reading.def,
      styleDef: reading.styleDef,
      value: reading.value,
      site: defSiteRef(
        reading.environment,
        LEVEL_STYLE_COLLECTIONS[this.domain],
        reading.styleDef,
        reading.def,
        'value',
      ),
      normalizations: new Set<number>(),
      referencedByLevel: false,
      skipped: false,
      pending: null,
      refused: false,
      after: reading.value,
    };
  }

  /** `beatLength · 4` for tempo, 1 for dynamics; null when a `<tempo>` has no `@beatLength`. */
  private normalizationOf(element: Element): number | null {
    if (this.domain === 'dynamics') return NO_NORMALIZATION;
    if (readAttributeValue(element, TEMPO_BEAT_LENGTH_ATTRIBUTE) === null) return null;
    return (
      readNumericAttributeValue(element, TEMPO_BEAT_LENGTH_ATTRIBUTE) * QUARTER_NOTES_PER_WHOLE
    );
  }

  /**
   * The def half of the skip set: a value the gate rejects, and a def with no single
   * normalization factor.
   *
   * The second is §7.2's heterogeneous-`@beatLength` rule and it is not defensive: a
   * `tempoDef` borrows the referencing instruction's `@beatLength`, so a def named from a
   * half-note tempo and from a quarter-note one has two different quarter-note values and no
   * single one to transform. The first is what LOG W2 finding 4 warned about —
   * `parseJavaDouble` accepts Java's `NaN` and `Infinity` literals, so a `LevelReading` of
   * kind `def` does NOT imply a finite value and the gate has to say so.
   */
  private gateDefs(): void {
    for (const record of this.defs.values()) {
      this.accumulator.markPresent();
      if (record.normalizations.size > 1) {
        record.skipped = true;
        this.accumulator.countSkipped();
        this.sink.note(
          'heterogeneous-beat-length',
          this.dimension,
          record.site,
          'referenced from instructions whose @beatLength normalizers are ' +
            `${[...record.normalizations].join(', ')} — no single quarter-note value exists`,
        );
        continue;
      }
      const normalization = onlyNormalization(record);
      const gated = record.value * normalization;
      if (!this.defRow.valueDomain(gated)) {
        record.skipped = true;
        this.accumulator.countSkipped();
        this.sink.note(
          'out-of-domain-input',
          this.dimension,
          record.site,
          `@value = ${record.value}${
            normalization === NO_NORMALIZATION ? '' : ` (normalized: ${gated})`
          } is outside the domain §7 gives it`,
        );
      }
    }
  }

  // --- Phase 2: the center, over exactly the surviving population (§7.1) ------------------

  private buildPopulation(): readonly number[] {
    const population: number[] = [];
    for (const instruction of this.instructions) {
      const level = instruction.level;
      if (level === null || level.skipped) continue;
      if (!level.row.inCenterPopulation) continue;
      if (level.reading.kind !== 'literal') continue;
      population.push(level.reading.value * instruction.normalization);
    }
    for (const record of this.defs.values()) {
      if (record.skipped || !record.referencedByLevel) continue;
      population.push(record.value * onlyNormalization(record));
    }
    return population;
  }

  private centerOf(population: readonly number[]): number | null {
    const mean = geometricMean(population);
    if (mean.ok) return mean.value;
    this.sink.note(
      'no-center',
      this.dimension,
      null,
      population.length === 0
        ? 'the surviving level population is empty, so this dimension has no center'
        : `the level population has no geometric mean (${mean.error})`,
    );
    return null;
  }

  /**
   * Mark the endpoints that survived classification as inert, because the dimension has no
   * center to transform them around.
   *
   * `inert` rather than `skipped`: nothing is wrong with a `@transition.to` of 90 whose map's
   * prevailing levels are all placeholders. It is simply unreachable — the same distinction
   * §7.5 draws between "the document does not use curvature" and "the document uses curvature
   * where it does nothing".
   */
  private inertEveryEndpoint(): void {
    for (const instruction of this.instructions) {
      for (const endpoint of endpointsOf(instruction)) {
        if (endpoint.skipped) continue;
        endpoint.skipped = true;
        this.accumulator.countInert();
      }
    }
  }

  // --- Phase 3: transform, validate, write -------------------------------------------------

  /**
   * Plan every write, settle the refusals, and only then touch the document (F1).
   *
   * The order is the fix for the blocker. A def `@value` is ONE site shared by every
   * instruction that names it, so a def write flushed before the pair-collapse guard has run
   * cannot be taken back — and the guard would then suppress only the instruction-attribute
   * half of a collapsing pair, writing exactly the half-applied gesture it exists to prevent.
   * On the §8 reference fixture that is not hypothetical: at `s = 1.766`, just above §8's own
   * dynamics sampling ceiling, an authored `f → 115` crescendo became a `127 → 115`
   * diminuendo while the report claimed the pair was refused.
   */
  private transformAndWrite(center: number): void {
    this.planDefs(center);
    this.planInstructions(center);
    this.settleRefusals();
    this.flushDefs();
    this.flushInstructions();
  }

  private planDefs(center: number): void {
    for (const record of this.defs.values()) {
      if (record.skipped) continue;
      const normalization = onlyNormalization(record);
      const transformed = gateAndTransform(
        this.defRow,
        { kind: 'log-around-center', center },
        record.value * normalization,
        this.factor,
      );
      if (!transformed.ok) {
        record.skipped = true;
        this.accumulator.countSkipped();
        this.sink.note(
          transformed.error.kind,
          this.dimension,
          record.site,
          transformed.error.detail,
        );
        continue;
      }
      const clamped = this.clamp(transformed.value / normalization, record.site);
      record.after = clamped;
      record.pending = clamped;
    }
  }

  private planInstructions(center: number): void {
    const space = { kind: 'log-around-center', center } as const;
    for (const instruction of this.instructions) {
      for (const endpoint of endpointsOf(instruction)) {
        if (endpoint.skipped) continue;
        if (endpoint.reading.kind === 'def') {
          // D-C: the def's `@value` is the site; the instruction attribute holds a NAME, and
          // rewriting it as a number would sever the linkage the def-side write depends on.
          const record = this.defs.get(endpoint.reading.def);
          endpoint.after = record?.after ?? endpoint.reading.value;
          if (record === undefined || record.skipped) endpoint.skipped = true;
          continue;
        }
        const normalized = endpoint.reading.value * instruction.normalization;
        const transformed = gateAndTransform(endpoint.row, space, normalized, this.factor);
        if (!transformed.ok) {
          endpoint.skipped = true;
          this.accumulator.countSkipped();
          this.sink.note(
            transformed.error.kind,
            this.dimension,
            endpoint.site,
            transformed.error.detail,
          );
          continue;
        }
        const clamped = this.clamp(transformed.value / instruction.normalization, endpoint.site);
        endpoint.after = clamped;
        endpoint.write = clamped;
      }
    }
  }

  /**
   * The pair-collapse guard, and the closure that makes it enforceable.
   *
   * `transitionTo === bpm` is the renderer's own exact-float test for "this instruction is a
   * constant", so a transformed pair whose endpoints land on one value does not become a
   * subtle gesture — it becomes no gesture at all. The refusal therefore covers BOTH endpoints
   * whichever site holds them, which for a named endpoint means dropping the def's pending
   * write.
   *
   * Dropping a def write has a consequence the guard has to carry: every OTHER pair resolving
   * through that def would now move one endpoint against a level that stands still. So the
   * refusal propagates to those pairs, and to any further def they name, until nothing changes.
   * The set only ever grows and is bounded by the def count, so the loop terminates.
   */
  private settleRefusals(): void {
    const refusedDefs = new Set<Element>();
    const refusedPairs = new Set<Instruction>();

    const refuse = (instruction: Instruction, site: SiteRef, detail: string): void => {
      refusedPairs.add(instruction);
      for (const endpoint of endpointsOf(instruction)) endpoint.skipped = true;
      this.accumulator.countSkipped();
      this.sink.note('pair-collapse-refused', this.dimension, site, detail);
      for (const def of defsNamedBy(instruction)) refusedDefs.add(def);
    };

    for (const instruction of this.instructions) {
      const { level, target } = instruction;
      if (level === null || target === null || level.skipped || target.skipped) continue;
      // A pair that was ALREADY constant on input is not a collapse: its endpoints move
      // together and stay equal, which is what a constant should do.
      if (level.reading.value === target.reading.value) continue;
      if (level.after !== target.after) continue;
      refuse(
        instruction,
        target.site,
        `the transformed pair lands on ${target.after} at both endpoints, which is the ` +
          "renderer's exact-float test for a constant instruction — the gesture would be " +
          'deleted rather than scaled',
      );
    }

    for (let changed = true; changed;) {
      changed = false;
      for (const instruction of this.instructions) {
        if (refusedPairs.has(instruction)) continue;
        const { level, target } = instruction;
        if (level === null || target === null || level.skipped || target.skipped) continue;
        if (!defsNamedBy(instruction).some((def) => refusedDefs.has(def))) continue;
        refuse(
          instruction,
          level.site,
          'a def this pair resolves through will not be written, because another pair ' +
            'resolving through it was refused — moving this endpoint alone would leave this ' +
            'gesture half applied too',
        );
        changed = true;
      }
    }

    for (const record of this.defs.values()) {
      if (refusedDefs.has(record.def)) record.refused = true;
    }
  }

  private flushDefs(): void {
    for (const record of this.defs.values()) {
      if (record.skipped) continue;
      if (record.refused) {
        // The document keeps the authored value, so the report must say the level did not move.
        record.after = record.value;
        this.accumulator.countSkipped();
        this.sink.note(
          'pair-collapse-refused',
          this.dimension,
          record.site,
          'not written: a transition pair resolving through this def was refused, and moving ' +
            'the def alone would leave that gesture half applied',
        );
        continue;
      }
      if (record.pending === null) continue;
      const outcome = writeNumber(record.def, 'value', record.pending);
      this.accumulator.countTransformed(outcome === 'written' ? 1 : 0);
    }
  }

  private flushInstructions(): void {
    for (const instruction of this.instructions) {
      for (const endpoint of endpointsOf(instruction)) {
        if (endpoint.skipped || endpoint.write === null) continue;
        const outcome = writeNumber(instruction.element, endpoint.attribute, endpoint.write);
        this.accumulator.countTransformed(outcome === 'written' ? 1 : 0);
      }
    }
  }

  /**
   * The gesture-scope commit: the same guard, but nothing is deferred.
   *
   * Under gesture scope def values are untouched by construction (§1.3), so both endpoints of
   * every pair the engine writes are instruction attributes and the refusal is enforceable
   * immediately — the deferral F1 requires under global scope has nothing to defer here.
   *
   * @returns false when the guard refused the pair — the caller's cue that nothing downstream
   *   of this transition endpoint (the end-marker duplicate) may move either.
   */
  private commitGesturePair(instruction: Instruction): boolean {
    const { level, target } = instruction;
    let refused = false;
    if (level !== null && target !== null && !level.skipped && !target.skipped) {
      const wasGesture = level.reading.value !== target.reading.value;
      if (wasGesture && level.after === target.after) {
        refused = true;
        level.skipped = true;
        target.skipped = true;
        this.accumulator.countSkipped();
        this.sink.note(
          'pair-collapse-refused',
          this.dimension,
          target.site,
          `the transformed pair lands on ${target.after} at both endpoints, which is the ` +
            "renderer's exact-float test for a constant instruction — the gesture would be " +
            'deleted rather than scaled',
        );
      }
    }
    for (const endpoint of endpointsOf(instruction)) {
      if (endpoint.skipped || endpoint.write === null) continue;
      const outcome = writeNumber(instruction.element, endpoint.attribute, endpoint.write);
      this.accumulator.countTransformed(outcome === 'written' ? 1 : 0);
    }
    return !refused;
  }

  /**
   * R6(a) clamps the dynamics LEVEL attributes and nothing else: tempo has no musical ceiling
   * the MPM can name, and inventing one would be the magic constant C2 forbids.
   */
  private clamp(value: number, site: SiteRef): number {
    if (this.domain !== 'dynamics') return value;
    const { value: clamped, clamped: bit } = clampIntoRange(value, this.options.velocityRange);
    if (bit) {
      this.accumulator.countClamp();
      this.sink.note(
        'clamped',
        this.dimension,
        site,
        `${value} clamped into ` +
          `[${this.options.velocityRange.min}, ${this.options.velocityRange.max}]`,
      );
    }
    return clamped;
  }

  /**
   * §7.4 — the clamp bites only at the top, so two adjacent named levels converge and can
   * become identical: on the reference fixture both `f` and `ff` reach the ceiling at
   * `s ≈ 4`, after which every note marked `f` and every note marked `ff` renders at one
   * velocity. The exaggeration would DESTROY a dynamic distinction rather than widen it, so
   * the report names the collapsed pair and a caller can reject the sample.
   */
  private reportMergedLevels(): void {
    // Drop the skipped records, then bucket what is left by the `<styleDef>` they live in —
    // `filterMap` and `groupBy`, where the loop this replaces did both at once and re-`set`
    // the bucket on every element where `groupBy` sets it once. Encounter order inside each
    // bucket is what makes the pair walk below "every unordered pair, once, in encounter
    // order", and `groupBy` guarantees it.
    const byStyleDef = groupBy(
      filterMap(this.defs.values(), (record) => (record.skipped ? null : record)),
      (record) => record.styleDef,
    );
    for (const siblings of byStyleDef.values()) {
      // Every unordered pair, once, in encounter order. Written as `entries()` over the outer
      // element and a `slice` for the tail rather than two index counters, because indices are
      // the only thing the old spelling needed them for and an indexed read is a bound the
      // reader has to re-prove. A sibling group is one style def's worth of level names, so
      // the slice per outer step is bounded by a handful of elements.
      for (const [i, first] of siblings.entries()) {
        for (const second of siblings.slice(i + 1)) {
          if (first.value === second.value || first.after !== second.after) continue;
          const firstName = readAttributeValue(first.def, 'name') ?? '';
          const secondName = readAttributeValue(second.def, 'name') ?? '';
          this.sink.mergeLevels(firstName, secondName);
          this.sink.note(
            'merged-levels',
            this.dimension,
            second.site,
            `${JSON.stringify(firstName)} and ${JSON.stringify(secondName)} both became ` +
              `${second.after}: the transform destroyed a dynamic distinction rather than ` +
              'widening it',
          );
        }
      }
    }
  }

  // --- Gesture scope (§1.3, A7, D-I) -------------------------------------------------------

  /**
   * `gesture` scope: each transition pair is scaled around its OWN geometric mean, constants
   * and def values are untouched.
   *
   * This is the scope `spotlight` needs, and the reason it exists is arithmetic rather than
   * taste: under `global` an attenuation pulls every level toward the performance-wide
   * center, so unselected *quiet* material is re-levelled LOUDER — a `p` at 48 in a
   * {48,48,97} map renders at 59.3 under attenuation 0.1, the inverse of "damp the
   * background".
   *
   * A pair with a def-valued endpoint has no writable site here (defs are untouched and D-C
   * forbids rewriting a name as a number), so it is refused and reported rather than half
   * applied.
   */
  private applyGestureScope(): void {
    for (const record of this.defs.values()) {
      if (record.skipped) continue;
      this.accumulator.countInert();
      this.sink.note(
        'untouched-in-gesture',
        this.dimension,
        record.site,
        'gesture scope scales transition pairs around their own geomean; def values do not move',
      );
    }

    this.markEndMarkerDuplicates();

    for (const instruction of this.instructions) {
      if (instruction.duplicateOf !== null) continue;
      this.applyGesturePair(instruction);
    }
  }

  private applyGesturePair(instruction: Instruction): void {
    const { level, target } = instruction;
    if (level === null || level.skipped) return;

    if (target === null || target.skipped || level.reading.value === target.reading.value) {
      this.accumulator.countInert();
      this.sink.note(
        'constant-instruction',
        this.dimension,
        level.site,
        target === null || target.skipped
          ? 'a piecewise-constant instruction has no gesture for gesture scope to scale'
          : `both endpoints resolve to ${level.reading.value}, which the renderer reads as a ` +
              'constant instruction',
      );
      return;
    }
    if (level.reading.kind === 'def' || target.reading.kind === 'def') {
      this.accumulator.countSkipped();
      this.sink.note(
        'unwritable-level-site',
        this.dimension,
        level.reading.kind === 'def' ? level.site : target.site,
        'a named endpoint has no writable site under gesture scope: defs are untouched, and ' +
          'rewriting a name as a number would sever the style linkage (D-C)',
      );
      return;
    }

    const pairCenter = geometricMean([
      level.reading.value * instruction.normalization,
      target.reading.value * instruction.normalization,
    ]);
    if (!pairCenter.ok) {
      this.accumulator.countSkipped();
      this.sink.note(
        'out-of-domain-input',
        this.dimension,
        level.site,
        `the pair has no geometric mean (${pairCenter.error})`,
      );
      return;
    }

    const space = { kind: 'log-around-center', center: pairCenter.value } as const;
    for (const endpoint of [level, target]) {
      const transformed = gateAndTransform(
        endpoint.row,
        space,
        endpoint.reading.value * instruction.normalization,
        this.factor,
      );
      if (!transformed.ok) {
        level.skipped = true;
        target.skipped = true;
        this.accumulator.countSkipped();
        this.sink.note(
          transformed.error.kind,
          this.dimension,
          endpoint.site,
          transformed.error.detail,
        );
        return;
      }
      const clamped = this.clamp(transformed.value / instruction.normalization, endpoint.site);
      endpoint.after = clamped;
      endpoint.write = clamped;
    }
    if (this.commitGesturePair(instruction)) this.moveEndMarkerDuplicate(instruction, target);
  }

  /**
   * §7.2/A7/D-I — the MEI end-marker duplicate.
   *
   * MEI exports a `<dynamics>` transition and then repeats its `@transition.to` as the *level*
   * of the next instruction, so one musical value is written at two sites: once as the
   * gesture's endpoint and once as the following section's prevailing level. They are not
   * independent levers, so moving the second with the first does not violate D-C's one-site
   * rule — and leaving it behind would put a discontinuity where the document had none.
   *
   * Detection is the conjunction §7.2 states and nothing looser: the *next* instruction in the
   * date-stable view, in the same environment, at a strictly later date, constant, and
   * resolving to exactly the transition's target value in the same normalized space.
   */
  private markEndMarkerDuplicates(): void {
    for (const [index, instruction] of this.instructions.entries()) {
      const target = instruction.target;
      if (target === null || target.skipped) continue;
      const next = this.instructions.at(index + 1);
      if (next === undefined || next.environment !== instruction.environment) continue;
      if (!(next.entry.date > instruction.entry.date)) continue;
      if (next.level === null || next.level.skipped) continue;
      if (next.target !== null && next.target.reading.value !== next.level.reading.value) continue;
      const targetValue = target.reading.value * instruction.normalization;
      if (targetValue !== next.level.reading.value * next.normalization) continue;
      next.duplicateOf = target;
    }
  }

  private moveEndMarkerDuplicate(transition: Instruction, target: Endpoint): void {
    const duplicate = this.instructions.find((candidate) => candidate.duplicateOf === target);
    const level = duplicate?.level;
    if (duplicate === undefined || level == null) return;

    if (level.reading.kind === 'def') {
      this.accumulator.countSkipped();
      this.sink.note(
        'unwritable-level-site',
        this.dimension,
        level.site,
        'the end-marker duplicate resolves through a def, which gesture scope leaves ' +
          'untouched, so it cannot follow its transition endpoint',
      );
      return;
    }

    // F2: the duplicate is DETECTED in quarter-note space, so it must be WRITTEN there too.
    // `target.after` has already been divided by the TRANSITION's own `@beatLength`; writing it
    // straight into the duplicate's `@bpm` is correct only where the two instructions share a
    // beat unit. Where they do not — a quarter-note transition followed by a half-note marker —
    // the mechanism whose entire purpose is "one musical value at two sites" would write two
    // values a factor apart, moving in opposite directions.
    const shared = target.after * transition.normalization;
    const moved = shared / duplicate.normalization;
    if (!Number.isFinite(moved)) return;

    level.after = moved;
    const outcome = writeNumber(duplicate.element, level.attribute, moved);
    this.accumulator.countTransformed(outcome === 'written' ? 1 : 0);
    this.sink.note(
      'end-marker-moved',
      this.dimension,
      level.site,
      `moved with its transition endpoint to ${moved}${
        duplicate.normalization === transition.normalization
          ? ''
          : ` (${shared} quarter-note bpm, re-expressed in this instruction's own beat unit)`
      }: the MEI export writes one musical value at two sites, and they are not ` +
        `independent levers`,
    );
  }
}

/** The `<tempoDef>`/`<dynamicsDef>` elements an instruction's endpoints resolve through. */
function defsNamedBy(instruction: Instruction): readonly Element[] {
  // The `kind === 'def'` test is the narrowing as well as the filter, which is exactly what
  // `filterMap` is for: `endpoint.reading.def` is only a field on that arm.
  return filterMap(endpointsOf(instruction), (endpoint) =>
    endpoint.reading.kind === 'def' ? endpoint.reading.def : null,
  );
}

function endpointsOf(instruction: Instruction): readonly Endpoint[] {
  return [instruction.level, instruction.target].filter(
    (endpoint): endpoint is Endpoint => endpoint !== null,
  );
}

/** A surviving def has exactly one normalization factor — `gateDefs` skipped the rest. */
function onlyNormalization(record: DefRecord): number {
  for (const normalization of record.normalizations) return normalization;
  return NO_NORMALIZATION;
}

/** §8's `r`, the document-side input a caller completes the tempo bound formula with. */
function deviationRatioOf(population: readonly number[], center: number): number | null {
  let ratio: number | null = null;
  for (const value of population) {
    const deviation = Math.max(value / center, center / value);
    if (!Number.isFinite(deviation)) continue;
    ratio = ratio === null ? deviation : Math.max(ratio, deviation);
  }
  return ratio;
}

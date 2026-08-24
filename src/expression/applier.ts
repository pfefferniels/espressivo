/**
 * The engine: the fifteen dimensions applied to a raw MPM tree, in place, with a
 * report of everything that happened.
 *
 * `applyExaggeration` is a DOCUMENT transform: with no `options.performance` it visits
 * every `<performance>`, unlike `performMsm`, which renders and so needs exactly one. Editing
 * one performance and leaving its siblings behind would mean something different from either
 * input.
 *
 * Per dimension the order is: classify every site and build the skip set, then compute anything
 * that averages over sites, then transform, validate and write. Only the two level
 * dimensions average, and `levels.ts` carries that; the ordering is what makes two rules true
 * for all fifteen — nothing written is derived from a value the run also skipped, and no site
 * is skipped for a reason the report does not name.
 *
 * A dimension whose factor is 1 is not walked at all. Not because the transforms would be
 * wrong — they return the input bit for bit at `s = 1` — but because the *write* would be: an
 * attribute reading `"1.0"` transforms to the number 1 and spells back as `"1"`, a byte change
 * with no numeric change. So P1's identity guarantee lives at the dimension level, and such a
 * dimension is reported `skipped` with an `identity-factor` note rather than `absent`.
 *
 * The engine never creates an attribute, never deletes one, never reorders children, never
 * writes a non-finite value, and never repairs an out-of-domain input. `gate.ts` states the
 * write rules; reordering is what `GenericMap.sortXml` does and the raw-tree discipline exists
 * to avoid it, and "repairing" `curvature="1.5"` edits a value the caller never
 * asked to change.
 */
import {
  andThen,
  err,
  filterMap,
  fromEntriesExact,
  head,
  isNonEmpty,
  mapErr,
  mapOk,
  ok,
  traverse,
  unwrapOrElse,
  type Result,
} from '../prelude/index.js';
import type { Element } from '../xml/XomTypes.js';
import { readAttributeValue, readNumericAttributeValue } from './attributes.js';
import { orderedEntries, styleNameAt, type DatedEntry } from './datedView.js';
import { gateAndTransform, writeNumber, writeSuffixedNumber } from './gate.js';
import { applyLevelDimension } from './levels.js';
import {
  environmentsOf,
  readPerformances,
  type MpmEnvironment,
  type PerformanceView,
} from './mpmTree.js';
import {
  IDENTITY_FACTOR,
  resolveRun,
  type ExaggerateOptions,
  type ResolvedOptions,
  type ResolvedRun,
} from './options.js';
import {
  ACCENTUATION_ANCHOR_ELEMENT,
  ACCENTUATION_DEF_ELEMENT,
  ACCENTUATION_STYLE_COLLECTION,
  DISTRIBUTION_ELEMENTS,
  DISTRIBUTION_LIST_ELEMENT,
  DYNAMICS_GRADIENT_ELEMENT,
  EXCLUDED_ARTICULATION_LEVERS,
  EXPRESSION_DIMENSIONS,
  FRAME_LENGTH_ATTRIBUTE,
  FRAME_OFFSET_ATTRIBUTE,
  FRAME_START_ATTRIBUTE,
  FRAME_TIME_UNIT_ATTRIBUTE,
  IMPRECISION_DIMENSION_MAPS,
  INERT_IMPRECISION_MAP,
  INLINE_DURATION_PRECEDENCE,
  LEVEL_ATTRIBUTES,
  LEVEL_MAPS,
  LOOP_ATTRIBUTE,
  MEASUREMENT_ELEMENT,
  NOTEOFF_SHIFT_ATTRIBUTE,
  ORNAMENT_DEF_ELEMENT,
  ORNAMENT_MAP,
  ORNAMENT_SCALE_ATTRIBUTE,
  ORNAMENT_STYLE_COLLECTION,
  RUBATO_DEF_ELEMENT,
  RUBATO_STYLE_COLLECTION,
  STICK_TO_MEASURES_ATTRIBUTE,
  SUB_NOTE_DYNAMICS_ATTRIBUTE,
  TEMPORAL_SPREAD_ELEMENT,
  TEMPO_BEAT_LENGTH_ATTRIBUTE,
  TIMING_BASIS_ATTRIBUTE,
  TRANSITION_TO_ATTRIBUTE,
  bindRowSpace,
  imprecisionGroupAttributes,
  rowFor,
  rowForIn,
  rowsOf,
  type ExaggerationFactors,
  type ExpressionDimension,
  type RegistryRow,
} from './registry.js';
import {
  ReportSink,
  estimatesWithoutMsm,
  finishDimension,
  type ExaggerationReport,
  type PerformanceBounds,
  type PerformanceReport,
} from './report.js';
import { defContainerLabel, instructionSiteRef, siteRefOf, type SiteRef } from './siteRef.js';
import { findStyleDef, resolveLevel, type LevelDomain } from './styleScope.js';
import {
  detectFrameFormat,
  parseTemporalText,
  resolveTemporalDomain,
  v3FrameOffsetAttribute,
  type FrameFormat,
  type TemporalSuffix,
} from './temporalValue.js';
import { jointTrimWindow, type ScaleSpace } from './transforms.js';
import {
  ARTICULATION_MAP,
  ARTICULATION_STYLE,
  ASYNCHRONY_MAP,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  RUBATO_MAP,
} from '../mpm/names.js';

/** The two level maps the shape dimensions read alongside `levels.ts`. */
const TEMPO_MAP = LEVEL_MAPS.tempo;
const DYNAMICS_MAP = LEVEL_MAPS.dynamics;

/**
 * The level the RENDERER invents when a level string resolves to nothing — `getNumericBpmValue`
 * and `getNumericValue` both fall through to it after a `console.error`.
 *
 * Used for ONE purpose: deciding whether the renderer sees an instruction as constant.
 * the design keeps it out of the center population — a rendering default is not a reading of the
 * document, and averaging it in would move every level the author did write.
 */
const RENDERER_UNRESOLVED_LEVEL = 100;

/** `@scale` absent is exactly `@scale = 0` — the multiply-to-zero quirk. */
const ABSENT_ORNAMENT_SCALE = 0;

/** The neutral of a rubato window's head trim, and of its tail (`1 − earlyEnd`). */
const RUBATO_NEUTRAL_LATE_START = 0;
const RUBATO_NEUTRAL_EARLY_END = 1;

/** the gain neutral, against which an inline `@absoluteDurationChange` counts as set. */
const GAIN_NEUTRAL = 0;

/**
 * Apply the factors to every performance of `root`, in place.
 *
 * @param root the `<mpm>` element of a tree parsed by `mpmDocument.parseMpmRoot`. Mutated.
 * @param factors the record; a missing key is 1 is identity. An unknown key, a non-finite
 *   value, or a value outside its dimension's admissible s-domain is a programmer error and
 *   throws — the facade turns those into `InvalidOptionError`.
 * @param options the options; see `options.ts` for the two numeric defaults.
 */
export function applyExaggeration(
  root: Element,
  factors: ExaggerationFactors,
  options: ExaggerateOptions = {},
): ExaggerationReport {
  return applyResolvedExaggeration(
    root,
    unwrapOrElse(resolveRun(factors, options), (refusal): never => {
      throw new Error(refusal);
    }),
  );
}

/**
 * {@link applyExaggeration} on options the caller has ALREADY resolved.
 *
 * The entry point the facade uses, so that the option bag is resolved once: the design makes the
 * facade validate before a byte is parsed, and `options.ts` owns the one definition of what a
 * legal factor record is.
 *
 * @param run everything the design defines, filled in — see {@link resolveRun}
 */
export function applyResolvedExaggeration(root: Element, run: ResolvedRun): ExaggerationReport {
  const performances = selectPerformances(readPerformances(root), run.options);
  const reports = performances.map((performance) =>
    new PerformancePass(performance, run.factors, run.requested, run.options).run(),
  );

  return {
    appliedFactors: run.factors,
    performances: reports,
    totalWrites: reports.reduce((sum, report) => sum + report.totalWrites, 0),
  };
}

/**
 * omitted means ALL performances; a string selects by `@name` and a number by index.
 *
 * A selector matching nothing yields an empty run rather than an error: `performances: []` and
 * `totalWrites: 0`, which is already the exact "no-op" contract. Making it loud is the
 * facade's decision.
 */
function selectPerformances(
  performances: readonly PerformanceView[],
  options: ResolvedOptions,
): readonly PerformanceView[] {
  const selector = options.performance;
  if (selector === null) return performances;
  return typeof selector === 'number'
    ? performances.filter((performance) => performance.index === selector)
    : performances.filter((performance) => performance.name === selector);
}

/** One performance, all fifteen dimensions. */
class PerformancePass {
  private readonly sink = new ReportSink();
  private readonly global: MpmEnvironment;
  private centers: { tempo: number | null; dynamics: number | null } = {
    tempo: null,
    dynamics: null,
  };
  private bounds: PerformanceBounds = { tempoDeviationRatio: null, rubatoMaxS: null };
  private accentuationRan = false;

  constructor(
    private readonly performance: PerformanceView,
    private readonly factors: Record<ExpressionDimension, number>,
    private readonly requested: Record<ExpressionDimension, number | null>,
    private readonly options: ResolvedOptions,
  ) {
    this.global = performance.global;
  }

  run(): PerformanceReport {
    this.runDimension('tempo', () => {
      const outcome = applyLevelDimension(
        'tempo',
        this.performance,
        this.factors.tempo,
        this.options,
        this.sink,
      );
      this.centers = { ...this.centers, tempo: outcome.center };
      this.bounds = { ...this.bounds, tempoDeviationRatio: outcome.deviationRatio };
    });
    this.runDimension('dynamics', () => {
      const outcome = applyLevelDimension(
        'dynamics',
        this.performance,
        this.factors.dynamics,
        this.options,
        this.sink,
      );
      this.centers = { ...this.centers, dynamics: outcome.center };
    });
    this.runDimension('tempoShape', () => this.applyTempoShape());
    this.runDimension('dynamicsShape', () => this.applyDynamicsShape());
    this.runDimension('rubato', () => this.applyRubato());
    this.runDimension('articulation', () => this.applyArticulation());
    this.runDimension('accentuation', () => this.applyAccentuation());
    this.runDimension('ornamentSpread', () => this.applyOrnamentSpread());
    this.runDimension('ornamentSpacing', () => this.applyOrnamentSpacing());
    this.runDimension('ornamentDynamics', () => this.applyOrnamentDynamics());
    this.runDimension('asynchrony', () => this.applyAsynchrony());
    for (const dimension of [
      'imprecisionTiming',
      'imprecisionDynamics',
      'imprecisionDuration',
    ] as const) {
      this.runDimension(dimension, () => this.applyImprecision(dimension));
    }
    this.runDimension('pedalShape', () => this.applyPedalShape());
    this.reportInertTuningDomain();
    this.reportSubNoteDynamics();

    const dimensions = fromEntriesExact(EXPRESSION_DIMENSIONS, (dimension) =>
      finishDimension(this.sink.dimensions[dimension], this.requested[dimension]),
    );

    return {
      performance: { index: this.performance.index, name: this.performance.name },
      dimensions,
      centers: this.centers,
      bounds: this.bounds,
      mergedLevels: this.sink.mergedLevels,
      estimates: estimatesWithoutMsm(this.accentuationRan),
      notes: this.sink.notes,
      totalWrites: this.sink.totalWrites,
    };
  }

  /** the dimension-level short-circuit, and the only place a dimension is entered. */
  private runDimension(dimension: ExpressionDimension, apply: () => void): void {
    if (this.factors[dimension] === IDENTITY_FACTOR) {
      this.sink.dimensions[dimension].declareNotWalked();
      this.sink.note(
        'identity-factor',
        dimension,
        null,
        's = 1: the dimension was not walked, which is what makes the identity byte-exact',
      );
      return;
    }
    apply();
  }

  // --- Walking helpers --------------------------------------------------------------------

  /** Every instruction of one map name, in every environment, in the date-stable view. */
  private eachInstruction(
    mapName: string,
    elementName: string,
    visit: (context: InstructionContext) => void,
  ): void {
    for (const environment of environmentsOf(this.performance)) {
      const map = environment.maps.get(mapName);
      if (map === undefined) continue;
      const entries = orderedEntries(map);
      for (const [viewIndex, entry] of entries.entries()) {
        if (entry.element.getLocalName() !== elementName) continue;
        visit({ environment, mapName, entries, viewIndex, entry, element: entry.element });
      }
    }
  }

  /** Every `<styleDef>` of one collection, in every environment. */
  private eachStyleDef(
    collectionName: string,
    visit: (environment: MpmEnvironment, styleDef: Element) => void,
  ): void {
    for (const environment of environmentsOf(this.performance)) {
      const collection = environment.styleCollections.get(collectionName);
      if (collection === undefined) continue;
      for (const styleDef of collection.getChildElements('styleDef')) {
        visit(environment, styleDef);
      }
    }
  }

  /** Every def element of one kind, in every `<styleDef>` of one collection. */
  private eachDef(
    collectionName: string,
    defElement: string,
    visit: (context: DefContext) => void,
  ): void {
    this.eachStyleDef(collectionName, (environment, styleDef) => {
      for (const def of styleDef.getChildElements(defElement)) {
        visit({
          environment,
          collectionName,
          styleDef,
          def,
          container: defContainerLabel(collectionName, readAttributeValue(styleDef, 'name') ?? ''),
        });
      }
    });
  }

  /**
   * Transform one scalar attribute at one site, reporting whatever happened.
   *
   * @returns whether the attribute was present and survived the gate — the caller's cue for
   *   the site-level `transformed`/`skipped` bookkeeping, which is per ELEMENT rather than
   *   per attribute wherever the registry groups attributes into a site (articulation, ornaments).
   */
  private transformAttribute(
    row: RegistryRow,
    element: Element,
    site: SiteRef,
    factor: number,
  ): { readonly present: boolean; readonly value: number | null; readonly writes: number } {
    const raw = readAttributeValue(element, row.attribute);
    if (raw === null) return { present: false, value: null, writes: 0 };
    const value = readNumericAttributeValue(element, row.attribute);
    const space = unparameterizedSpaceOf(row);
    const transformed = gateAndTransform(row, space, value, factor);
    if (!transformed.ok) {
      this.sink.note(transformed.error.kind, row.dimension, site, transformed.error.detail);
      return { present: true, value: null, writes: 0 };
    }
    const outcome = writeNumber(element, row.attribute, transformed.value);
    return {
      present: true,
      value: transformed.value,
      writes: outcome === 'written' ? 1 : 0,
    };
  }

  // --- tempoShape ---------------------------------------------------------------------

  /**
   * `@meanTempoAt` — where in the span the mean tempo falls, on a logit over (0,1).
   *
   * Three inertness rules, all from the renderer rather than from the attribute: without
   * `@beatLength` the renderer skips the whole `<tempo>`; without `@transition.to` there
   * is no transition for the mean position to describe; and a pair whose endpoints RESOLVE
   * equal is deleted at parse (`TempoMap` nulls `transitionTo` and reads `@meanTempoAt` only in
   * the surviving `else`). The third is F4, and is why this dimension shares `isConstantLevel`
   * with its twin: `bpm="A" transition.to="A"` through a `<tempoDef>` is as constant as
   * `120`/`120`.
   */
  private applyTempoShape(): void {
    const row = requireRow('tempo', 'meanTempoAt');
    const accumulator = this.sink.dimensions.tempoShape;
    this.eachInstruction(
      TEMPO_MAP,
      'tempo',
      ({ environment, mapName, entries, viewIndex, entry, element }) => {
        if (readAttributeValue(element, row.attribute) === null) return;
        accumulator.markPresent();
        const site = instructionSiteRef(environment, mapName, entry, row.attribute);

        if (readAttributeValue(element, TEMPO_BEAT_LENGTH_ATTRIBUTE) === null) {
          accumulator.countInert();
          this.sink.note(
            'missing-beat-length',
            'tempoShape',
            site,
            'the renderer skips a <tempo> without @beatLength entirely',
          );
          return;
        }
        if (this.isConstantLevel('tempo', environment, entries, viewIndex, element)) {
          accumulator.countInert();
          this.sink.note(
            'constant-instruction',
            'tempoShape',
            site,
            readAttributeValue(element, TRANSITION_TO_ATTRIBUTE) === null
              ? 'without @transition.to there is no transition whose mean position this could move'
              : 'the two endpoints resolve to the same tempo, so the renderer deletes the ' +
                  'transition at parse and never reads @meanTempoAt',
          );
          return;
        }
        const result = this.transformAttribute(row, element, site, this.factors.tempoShape);
        if (result.value === null) accumulator.countSkipped();
        else accumulator.countTransformed(result.writes);
      },
    );
  }

  // --- dynamicsShape ------------------------------------------------------------------

  /**
   * `@curvature` and `@protraction` — a pure time reparameterization of the swell, whose
   * output can never leave `[volume, transition.to]`. Their own dimension because they are the
   * only range-safe dynamics attributes: fused with `dynamics`, a caller asking for wider
   * contrast would unavoidably get a late-blooming swell too.
   *
   * Both are force-zeroed by the renderer on a constant instruction, which is `inert` and not
   * `absent`: a consumer diffing reports must be able to tell "this document does not use
   * curvature" from "this document uses curvature where it does nothing".
   */
  private applyDynamicsShape(): void {
    const accumulator = this.sink.dimensions.dynamicsShape;
    const rows = rowsOf('dynamicsShape');
    this.eachInstruction(
      DYNAMICS_MAP,
      'dynamics',
      ({ environment, mapName, entries, viewIndex, entry, element }) => {
        const present = rows.filter((row) => readAttributeValue(element, row.attribute) !== null);
        if (present.length === 0) return;
        accumulator.markPresent();
        const constant = this.isConstantLevel('dynamics', environment, entries, viewIndex, element);
        for (const row of present) {
          const site = instructionSiteRef(environment, mapName, entry, row.attribute);
          if (constant) {
            accumulator.countInert();
            this.sink.note(
              'constant-instruction',
              'dynamicsShape',
              site,
              'the renderer force-zeroes the curve parameters on a constant instruction',
            );
            continue;
          }
          const result = this.transformAttribute(row, element, site, this.factors.dynamicsShape);
          if (result.value === null) accumulator.countSkipped();
          else accumulator.countTransformed(result.writes);
        }
      },
    );
  }

  /**
   * Whether the renderer reads this instruction as a CONSTANT — no `@transition.to`, or a
   * target that resolves to the same number as the prevailing level.
   *
   * Shared by both shape dimensions: `isConstantDynamics` and `isConstantTempo` are one
   * predicate over two attribute names, and each renderer
   * path reads its curve parameter — or `@meanTempoAt` — only in the surviving transition
   * branch.
   *
   * The comparison uses the renderer's 100.0 fallback, and ONLY here. `resolveLevel`
   * reports an unresolvable level as `NaN` and `NaN === NaN` is false, so a pair of MEI
   * placeholders would read as a gesture and the engine would write curve parameters the
   * renderer never consults; the renderer instead resolves both strings through
   * `getNumericValueStatic`, whose third step is that hardcoded 100.0. The fallback must NOT
   * leak into `levels.ts`: the design forbids it in the center population, where inventing a level
   * the author never wrote would move every other level.
   */
  private isConstantLevel(
    domain: LevelDomain,
    environment: MpmEnvironment,
    entries: readonly DatedEntry[],
    viewIndex: number,
    element: Element,
  ): boolean {
    const target = readAttributeValue(element, TRANSITION_TO_ATTRIBUTE);
    const level = readAttributeValue(element, LEVEL_ATTRIBUTES[domain]);
    if (target === null || level === null) return true;
    const styleName = styleNameAt(entries, viewIndex);
    const rendered = (raw: string): number => {
      const reading = resolveLevel(raw, domain, styleName, environment, this.global);
      return reading.kind === 'unresolvable' ? RENDERER_UNRESOLVED_LEVEL : reading.value;
    };
    return rendered(target) === rendered(level);
  }

  /**
   * the "read it" for `@subNoteDynamics`, discharged as a report note.
   *
   * With the flag true the level values become CC 7 curve points, which `fitVelocities` never
   * scans, which the MIDI writer hard-clips at 0..127 and which are unclamped on the data path.
   * the `velocityRange` clamp is the wrong model for such an instruction, so
   * `dimensions.dynamics.clamps` is not a guarantee there.
   */
  private reportSubNoteDynamics(): void {
    this.eachInstruction(DYNAMICS_MAP, 'dynamics', ({ environment, mapName, entry, element }) => {
      if (readAttributeValue(element, SUB_NOTE_DYNAMICS_ATTRIBUTE) !== 'true') return;
      this.sink.note(
        'sub-note-dynamics',
        'dynamics',
        instructionSiteRef(environment, mapName, entry, SUB_NOTE_DYNAMICS_ATTRIBUTE),
        'this instruction renders as CC 7 curve points, which fitVelocities never scans and ' +
          'the MIDI writer hard-clips: the velocityRange clamp does not bound what is heard here',
      );
    });
  }

  // --- rubato --------------------------------------------------------------------------

  /**
   * `@intensity` independently, and `(@lateStart, @earlyEnd)` as ONE joint trim.
   *
   * The pair is not two boundary-power values. Mapped independently they cross at the `s`
   * solving `ee^s + (1−ls)^s = 1` — `s ≈ 1.36` for a window trimmed to (.4,.6) — and both
   * renderer paths answer a crossed pair by silently resetting it to (0,1): not saturation but
   * a discontinuous jump to no window effect at all. So the pair is reparameterized through its
   * total trim `t = lateStart + (1 − earlyEnd)`, transformed there, and split back on the
   * preserved ratio.
   *
   * the cross-site rule: inheritance resolves per attribute, so a def (0.1, 0.9) with an
   * element supplying `lateStart="0.85"` has effective window (0.85, 0.9), and transforming the
   * def alone to (0.18, 0.82) crosses it. Skipping the element does not help — the def is what
   * moves — so both sites are excluded, and the report names the ELEMENT.
   */
  private applyRubato(): void {
    const accumulator = this.sink.dimensions.rubato;
    const intensityRow = requireRow('rubato', 'intensity');
    const lateStartRow = requireRow('rubato', 'lateStart');
    const earlyEndRow = requireRow('rubato', 'earlyEnd');
    const factor = this.factors.rubato;

    const defWindows = new Map<Element, RubatoSite>();
    const excludedDefs = new Set<Element>();

    this.eachDef(RUBATO_STYLE_COLLECTION, RUBATO_DEF_ELEMENT, ({ environment, container, def }) => {
      accumulator.markPresent();
      const intensitySite = siteRefOf(environment, container, def, def, intensityRow.attribute);
      this.applyRubatoIntensity(intensityRow, def, intensitySite, factor);
      defWindows.set(def, {
        element: def,
        site: siteRefOf(environment, container, def, def, lateStartRow.attribute),
        lateStart: presentNumber(def, lateStartRow.attribute),
        earlyEnd: presentNumber(def, earlyEndRow.attribute),
      });
    });

    const elementWindows: RubatoSite[] = [];
    this.eachInstruction(
      RUBATO_MAP,
      'rubato',
      ({ environment, mapName, entries, viewIndex, entry, element }) => {
        accumulator.markPresent();
        const intensitySite = instructionSiteRef(
          environment,
          mapName,
          entry,
          intensityRow.attribute,
        );
        this.applyRubatoIntensity(intensityRow, element, intensitySite, factor);

        this.reportRubatoSpan(
          element,
          instructionSiteRef(environment, mapName, entry, LOOP_ATTRIBUTE),
        );

        const site: RubatoSite = {
          element,
          site: instructionSiteRef(environment, mapName, entry, lateStartRow.attribute),
          lateStart: presentNumber(element, lateStartRow.attribute),
          earlyEnd: presentNumber(element, earlyEndRow.attribute),
        };
        const def = this.resolveRubatoDef(environment, entries, viewIndex, element);
        const defWindow = def === null ? undefined : defWindows.get(def);
        if (def !== null && defWindow !== undefined && crossesSites(site, defWindow)) {
          excludedDefs.add(def);
          site.crossSite = true;
          accumulator.countSkipped();
          this.sink.note(
            'cross-site-rubato-window',
            'rubato',
            site.site,
            'this element overrides exactly one bound of its def’s window, so the effective ' +
              'window spans both sites and neither can be trimmed on its own',
          );
        }
        elementWindows.push(site);
      },
    );

    let maxS: number | null = null;
    for (const window of [...defWindows.values(), ...elementWindows]) {
      // A cross-site element was counted where it was detected; the def it excluded is counted
      // here, but only if it has a window to lose. A def with no window attributes at all has
      // nothing the exclusion takes away, and counting it would report a skip with no site.
      if (window.crossSite) continue;
      if (excludedDefs.has(window.element)) {
        if (window.lateStart !== null || window.earlyEnd !== null) accumulator.countSkipped();
        continue;
      }
      maxS = smallerBound(maxS, this.applyRubatoWindow(window, lateStartRow, earlyEndRow, factor));
    }
    this.bounds = { ...this.bounds, rubatoMaxS: maxS };
  }

  /**
   * the "read it" for `rubato@loop`, discharged as a report note.
   *
   * `@frameLength` is excluded because it has no neutral, but WHAT it means depends on this
   * flag. It is never inherited from the def, which is why it is read on the element and
   * reported there.
   */
  private reportRubatoSpan(element: Element, site: SiteRef): void {
    const loop = readAttributeValue(element, LOOP_ATTRIBUTE);
    if (loop === null) return;
    this.sink.note(
      'span-flags',
      'rubato',
      site,
      `@loop = ${JSON.stringify(loop)}${
        loop === 'false'
          ? ': @frameLength is also the span cutoff here, so the trimmed window applies once ' +
            'rather than repeating'
          : ': @frameLength is a pure period, and the trimmed window repeats across the span'
      }`,
    );
  }

  private applyRubatoIntensity(
    row: RegistryRow,
    element: Element,
    site: SiteRef,
    factor: number,
  ): void {
    const accumulator = this.sink.dimensions.rubato;
    const result = this.transformAttribute(row, element, site, factor);
    if (!result.present) return;
    if (result.value === null) accumulator.countSkipped();
    else accumulator.countTransformed(result.writes);
  }

  /**
   * Transform one site's window and write back only the attributes that are physically there.
   *
   * Where a site supplies neither bound, `resolveRubato`'s fallbacks 1.0/0.0/1.0 ARE the neutral,
   * so the transform is the identity by construction and there is nothing to do. Where it
   * supplies one, the other is that neutral and the trim is still entirely this site's.
   *
   * @returns the `s` at which this site's trim would reach the guard, for `bounds.rubatoMaxS`.
   */
  private applyRubatoWindow(
    window: RubatoSite,
    lateStartRow: RegistryRow,
    earlyEndRow: RegistryRow,
    factor: number,
  ): number | null {
    const accumulator = this.sink.dimensions.rubato;
    if (window.lateStart === null && window.earlyEnd === null) return null;

    for (const [row, value] of [
      [lateStartRow, window.lateStart],
      [earlyEndRow, window.earlyEnd],
    ] as const) {
      if (value === null) continue;
      if (!row.valueDomain(value)) {
        accumulator.countSkipped();
        this.sink.note(
          'out-of-domain-input',
          'rubato',
          window.site,
          `@${row.attribute} = ${value} is outside the domain the design gives it`,
        );
        return null;
      }
    }

    const effective = {
      lateStart: window.lateStart ?? RUBATO_NEUTRAL_LATE_START,
      earlyEnd: window.earlyEnd ?? RUBATO_NEUTRAL_EARLY_END,
    };
    const trimmed = jointTrimWindow(effective, factor, this.options.minRubatoWindow);
    if (!trimmed.ok) {
      if (trimmed.error === 'saturation-to-boundary') {
        // the guard clamps `t'` below 1, so an ordered pair is guaranteed by construction.
        // Reaching this means the split's own rounding broke that guarantee, and the renderer's
        // answer to a crossed pair is a silent total reset to (0,1) — an engine invariant
        // failure, not a document condition, and therefore not something to report and skip.
        throw new Error(
          `rubato window (${effective.lateStart}, ${effective.earlyEnd}) at ` +
            `${window.site.container}#${window.site.index} produced a crossed pair at s = ${factor}`,
        );
      }
      accumulator.countSkipped();
      this.sink.note(
        'out-of-domain-input',
        'rubato',
        window.site,
        `the effective window (${effective.lateStart}, ${effective.earlyEnd}) is outside ` +
          '0 ≤ lateStart < earlyEnd ≤ 1',
      );
      return null;
    }

    let writes = 0;
    if (window.lateStart !== null) {
      writes +=
        writeNumber(window.element, lateStartRow.attribute, trimmed.value.lateStart) === 'written'
          ? 1
          : 0;
    }
    if (window.earlyEnd !== null) {
      writes +=
        writeNumber(window.element, earlyEndRow.attribute, trimmed.value.earlyEnd) === 'written'
          ? 1
          : 0;
    }
    accumulator.countTransformed(writes);

    const totalTrim =
      effective.lateStart -
      RUBATO_NEUTRAL_LATE_START +
      (RUBATO_NEUTRAL_EARLY_END - effective.earlyEnd);
    return guardBoundFor(totalTrim, this.options.minRubatoWindow);
  }

  /** The `<rubatoDef>` a `<rubato>` element inherits from, or null. */
  private resolveRubatoDef(
    environment: MpmEnvironment,
    entries: readonly DatedEntry[],
    viewIndex: number,
    element: Element,
  ): Element | null {
    const nameRef = readAttributeValue(element, 'name.ref');
    if (nameRef === null) return null;
    const style = findStyleDef(
      RUBATO_STYLE_COLLECTION,
      styleNameAt(entries, viewIndex),
      environment,
      this.global,
    );
    return style === null ? null : findNamedDef(style.styleDef, RUBATO_DEF_ELEMENT, nameRef);
  }

  // --- articulation ---------------------------------------------------------------------

  /**
   * The seven live modifiers, on `<articulationDef>` and on inline `<articulation>` alike.
   *
   * Two element-keyed rules, both changing what is written and not only what is reported. On a
   * def the three tick-duration attributes COMPOSE; on an inline element the original duration
   * is read once up front so they do not, and the precedence `absoluteDurationChange >
   * relativeDuration > absoluteDuration` makes the loser inert. The exclusions make the
   * dimension lopsided: meico's own `stacc` carries `absoluteDurationMs` (excluded — its
   * neutral lives in the MSM) beside `absoluteVelocityChange` (included), so exaggerating it
   * renders "more staccato" as "softer", never "shorter". Such a site is `partial`, never
   * `transformed`.
   */
  private applyArticulation(): void {
    const rows = rowsOf('articulation');
    const factor = this.factors.articulation;
    // the four velocity-touching dimensions report coefficients whenever they RUN, so
    // that a caller summing them can tell "this dimension contributes nothing" (zeros) from
    // "this dimension was not computed" (null, the identity short-circuit).
    this.sink.dimensions.articulation.enableVelocityReporting();
    this.eachDef(
      ARTICULATION_STYLE,
      'articulationDef',
      ({ environment, container, styleDef, def }) => {
        this.applyArticulationSite(rows, factor, def, (attribute) =>
          siteRefOf(environment, container, styleDef, def, attribute),
        );
      },
    );
    this.eachInstruction(
      ARTICULATION_MAP,
      'articulation',
      ({ environment, mapName, entry, element }) => {
        this.applyArticulationSite(rows, factor, element, (attribute) =>
          instructionSiteRef(environment, mapName, entry, attribute),
        );
      },
    );
  }

  private applyArticulationSite(
    rows: readonly RegistryRow[],
    factor: number,
    element: Element,
    siteFor: (attribute: string) => SiteRef,
  ): void {
    const accumulator = this.sink.dimensions.articulation;
    const inline = element.getLocalName() === 'articulation';
    const present = rows.filter((row) => readAttributeValue(element, row.attribute) !== null);
    const excluded = EXCLUDED_ARTICULATION_LEVERS.filter(
      (lever) => readAttributeValue(element, lever) !== null,
    );
    if (present.length === 0 && excluded.length === 0) return;
    accumulator.markPresent();

    for (const lever of excluded) {
      this.sink.note(
        'articulation-component-excluded',
        'articulation',
        siteFor(lever),
        `@${lever} is a replacement rather than a deviation: its neutral is the attribute's ` +
          'own absence and its effective neutral lives in the MSM, out of reach',
      );
    }
    if (present.length === 0) {
      accumulator.countSkipped();
      return;
    }

    const overriding = inline ? this.inlineDurationWinner(element) : null;
    let writes = 0;
    let transformed = 0;
    let skipped = 0;
    let relativeVelocity: number | null = null;
    let absoluteVelocityChange: number | null = null;

    for (const row of present) {
      const site = siteFor(row.attribute);
      if (overriding !== null && row.attribute !== overriding && isDurationLever(row.attribute)) {
        accumulator.countInert();
        this.sink.note(
          'inline-duration-precedence',
          'articulation',
          site,
          `an inline <articulation> reads the original duration once, so @${overriding} wins ` +
            `outright and @${row.attribute} has no effect here`,
        );
        continue;
      }
      const result = this.transformAttribute(row, element, site, factor);
      if (result.value === null) {
        skipped += 1;
        continue;
      }
      transformed += 1;
      writes += result.writes;
      if (row.attribute === 'relativeVelocity') relativeVelocity = result.value;
      if (row.attribute === 'absoluteVelocityChange') absoluteVelocityChange = result.value;
    }

    if (relativeVelocity !== null && absoluteVelocityChange !== null) {
      this.sink.note(
        'articulation-affine-velocity-pair',
        'articulation',
        siteFor('relativeVelocity'),
        "this site carries both halves of the affine pair v' = v·r + c, whose rendered effect " +
          'is NOT monotone in s and whose exactly-neutral configuration is not a fixed point',
      );
    }
    // coefficients, not a scalar maximum — for this dimension the contribution is
    // affine in the note's incoming velocity, and no finite MPM-only maximum exists.
    accumulator.contributeVelocity(
      relativeVelocity === null ? 0 : Math.abs(relativeVelocity - 1),
      absoluteVelocityChange === null ? 0 : Math.abs(absoluteVelocityChange),
    );

    if (transformed === 0) {
      if (skipped > 0) accumulator.countSkipped();
      return;
    }
    if (excluded.length > 0) accumulator.countPartial(writes);
    else accumulator.countTransformed(writes);
  }

  /** The inline duration attribute that wins, or null when none is set to a non-neutral value. */
  private inlineDurationWinner(element: Element): string | null {
    for (const attribute of INLINE_DURATION_PRECEDENCE) {
      const raw = readAttributeValue(element, attribute);
      if (raw === null) continue;
      const value = readNumericAttributeValue(element, attribute);
      // The renderer's guards are exact float equality against the attribute's own neutral:
      // 0 for the change attributes, 1 for the ratio.
      const neutral = attribute === 'relativeDuration' ? 1 : GAIN_NEUTRAL;
      if (value !== neutral) return attribute;
    }
    return null;
  }

  // --- accentuation ---------------------------------------------------------------------

  /**
   * `accentuationPattern@scale`, the single site.
   *
   * The def triple `(@value, @transition.from, @transition.to)` is positively homogeneous of
   * degree 1 with it, so scaling both would apply `s²`. `@scale` is picked because it is the
   * per-instruction lever while one def is addressed from any number of instructions in any
   * part.
   *
   * The attribute is MANDATORY — absent, the renderer drops the whole instruction — so `s = 0`
   * is written as `"0"` and never expressed by deleting it, and an absent `@scale` is never
   * materialized.
   */
  private applyAccentuation(): void {
    const row = requireRow('accentuationPattern', 'scale');
    const accumulator = this.sink.dimensions.accentuation;
    accumulator.enableVelocityReporting();

    this.eachInstruction(
      METRICAL_ACCENTUATION_MAP,
      'accentuationPattern',
      ({ environment, mapName, entries, viewIndex, entry, element }) => {
        if (readAttributeValue(element, row.attribute) === null) return;
        accumulator.markPresent();
        this.accentuationRan = true;
        const site = instructionSiteRef(environment, mapName, entry, row.attribute);
        const result = this.transformAttribute(row, element, site, this.factors.accentuation);
        if (result.value === null) {
          accumulator.countSkipped();
          return;
        }
        accumulator.countTransformed(result.writes);

        this.reportAccentuationSpan(element, site);

        const amplitude = this.accentuationAmplitude(environment, entries, viewIndex, element);
        if (!accumulator.contributeVelocity(0, Math.abs(result.value) * amplitude)) {
          this.sink.note(
            'non-finite-result',
            'accentuation',
            site,
            `the velocity estimate ${Math.abs(result.value)} × ${amplitude} overflows, so no ` +
              'coefficient is reported for this site — the written @scale is unaffected',
          );
        }
        this.sink.note(
          'accentuation-beats-unverifiable',
          'accentuation',
          site,
          'the velocity estimate is |scale| × the largest amplitude declared on the def’s own ' +
            '@beat anchors; the rendered beat argument needs the MSM’s timeSignatureMap',
        );
      },
    );
  }

  /**
   * the "read it" for `accentuationPattern@loop` and `@stickToMeasures`.
   *
   * Both are "documented no-ops the report must catch": together they decide WHERE
   * an exaggerated accent actually lands, and their absent-defaults differ.
   */
  private reportAccentuationSpan(element: Element, site: SiteRef): void {
    const loop = readAttributeValue(element, LOOP_ATTRIBUTE);
    const stick = readAttributeValue(element, STICK_TO_MEASURES_ATTRIBUTE);
    if (loop === null && stick === null) return;
    this.sink.note(
      'span-flags',
      'accentuation',
      site,
      `@loop = ${loop ?? 'absent (defaults to false)'}, @stickToMeasures = ` +
        `${stick ?? 'absent (defaults to TRUE)'}: together these decide the span the scaled ` +
        `pattern covers and which beat number each anchor is evaluated at${
          stick === 'false'
            ? ''
            : ', and with stickToMeasures anchors beyond the measure are never reached'
        }`,
    );
  }

  /**
   * The largest accentuation amplitude a pattern def declares, over its own anchors.
   *
   * the fallback for the exact form, which needs the beat argument
   * `1 + ((noteDate − tsDate) % measureTicks)/beatTicks` and therefore the MSM. Each
   * `<accentuation>` contributes its `@value` and its two transition endpoints, with the
   * renderer's defaulting chain: an absent `@transition.from` is `@value`, an absent
   * `@transition.to` is `@transition.from`.
   */
  private accentuationAmplitude(
    environment: MpmEnvironment,
    entries: readonly DatedEntry[],
    viewIndex: number,
    element: Element,
  ): number {
    const nameRef = readAttributeValue(element, 'name.ref');
    if (nameRef === null) return 0;
    const style = findStyleDef(
      ACCENTUATION_STYLE_COLLECTION,
      styleNameAt(entries, viewIndex),
      environment,
      this.global,
    );
    if (style === null) return 0;
    const def = findNamedDef(style.styleDef, ACCENTUATION_DEF_ELEMENT, nameRef);
    if (def === null) return 0;

    let amplitude = 0;
    for (const anchor of def.getChildElements(ACCENTUATION_ANCHOR_ELEMENT)) {
      const value = presentNumber(anchor, 'value') ?? 0;
      const from = presentNumber(anchor, 'transition.from') ?? value;
      const to = presentNumber(anchor, 'transition.to') ?? from;
      for (const candidate of [value, from, to]) {
        if (Number.isFinite(candidate)) amplitude = Math.max(amplitude, Math.abs(candidate));
      }
    }
    return amplitude;
  }

  // --- ornamentation -------------------------------------------------

  /**
   * `<temporalSpread>`'s frame, as ONE geometric pair under ONE factor — in either MPM
   * generation.
   *
   * `[offset, offset + length]` is a frame, not two numbers: scaling the length alone drags the
   * centroid late. Both are gains with neutral 0, and the pair is atomic on failure — one bound
   * failing the gate means neither is written.
   *
   * The generation is detected PER ELEMENT ({@link detectFrameFormat}), because that is how the
   * renderer detects it and because one performance may hold both. A v2 spread reads and writes
   * as bare doubles through `parseFloat`, byte for byte; a v3 one through
   * {@link parseTemporalText}, which keeps each value's unit suffix as bytes, so
   * `frameLength="80%"` at `s = 1.5` comes back `"120%"` and a suffix-less `"44"` comes back
   * `"88"`.
   *
   * One v3 asymmetry costs an otherwise-transformable site. The row rests on "an absent bound is
   * already at its neutral — `s · 0 = 0`", which v2's two defaults (`frame.start` 0.0,
   * `frameLength` 0.0) make true. v3 kept the offset default at 0 but changed the LENGTH default
   * to `100%`, the widest frame there is rather than the narrowest. So on a v3 spread carrying
   * an offset and no `@frameLength` the absent bound is not neutral, the raw-tree discipline
   * forbids creating it,
   * and scaling the offset alone would move the figure without resizing it: the whole site is
   * skipped with the pair's own note (the W2 F1 ruling — reported suppression over
   * half-application).
   */
  private applyOrnamentSpread(): void {
    const accumulator = this.sink.dimensions.ornamentSpread;
    const factor = this.factors.ornamentSpread;
    this.eachTemporalSpread((spread, siteFor) => {
      const format = detectFrameFormat(spread);
      const reading = format === 'v2' ? readV2Frame(spread) : readV3Frame(spread);
      if (reading.ok && reading.value.length === 0) return;
      accumulator.markPresent();

      // Read and gate are one chain because they refuse the same way: whichever step turns the
      // pair down, neither bound is written. `traverse` stops at the first refused bound and
      // discards the ones already planned.
      const planned = andThen(reading, (bounds) =>
        traverse(bounds, (bound) =>
          mapOk(
            mapErr(
              gateAndTransform(bound.row, unparameterizedSpaceOf(bound.row), bound.value, factor),
              (refusal): FrameRefusal => ({
                attribute: bound.attribute,
                detail: `${refusal.detail} — the frame is one geometric pair, so neither bound is written`,
              }),
            ),
            (value) => ({ ...bound, value }),
          ),
        ),
      );
      if (!planned.ok) {
        accumulator.countSkipped();
        this.sink.note(
          'atomic-group-skipped',
          'ornamentSpread',
          siteFor(planned.error.attribute),
          planned.error.detail,
        );
        return;
      }

      let writes = 0;
      for (const { attribute, value, suffix } of planned.value) {
        writes += writeSuffixedNumber(spread, attribute, value, suffix) === 'written' ? 1 : 0;
      }
      accumulator.countTransformed(writes);
      this.reportFrameRegime(spread, siteFor, format, planned.value);
    });
  }

  /**
   * the two "read it" obligations for the ornament frame, discharged as report notes,
   * plus the third: the alias a v3 spread can carry and never read.
   *
   * None of these attributes is ever written — enums and a dead spelling, none with a neutral —
   * but each changes what a given `s` MEANS. `@noteoff.shift` decides which attribute absorbs
   * the scaled offset, and `"monophonic"` flips the sign of the effect on note length: a wider
   * frame LENGTHENS notes there. It is unchanged in v3 (`temporalSpread.xml:39-41` only
   * restates the `false` default), so both generations read it the same way.
   */
  private reportFrameRegime(
    spread: Element,
    siteFor: (attribute: string) => SiteRef,
    format: FrameFormat,
    bounds: readonly FrameBound[],
  ): void {
    if (format === 'v3') this.reportV3FrameUnits(spread, siteFor, bounds);
    else this.reportV2FrameUnit(spread, siteFor);

    const shift = readAttributeValue(spread, NOTEOFF_SHIFT_ATTRIBUTE);
    if (shift !== null) {
      this.sink.note(
        'frame-noteoff-shift',
        'ornamentSpread',
        siteFor(NOTEOFF_SHIFT_ATTRIBUTE),
        `@noteoff.shift = ${JSON.stringify(shift)}${
          shift === 'monophonic'
            ? ': widening this frame LENGTHENS notes — the opposite sign from the default, ' +
              'where the offset is absorbed by duration.perf with no floor'
            : ': the note end moves with the onset, which is the range-safe mode'
        }`,
      );
    }
  }

  /**
   * The v2 frame unit: one `@time.unit` enum for the whole element, or the default domain.
   *
   * the `ornamentSpread` row makes the caller's admissible range depend on it ("in the
   * milliseconds frame domain the same s is absolute rather than tempo-relative — halve it").
   */
  private reportV2FrameUnit(spread: Element, siteFor: (attribute: string) => SiteRef): void {
    const unit = readAttributeValue(spread, FRAME_TIME_UNIT_ATTRIBUTE);
    this.sink.note(
      'frame-time-unit',
      'ornamentSpread',
      siteFor(FRAME_TIME_UNIT_ATTRIBUTE),
      unit === null
        ? 'no @time.unit: the frame is in the default domain, and the sampling range applies ' +
            'as written'
        : `@time.unit = ${JSON.stringify(unit)}: the ornamentSpread range is stated for the ` +
            'tick domain, so a millisecond frame wants a smaller s for the same audible width',
    );
  }

  /**
   * The v3 frame units: one per value, named at the bound that carries it, and sited at the
   * first frame attribute rather than at `@time.unit` — which a v3 spread usually does not have.
   *
   * The note answers the question ("is this s absolute or tempo-relative here?") twice, because
   * `frame.offset="22ms" frameLength="90%"` is legal and puts the two bounds of one frame on two
   * clocks. A suffix-less value is reported with where its domain came from — the case
   * expected to have disappeared and which the real corpus keeps writing.
   */
  private reportV3FrameUnits(
    spread: Element,
    siteFor: (attribute: string) => SiteRef,
    bounds: readonly FrameBound[],
  ): void {
    if (!isNonEmpty(bounds)) return;
    const units = bounds.map((bound) => frameDomainPhrase(spread, bound)).join(', ');
    this.sink.note(
      'frame-time-unit',
      'ornamentSpread',
      siteFor(head(bounds).attribute),
      `v3 per-value units — ${units}: the ornamentSpread range is stated for the tick domain, ` +
        'so a millisecond frame wants a smaller s for the same audible width',
    );
    if (
      readAttributeValue(spread, FRAME_OFFSET_ATTRIBUTE) !== null &&
      readAttributeValue(spread, FRAME_START_ATTRIBUTE) !== null
    ) {
      this.sink.note(
        'frame-alias-shadowed',
        'ornamentSpread',
        siteFor(FRAME_START_ATTRIBUTE),
        '@frame.start is the legacy alias of @frame.offset and this spread carries both, so ' +
          'the renderer reads @frame.offset and never this one: it is left exactly as found',
      );
    }
  }

  /** `<temporalSpread>@intensity` — the spacing curve of the roll, an exponent, not a width. */
  private applyOrnamentSpacing(): void {
    const accumulator = this.sink.dimensions.ornamentSpacing;
    const row = requireRow(TEMPORAL_SPREAD_ELEMENT, 'intensity');
    this.eachTemporalSpread((spread, siteFor) => {
      if (readAttributeValue(spread, row.attribute) === null) return;
      accumulator.markPresent();
      const result = this.transformAttribute(
        row,
        spread,
        siteFor(row.attribute),
        this.factors.ornamentSpacing,
      );
      if (result.value === null) accumulator.countSkipped();
      else accumulator.countTransformed(result.writes);
    });
  }

  /**
   * `<dynamicsGradient>`'s endpoints — the single site, and usually inert.
   *
   * The rendered contribution is `constFac·n + from·scale` with
   * `constFac = scale·(to−from)/(n−1)`: EVERY term carries `@scale`, which is absent≙0 and
   * hardcoded 0.0 by the MEI converter for every arpeggio. So scaling the endpoints is exactly
   * as dead as scaling `@scale` would be, and the design makes that a report state rather than a
   * silently generated identity document. Making it live requires seeding a non-zero `@scale`,
   * an editorial edit that is deliberately not smuggled into `s`.
   *
   * `@transition.to` is scaled only where physically present: absent it defaults to
   * `@transition.from`, so materializing it would turn a flat offset into a ramp.
   */
  private applyOrnamentDynamics(): void {
    const accumulator = this.sink.dimensions.ornamentDynamics;
    const rows = rowsOf('ornamentDynamics');
    const factor = this.factors.ornamentDynamics;
    const scales = this.ornamentScales();
    accumulator.enableVelocityReporting();

    this.eachDef(
      ORNAMENT_STYLE_COLLECTION,
      ORNAMENT_DEF_ELEMENT,
      ({ environment, container, def: ornamentDef }) => {
        const label = `${container}/${readAttributeValue(ornamentDef, 'name') ?? ''}`;
        for (const gradient of ornamentDef.getChildElements(DYNAMICS_GRADIENT_ELEMENT)) {
          const siteFor = (attribute: string): SiteRef =>
            siteRefOf(environment, label, ornamentDef, gradient, attribute);
          const present = rows.filter(
            (row) => readAttributeValue(gradient, row.attribute) !== null,
          );
          if (!isNonEmpty(present)) continue;
          accumulator.markPresent();

          // fire only when `@transition.to` is the endpoint that is actually missing. A
          // gradient carrying only `@transition.to` is well-formed — `DynamicsGradient` parses
          // the two endpoints independently.
          if (readAttributeValue(gradient, TRANSITION_TO_ATTRIBUTE) === null) {
            this.sink.note(
              'transition-to-absent',
              'ornamentDynamics',
              siteFor(TRANSITION_TO_ATTRIBUTE),
              '@transition.to is absent, so it defaults to @transition.from: materializing it ' +
                'would silently turn a flat offset into a ramp',
            );
          }

          const scale = scales.get(ornamentDef) ?? ABSENT_ORNAMENT_SCALE;
          if (scale === ABSENT_ORNAMENT_SCALE) {
            accumulator.countInert();
            this.sink.note(
              'ornament-scale-zero',
              'ornamentDynamics',
              siteFor(head(present).attribute),
              'every referencing <ornament> has @scale absent or 0, and every term of the ' +
                'rendered contribution carries it, so this gradient is dead whatever s is',
            );
            continue;
          }

          let writes = 0;
          let magnitude = 0;
          let failed = false;
          for (const row of present) {
            const result = this.transformAttribute(row, gradient, siteFor(row.attribute), factor);
            if (result.value === null) {
              failed = true;
              continue;
            }
            writes += result.writes;
            magnitude = Math.max(magnitude, Math.abs(result.value));
            if (Math.abs(result.value) > 1) {
              this.sink.note(
                'gradient-outside-nominal-range',
                'ornamentDynamics',
                siteFor(row.attribute),
                `${result.value} is outside the nominal [−1,1]; nothing anywhere enforces that ` +
                  'range and the values are plain velocity units, so this is reported, not corrected',
              );
            }
          }
          if (writes === 0 && failed) accumulator.countSkipped();
          else accumulator.countTransformed(writes);
          if (!accumulator.contributeVelocity(0, magnitude * scale)) {
            this.sink.note(
              'non-finite-result',
              'ornamentDynamics',
              siteFor(head(present).attribute),
              `the velocity estimate ${magnitude} × ${scale} overflows, so no coefficient is ` +
                'reported for this site — the written endpoints are unaffected',
            );
          }
        }
      },
    );
  }

  /** Every `<temporalSpread>` under every `<ornamentDef>`, with a site-ref factory. */
  private eachTemporalSpread(
    visit: (spread: Element, siteFor: (attribute: string) => SiteRef) => void,
  ): void {
    this.eachDef(
      ORNAMENT_STYLE_COLLECTION,
      ORNAMENT_DEF_ELEMENT,
      ({ environment, container, def: ornamentDef }) => {
        const label = `${container}/${readAttributeValue(ornamentDef, 'name') ?? ''}`;
        for (const spread of ornamentDef.getChildElements(TEMPORAL_SPREAD_ELEMENT)) {
          visit(spread, (attribute) =>
            siteRefOf(environment, label, ornamentDef, spread, attribute),
          );
        }
      },
    );
  }

  /**
   * The largest `@scale` any in-scope `<ornament>` applies to each `<ornamentDef>`.
   *
   * An ornament before the map's first `<style>` switch, or whose `@name.ref` resolves to no
   * def, is skipped outright by the renderer and therefore is not a reference.
   */
  private ornamentScales(): ReadonlyMap<Element, number> {
    const scales = new Map<Element, number>();
    this.eachInstruction(
      ORNAMENT_MAP,
      'ornament',
      ({ environment, entries, viewIndex, element }) => {
        const nameRef = readAttributeValue(element, 'name.ref');
        if (nameRef === null) return;
        const style = findStyleDef(
          ORNAMENT_STYLE_COLLECTION,
          styleNameAt(entries, viewIndex),
          environment,
          this.global,
        );
        if (style === null) return;
        const def = findNamedDef(style.styleDef, ORNAMENT_DEF_ELEMENT, nameRef);
        if (def === null) return;
        const scale = presentNumber(element, ORNAMENT_SCALE_ATTRIBUTE) ?? ABSENT_ORNAMENT_SCALE;
        const magnitude = Number.isFinite(scale) ? Math.abs(scale) : ABSENT_ORNAMENT_SCALE;
        scales.set(def, Math.max(scales.get(def) ?? ABSENT_ORNAMENT_SCALE, magnitude));
      },
    );
    return scales;
  }

  // --- asynchrony ---------------------------------------------------------------------

  /** `@milliseconds.offset` — exactly linear in the document; the floors are all render-side. */
  private applyAsynchrony(): void {
    const row = requireRow('asynchrony', 'milliseconds.offset');
    const accumulator = this.sink.dimensions.asynchrony;
    this.eachInstruction(
      ASYNCHRONY_MAP,
      'asynchrony',
      ({ environment, mapName, entry, element }) => {
        if (readAttributeValue(element, row.attribute) === null) return;
        accumulator.markPresent();
        const site = instructionSiteRef(environment, mapName, entry, row.attribute);
        const result = this.transformAttribute(row, element, site, this.factors.asynchrony);
        if (result.value === null) accumulator.countSkipped();
        else accumulator.countTransformed(result.writes);
      },
    );
  }

  // --- imprecision ----------------------------------------------------------------------

  /**
   * One imprecision domain: every width-like attribute of every distribution, in ATOMIC groups.
   *
   * They are grouped for a measured reason: scaling a gaussian's `@deviation.standard` without
   * its `@limit.*` changes the truncation ratio and desynchronizes the whole sequence, and
   * dropping a triangular `@clip.*` that scaled to 0 renders the distribution a silent no-op.
   * So a group is all-or-nothing — one attribute failing the gate skips the distribution, and
   * the report says which.
   *
   * The timing domain carries the caveat. An absent `@milliseconds.timingBasis` is
   * derived from exactly the attributes being scaled, so scaling them rescales the sampling
   * grid and re-indexes the whole random sequence — the rendered offsets are then NOT `s×` the
   * originals. Such distributions are still scaled (excluding them would silently drop the
   * most common shape of authored timing imprecision) and the report flags them.
   */
  private applyImprecision(dimension: ExpressionDimension): void {
    const mapName = IMPRECISION_DIMENSION_MAPS[dimension];
    if (mapName === undefined) return;
    const accumulator = this.sink.dimensions[dimension];
    const factor = this.factors[dimension];
    const reportsVelocity = dimension === 'imprecisionDynamics';
    if (reportsVelocity) accumulator.enableVelocityReporting();

    for (const environment of environmentsOf(this.performance)) {
      const map = environment.maps.get(mapName);
      if (map === undefined) continue;
      for (const entry of orderedEntries(map)) {
        const element = entry.element;
        const localName = element.getLocalName();
        if (!DISTRIBUTION_ELEMENTS.includes(localName)) continue;
        // `<distribution.list>` is the one group that lives on children rather than on the
        // distribution element, so the registry's site — and therefore the group lookup — is
        // keyed on `<measurement>`.
        const listed = localName === DISTRIBUTION_LIST_ELEMENT;
        const groupElement = listed ? MEASUREMENT_ELEMENT : localName;
        const attributes = imprecisionGroupAttributes(dimension, groupElement);
        const targets = listed
          ? element.getChildElements(MEASUREMENT_ELEMENT).toArray()
          : [element];
        if (attributes.length === 0) continue;
        accumulator.markPresent();

        const site = instructionSiteRef(environment, mapName, entry, localName);
        const planned: { element: Element; attribute: string; value: number }[] = [];
        let failed: string | null = null;
        for (const target of targets) {
          for (const attribute of attributes) {
            const row = rowForIn(dimension, target.getLocalName(), attribute);
            if (row === null || readAttributeValue(target, attribute) === null) continue;
            const value = readNumericAttributeValue(target, attribute);
            const transformed = gateAndTransform(row, unparameterizedSpaceOf(row), value, factor);
            if (!transformed.ok) {
              failed = `@${attribute}: ${transformed.error.detail}`;
              break;
            }
            planned.push({ element: target, attribute, value: transformed.value });
          }
          if (failed !== null) break;
        }
        if (failed !== null) {
          accumulator.countSkipped();
          this.sink.note(
            'atomic-group-skipped',
            dimension,
            site,
            `${failed} — a distribution's width attributes scale as one group, so none ` +
              'of them is written',
          );
          continue;
        }
        if (planned.length === 0) {
          accumulator.countInert();
          continue;
        }

        let writes = 0;
        let magnitude = 0;
        for (const write of planned) {
          writes += writeNumber(write.element, write.attribute, write.value) === 'written' ? 1 : 0;
          magnitude = Math.max(magnitude, Math.abs(write.value));
        }
        accumulator.countTransformed(writes);
        if (reportsVelocity) accumulator.contributeVelocity(0, magnitude);

        if (
          dimension === 'imprecisionTiming' &&
          readAttributeValue(element, TIMING_BASIS_ATTRIBUTE) === null
        ) {
          this.sink.note(
            'derived-timing-basis',
            dimension,
            site,
            'without @milliseconds.timingBasis the sampling grain is DERIVED from exactly the ' +
              'attributes just scaled, so the random sequence is re-indexed and the rendered ' +
              'offsets are not s× the originals',
          );
        }
      }
    }
  }

  /** nothing here reads tuning.offset, so the domain is reported, never offered. */
  private reportInertTuningDomain(): void {
    for (const environment of environmentsOf(this.performance)) {
      const map = environment.maps.get(INERT_IMPRECISION_MAP);
      if (map === undefined) continue;
      this.sink.note(
        'tuning-domain-inert',
        null,
        siteRefOf(environment, INERT_IMPRECISION_MAP, map, map, 'imprecisionMap.tuning'),
        'nothing in this codebase reads tuning.offset, so the whole domain is inert by ' +
          'construction and is reported rather than offered as a knob that cannot be heard',
      );
    }
  }

  // --- pedalShape ------------------------------------------------------------------------

  /**
   * `<movement>@curvature` and `@protraction` — the same Bézier pair as dynamics, in `movementMap`.
   *
   * They move the instant at which the pedal level crosses the receiver's on/off point —
   * half-pedalling and pedal-lift speed — without touching any date. The validation gate is
   * load-bearing because this family has NO clamps of its own: an out-of-range control point
   * makes the date component non-monotone, and the sampler then emits `<position>` events whose
   * dates go backwards, which `GenericMap` silently reorders.
   *
   * {@link movementInertReason} carries the three inert cases.
   */
  private applyPedalShape(): void {
    const accumulator = this.sink.dimensions.pedalShape;
    const rows = rowsOf('pedalShape');
    const factor = this.factors.pedalShape;

    for (const environment of environmentsOf(this.performance)) {
      const map = environment.maps.get(MOVEMENT_MAP);
      if (map === undefined) continue;
      const entries = orderedEntries(map);
      const movements = entries.filter((entry) => entry.element.getLocalName() === 'movement');
      for (const [index, entry] of movements.entries()) {
        const element = entry.element;
        const present = rows.filter((row) => readAttributeValue(element, row.attribute) !== null);
        if (present.length === 0) continue;
        accumulator.markPresent();

        const inertReason = movementInertReason(element, index === movements.length - 1);
        for (const row of present) {
          const site = instructionSiteRef(environment, MOVEMENT_MAP, entry, row.attribute);
          if (inertReason !== null) {
            accumulator.countInert();
            this.sink.note('movement-inert', 'pedalShape', site, inertReason);
            continue;
          }
          const result = this.transformAttribute(row, element, site, factor);
          if (result.value === null) accumulator.countSkipped();
          else accumulator.countTransformed(result.writes);
        }
      }
    }
  }
}

// --- Shared shapes and small helpers -------------------------------------------------------

interface InstructionContext {
  readonly environment: MpmEnvironment;
  readonly mapName: string;
  readonly entries: readonly DatedEntry[];
  readonly viewIndex: number;
  readonly entry: DatedEntry;
  readonly element: Element;
}

interface DefContext {
  readonly environment: MpmEnvironment;
  readonly collectionName: string;
  readonly styleDef: Element;
  readonly def: Element;
  /** `'rubatoStyles/MEI export'` — the `SiteRef` container label for a def under it. */
  readonly container: string;
}

/** One site's rubato window: which bounds it physically carries, and where to report them. */
interface RubatoSite {
  readonly element: Element;
  readonly site: SiteRef;
  readonly lateStart: number | null;
  readonly earlyEnd: number | null;
  crossSite?: boolean;
}

/**
 * Whether an element's effective window draws one bound from the element and the other from
 * its def — the cross-site condition, stated exactly.
 *
 * An element that overrides BOTH bounds is self-contained and leaves the def free; an element
 * that overrides NEITHER inherits the def's window whole; an element that overrides one where
 * the def supplies neither falls back to `resolveRubato`'s own neutral, which is not a second
 * site. Only the mixed case couples them.
 */
function crossesSites(element: RubatoSite, def: RubatoSite): boolean {
  const lateFromDef = element.lateStart === null && def.lateStart !== null;
  const earlyFromDef = element.earlyEnd === null && def.earlyEnd !== null;
  const lateFromElement = element.lateStart !== null;
  const earlyFromElement = element.earlyEnd !== null;
  return (lateFromElement && earlyFromDef) || (lateFromDef && earlyFromElement);
}

/**
 * the per-document rubato bound: the `s` at which `1 − (1−t)^s` first reaches
 * `1 − minWindow`, i.e. `ln(minWindow) / ln(1 − t)`.
 *
 * Past it the guard rather than the arithmetic decides the window, which is exactly what the design
 * promises to report rather than bake in. Null for an untrimmed window, which never reaches it.
 */
function guardBoundFor(totalTrim: number, minWindow: number): number | null {
  if (!(totalTrim > 0) || totalTrim >= 1) return null;
  const bound = Math.log(minWindow) / Math.log(1 - totalTrim);
  return Number.isFinite(bound) ? bound : null;
}

function smallerBound(current: number | null, candidate: number | null): number | null {
  if (candidate === null) return current;
  return current === null ? candidate : Math.min(current, candidate);
}

/** the three inert cases, or null when the movement is rendered and its curve observable. */
function movementInertReason(element: Element, isLast: boolean): string | null {
  if (isLast) {
    return (
      'the last movement of a map is never rendered — a movement is a transition TOWARDS ' +
      'the next one'
    );
  }
  const target = presentNumber(element, TRANSITION_TO_ATTRIBUTE);
  if (target === null) {
    return (
      'without @transition.to a movement renders as a degenerate three-event stack, on ' +
      'which the curve parameters do nothing'
    );
  }
  const position = presentNumber(element, 'position');
  if (position !== null && position === target) {
    return (
      'a flat segment (@transition.to === @position) makes both curve parameters ' + 'unobservable'
    );
  }
  return null;
}

/** the three attributes inline duration precedence arbitrates between. */
function isDurationLever(attribute: string): boolean {
  return INLINE_DURATION_PRECEDENCE.includes(attribute);
}

/** `parseFloat` of an attribute that is physically present, or null when it is not. */
function presentNumber(element: Element, attribute: string): number | null {
  return readAttributeValue(element, attribute) === null
    ? null
    : readNumericAttributeValue(element, attribute);
}

/**
 * The last `<defElement name="name">` child of a `styleDef`, or null.
 *
 * LAST, because `GenericStyle.parseDefs` builds its index by assigning into a map keyed by
 * name in document order, so a duplicate name silently keeps the later element.
 */
function findNamedDef(styleDef: Element, defElement: string, name: string): Element | null {
  let found: Element | null = null;
  for (const def of styleDef.getChildElements(defElement)) {
    if (readAttributeValue(def, 'name') === name) found = def;
  }
  return found;
}

/**
 * One bound of an ornament frame: the row that governs it, the attribute that physically
 * carries it, its number, and the unit bytes that number has to be put back under.
 *
 * The attribute is carried separately from `row.attribute` for one case: a v3 spread may spell
 * its offset `frame.start`, the legacy alias the v3 reader still accepts, governed by
 * the `frame.start` row — the same signed gain over the same domain, so the alias needs no row
 * of its own. Keeping the physical name is what makes every gate message name an attribute the
 * caller can find.
 */
interface FrameBound {
  readonly row: RegistryRow;
  readonly attribute: string;
  readonly value: number;
  readonly suffix: TemporalSuffix;
}

/**
 * Why a frame cannot be scaled at all.
 *
 * A refusal is a property of the PAIR rather than of one value — an unreadable v3 value, a v3
 * length whose absence is not neutral, or a bound the gate turned down — so it carries the
 * attribute that caused it plus the whole explanation, and the caller turns it into one
 * `atomic-group-skipped` note.
 */
interface FrameRefusal {
  readonly attribute: string;
  readonly detail: string;
}

/**
 * A frame read off one `<temporalSpread>`, or the reason it cannot be scaled at all.
 *
 * Also the type of the frame after the gate has run over it: reading and transforming produce
 * the same shape, so `andThen` chains them and the two refusal paths are one.
 */
type FrameReading = Result<readonly FrameBound[], FrameRefusal>;

/**
 * The v2 frame: bare doubles under `parseFloat`, byte-frozen in both directions.
 *
 * `parseFloat` is the renderer's own reading here (`TemporalSpread`'s v2 branch), lenience
 * included, and an absent bound is genuinely at its neutral — both v2 defaults are 0.0 — so it
 * is simply not a site. This reader cannot fail; the `Result` is always `ok`.
 */
function readV2Frame(spread: Element): FrameReading {
  return ok(
    filterMap([FRAME_START_ATTRIBUTE, FRAME_LENGTH_ATTRIBUTE], (attribute) =>
      readAttributeValue(spread, attribute) === null
        ? null
        : {
            row: requireRow(TEMPORAL_SPREAD_ELEMENT, attribute),
            attribute,
            value: readNumericAttributeValue(spread, attribute),
            suffix: '',
          },
    ),
  );
}

/**
 * The v3 frame: two {@link parseTemporalText} values, each keeping its own unit spelling.
 *
 * Two refusals live here rather than in the gate, because neither is a property of a number.
 *
 * - An unreadable value. The v3 grammar is far narrower than `parseFloat` — no exponent, no
 *   leading dot, no `+` — and the renderer answers a violation by ignoring the attribute and
 *   applying its default. Sliding such a value onto the v2 numeric path instead would read
 *   `frameLength="80abc"` as 80 and write back `"160"`, inventing a well-formed frame out of a
 *   malformed one.
 * - An absent `@frameLength`, which in v3 is `100%` of the principal note
 *   (`temporalSpread.xml:38`) rather than v2's neutral 0 — see `applyOrnamentSpread`. The pair
 *   is refused whole.
 */
function readV3Frame(spread: Element): FrameReading {
  const offsetAttribute = v3FrameOffsetAttribute(spread);
  const bounds: FrameBound[] = [];
  for (const attribute of [offsetAttribute, FRAME_LENGTH_ATTRIBUTE]) {
    if (attribute === null) continue;
    const raw = readAttributeValue(spread, attribute);
    if (raw === null) continue;
    const temporal = parseTemporalText(raw);
    if (temporal === null) {
      return err({
        attribute,
        detail:
          `@${attribute} = ${JSON.stringify(raw)} is no MPM v3 temporal value (a decimal ` +
          'number, optionally suffixed ms, % or ticks), so the renderer ignores it and applies ' +
          'its default — the frame is one geometric pair, so neither bound is written',
      });
    }
    bounds.push({
      row: requireRow(TEMPORAL_SPREAD_ELEMENT, attribute),
      attribute,
      value: temporal.value,
      suffix: temporal.suffix,
    });
  }
  if (bounds.length > 0 && readAttributeValue(spread, FRAME_LENGTH_ATTRIBUTE) === null) {
    return err({
      attribute: FRAME_LENGTH_ATTRIBUTE,
      detail:
        '@frameLength is absent, and in v3 an absent @frameLength is 100% of the principal ' +
        'note rather than v2’s 0.0 — so the missing bound is not at its neutral, and scaling ' +
        'the offset alone would move the figure without resizing it. Nothing is created and ' +
        'neither bound is written',
    });
  }
  return ok(bounds);
}

/** One bound's domain and where that domain came from, for the v3 `frame-time-unit` note. */
function frameDomainPhrase(spread: Element, bound: FrameBound): string {
  const domain = resolveTemporalDomain(bound.suffix, spread);
  if (bound.suffix !== '') return `@${bound.attribute} = ${domain} (its own "${bound.suffix}")`;
  const legacy = readAttributeValue(spread, FRAME_TIME_UNIT_ATTRIBUTE);
  const source =
    legacy === null
      ? 'no suffix and no @time.unit, so the ticks default'
      : `no suffix, so the legacy @time.unit = ${JSON.stringify(legacy)}`;
  return `@${bound.attribute} = ${domain} (${source})`;
}

/** A registry row that must exist. Its absence is a programmer error, not a document one. */
function requireRow(elementLocalName: string, attribute: string): RegistryRow {
  const row = rowFor(elementLocalName, attribute);
  if (row === null) {
    throw new Error(`the registry has no row for ${elementLocalName}@${attribute}`);
  }
  return row;
}

/**
 * A row's scale space with no run-time parameter to bind — every row except the two kinds that
 * have one.
 *
 * The throw is unreachable by construction: `level` rows are handled by `levels.ts`, which
 * supplies the center, and `joint-trim` rows by `applyRubatoWindow`, which calls the pair
 * transform directly. Neither ever reaches this function.
 */
function unparameterizedSpaceOf(row: RegistryRow): ScaleSpace {
  const space = bindRowSpace(row.space, null);
  if (space === null) {
    throw new Error(`@${row.attribute} has no scalar scale space (${row.space.kind})`);
  }
  return space;
}

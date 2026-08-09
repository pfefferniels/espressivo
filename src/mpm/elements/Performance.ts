import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import {
  allChildElements,
  attribute,
  firstChildElement,
  getAttributeValue,
} from '../../xml/tree.js';
import {
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  MPM_NAMESPACE,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
} from '../names.js';
import { KeyValue } from '../../supplementary/KeyValue.js';
import { Global } from './Global.js';
import { Part } from './Part.js';
import { GenericMap } from './maps/GenericMap.js';
import type { RenderContext, RenderOptions } from '../RenderOptions.js';
import type { Msm } from '../../msm/Msm.js';
import type { TempoMap } from './maps/TempoMap.js';
import type { DynamicsMap } from './maps/DynamicsMap.js';
import type { RubatoMap } from './maps/RubatoMap.js';
import type { AsynchronyMap } from './maps/AsynchronyMap.js';
import type { ImprecisionMap } from './maps/ImprecisionMap.js';
import type { MetricalAccentuationMap } from './maps/MetricalAccentuationMap.js';
import type { OrnamentationMap } from './maps/OrnamentationMap.js';
import type { ArticulationMap } from './maps/ArticulationMap.js';
import type { MovementMap } from './maps/MovementMap.js';

/**
 * The symbolic → millisecond domain boundary, expressed as a type.
 *
 * Every pass after the tempo pass reads `milliseconds.date`, and the tempo pass is the only
 * thing that writes it. Until T19 nothing said so except the order of the statements in
 * {@link Performance.perform}: T7 and T8 both recorded that `ArticulationMap`'s two passes
 * and `OrnamentationMap`'s three are sequenced by that convention alone. Now the
 * millisecond-domain stages take a `Timed<…>`, and the only things that produce one are
 * {@link Performance.renderGlobalTiming} and {@link Performance.renderPartTiming}, so
 * hoisting a millisecond pass above the tempo pass is a compile error rather than a silent
 * change of output.
 *
 * The marker is a phantom property in the sense of `src/units.ts`: `timed` is `declare`d, so
 * it has no runtime existence and no value can carry it. The mechanism therefore emits
 * nothing at all — the two `as Timed<…>` assertions in the timing stages are the only, and
 * deliberately conspicuous, way across the boundary.
 */
declare const timed: unique symbol;
type Timed<T> = T & { readonly [timed]: true };

/**
 * The twelve MPM instruction maps in effect for one render scope: either the {@link Global}
 * environment, or one {@link Part} with the global maps as its per-field fallback (a local
 * map shadows the global one of the same type — see {@link Performance.resolvePartMaps}).
 */
interface MpmMaps {
  readonly rubato: RubatoMap | null;
  readonly tempo: TempoMap | null;
  readonly asynchrony: AsynchronyMap | null;
  readonly imprecisionTiming: ImprecisionMap | null;
  readonly imprecisionDynamics: ImprecisionMap | null;
  readonly imprecisionToneduration: ImprecisionMap | null;
  readonly imprecisionTuning: ImprecisionMap | null;
  readonly dynamics: DynamicsMap | null;
  readonly movement: MovementMap | null;
  readonly metricalAccentuation: MetricalAccentuationMap | null;
  readonly ornamentation: OrnamentationMap | null;
  readonly articulation: ArticulationMap | null;
}

/** The MSM maps of one scope, collected and primed for the render passes. */
interface CollectedMaps {
  /**
   * Every collected map, in collection order. Rubato and tempo run over this whole list;
   * the individually named maps below are the ones later stages also address on their own.
   */
  readonly maps: readonly GenericMap[];
  readonly timeSignatureMap: GenericMap | null;
  readonly pedalMap: GenericMap | null;
}

/** {@link CollectedMaps} for a part, which additionally has a `score`. */
interface PartMaps extends CollectedMaps {
  readonly score: GenericMap | null;
}

/** {@link PartMaps} plus the two maps the part's render passes create. */
interface PartRender extends PartMaps {
  readonly channelVolumeMap: GenericMap | null;
  readonly positionMap: GenericMap | null;
}

/**
 * An MPM `<performance>` element: one complete interpretation of a piece.
 * Port of meico.mpm.elements.Performance
 *
 * A performance owns a {@link Global} environment (style definitions and instruction maps
 * that apply to every part) and a list of {@link Part}s (the same, per MSM part). Its
 * reason to exist is {@link perform}, which reads an MSM and returns an augmented copy
 * carrying millisecond timing, velocities and articulation — see that method's comment for
 * the stage order, which is the load-bearing part of this class.
 *
 * NOTE ON THE `import type` BLOCK ABOVE: every map class is imported *for its type only*,
 * originally because a value import would have closed an import cycle through `Mpm`. T18
 * removed that cycle (RULE M3), so the constraint is gone — but the *consequence* is still
 * here: this file cannot call the maps' **static** methods, which is why
 * {@link renderTempoToMap} and {@link renderMillisecondsModifiersToMap} exist as private
 * re-implementations of `TempoMap.renderTempoToMap` and
 * `OrnamentationMap.renderMillisecondsModifiersToMap`.
 *
 * T19 RULING ON COLLAPSING THE TWO COPIES — declined, deliberately, and not to be reopened
 * without the evidence named here. Both copies' **bodies** are currently character-identical
 * to their originals — 907 and 2140 characters, brace to brace, against `TempoMap.ts:335-357`
 * and `OrnamentationMap.ts:406-448`; only the `private` keyword and the line wrapping it
 * forces differ. So the "keep them in sync" hazard is discharged as a measured fact as of
 * T19, and is re-checkable in one diff. Removing them
 * would require a **value** import of `TempoMap` and `OrnamentationMap` here, which changes
 * this module's ESM evaluation order on the byte-compared rendering path — a module-graph
 * risk, for no behavioural gain, inside the item whose own charter freezes that path.
 * §8.8 does not ask for it. It belongs with T21's audits, where the load-order tooling
 * (`import/no-cycle`, the deep-import battery) is already being run for other reasons.
 */
export class Performance extends AbstractXmlSubtree {
  private nameAttr: Attribute | null = null;
  private pulsesPerQuarter = 720;
  private global: Global | null = null;
  private readonly parts: Part[] = [];

  private constructor() {
    super();
  }

  /**
   * Create a performance from scratch (`name`, optionally `pulsesPerQuarter` and `id`) or
   * by parsing an existing `<performance>` element. Returns null — after logging — instead
   * of throwing, which is how every factory in this cluster reports a malformed input.
   */
  static createPerformance(
    name: string,
    pulsesPerQuarter?: number,
    id?: string,
  ): Performance | null;
  static createPerformance(xml: Element): Performance | null;
  static createPerformance(
    nameOrXml: string | Element,
    pulsesPerQuarter?: number,
    id?: string,
  ): Performance | null {
    try {
      const p = new Performance();
      if (typeof nameOrXml === 'string') {
        const performance = new Element('performance', MPM_NAMESPACE);
        performance.addAttribute(new Attribute('name', nameOrXml));
        p.parseData(performance);
        if (pulsesPerQuarter !== undefined) p.setPulsesPerQuarter(pulsesPerQuarter);
        if (id !== undefined) p.setId(id);
      } else {
        p.parseData(nameOrXml);
      }
      return p;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying, so the attributes cached below ({@link nameAttr},
   * {@link id}, the `pulsesPerQuarter` attribute) stay live views onto that element and
   * the setters write through to the document.
   *
   * Parsing is not read-only: a `<performance>` without `pulsesPerQuarter` gets one added
   * (defaulting to 720) and one without a `<global>` child gets an empty one appended, so
   * that every performance is renderable afterwards. `<part>` children that fail to parse
   * are skipped with a logged error rather than aborting the whole performance.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Performance object. XML Element is null.');
    const name = attribute('name', xml);
    if (name === null || name.getValue() === '')
      throw new Error('Cannot generate Performance object. Attribute name is missing or empty.');
    this.setXml(xml);
    this.nameAttr = attribute('name', this.getXml());
    this.id = attribute('id', this.getXml());

    let ppqAtt = attribute('pulsesPerQuarter', this.getXml());
    if (ppqAtt === null) {
      ppqAtt = new Attribute('pulsesPerQuarter', '720');
      this.getXml().addAttribute(ppqAtt);
      this.pulsesPerQuarter = 720;
    } else {
      this.pulsesPerQuarter = parseInt(ppqAtt.getValue());
    }

    const globalElt = firstChildElement('global', this.getXml());
    if (globalElt === null) {
      this.global = Global.createGlobal()!;
      this.getXml().appendChild(this.global.getXml());
    } else {
      this.global = Global.createGlobal(globalElt);
    }

    const parts = allChildElements(this.getXml(), 'part');
    for (const element of parts) {
      const part = Part.createPart(element);
      if (part === null) continue;
      part.setGlobal(this.global);
      this.parts.push(part);
    }
  }

  size(): number {
    return this.parts.length;
  }
  getAllParts(): readonly Part[] {
    return this.parts;
  }

  /**
   * Three genuinely different lookups, which is why these overloads are not collapsed onto
   * a union or an optional parameter: by part number, by part name, or by the MIDI
   * channel/port pair. `getPart(1)` and `getPart(1, 0)` answer different questions, and the
   * signature is the only place that says so. Each returns the *first* match.
   */
  getPart(number: number): Part | null;
  getPart(name: string): Part | null;
  getPart(midiChannel: number, midiPort: number): Part | null;
  getPart(arg1: number | string, arg2?: number): Part | null {
    if (typeof arg1 === 'string') {
      for (const p of this.parts) if (p.getName() === arg1) return p;
      return null;
    }
    if (arg2 !== undefined) {
      for (const p of this.parts)
        if (p.getMidiChannel() === arg1 && p.getMidiPort() === arg2) return p;
      return null;
    }
    for (const p of this.parts) if (p.getNumber() === arg1) return p;
    return null;
  }

  addPart(part: Part): boolean {
    if (part === null || this.parts.includes(part)) return false;
    const parent = part.getXml().getParent();
    if (parent === null || parent !== this.getXml()) {
      part.getXml().detach();
      this.getXml().appendChild(part.getXml());
    }
    part.setGlobal(this.getGlobal());
    return this.parts.push(part) > 0;
  }

  removePartByNumber(number: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      if (this.parts[i].getNumber() === number) {
        this.getXml().removeChild(this.parts[i].getXml());
        this.parts.splice(i, 1);
      }
    }
  }

  removePartByName(name: string): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      if (this.parts[i].getName() === name) {
        this.getXml().removeChild(this.parts[i].getXml());
        this.parts.splice(i, 1);
      }
    }
  }

  removePart(part: Part): void {
    const idx = this.parts.indexOf(part);
    if (idx !== -1) {
      this.getXml().removeChild(part.getXml());
      this.parts.splice(idx, 1);
    }
  }

  getGlobal(): Global | null {
    return this.global;
  }
  getName(): string {
    return this.nameAttr!.getValue();
  }
  setName(name: string): void {
    this.nameAttr!.setValue(name);
  }
  getPulsesPerQuarter(): number {
    return this.pulsesPerQuarter;
  }
  getPPQ(): number {
    return this.getPulsesPerQuarter();
  }
  setPulsesPerQuarter(ppq: number): void {
    this.pulsesPerQuarter = ppq;
    attribute('pulsesPerQuarter', this.getXml())!.setValue(String(ppq));
  }
  setPPQ(ppq: number): void {
    this.setPulsesPerQuarter(ppq);
  }

  getCorrespondingPart(msmPart: Element | null): Part | null {
    if (msmPart === null) return null;
    let mpmPart = this.getPart(parseInt(getAttributeValue('number', msmPart)));
    if (mpmPart === null) {
      mpmPart = this.getPart(getAttributeValue('name', msmPart));
    }
    return mpmPart;
  }

  /**
   * Wrap one named MSM map (`score`, `timeSignatureMap`, `pedalMap`, …) found under
   * `msmDated` in a {@link GenericMap}, register it for timing processing and prime its
   * elements with the `.perf` and `modified` attributes that the render passes write into.
   *
   * Two effects the callers depend on: the map is **appended to `list`**, which is the
   * collection {@link perform} later runs rubato and tempo over, *and* it is returned so a
   * caller can also address it individually. Returning null means the MSM has no such map.
   */
  private static addMsmMapToList(
    mapName: string,
    msmDated: Element | null,
    list: GenericMap[],
  ): GenericMap | null {
    if (msmDated === null) return null;
    const e = firstChildElement(mapName, msmDated);
    if (e !== null) {
      const m = GenericMap.createGenericMap(e);
      if (m !== null) {
        list.push(m);
        Performance.addPerformanceTimingAttributes(m);
        Performance.addModifiedAttributes(m);
        return m;
      }
    }
    return null;
  }

  /**
   * Seed the performance timing attributes: `date.perf` (always), plus `duration.perf` and
   * `date.end.perf` where the symbolic counterparts exist. Every render pass edits these
   * `.perf` attributes and leaves the symbolic `date`/`duration`/`date.end` untouched, so
   * the original musical time stays readable next to the performed time.
   */
  private static addPerformanceTimingAttributes(map: GenericMap | null): void {
    if (map === null || map.isEmpty()) return;
    for (const e of map.getAllElements()) {
      e.getValue().addAttribute(
        new Attribute('date.perf', getAttributeValue('date', e.getValue())),
      );
      const duration = attribute('duration', e.getValue());
      if (duration !== null)
        e.getValue().addAttribute(new Attribute('duration.perf', duration.getValue()));
      const dateEnd = attribute('date.end', e.getValue());
      if (dateEnd !== null)
        e.getValue().addAttribute(new Attribute('date.end.perf', dateEnd.getValue()));
    }
  }

  /** Mark every element of the map as touched by performance rendering (empty `modified`). */
  private static addModifiedAttributes(map: GenericMap | null): void {
    if (map === null || map.isEmpty()) return;
    for (const e of map.getAllElements()) e.getValue().addAttribute(new Attribute('modified', ''));
  }

  /**
   * Render this performance into `msm`: returns an **augmented copy** carrying millisecond
   * timing, velocities, articulation and ornamentation. The input is never modified — the
   * first thing this does is clone it.
   *
   * ## The stage order is the algorithm
   *
   * Every pass mutates the `.perf` / `milliseconds.*` attributes that the *previous* pass
   * produced, so reordering any two of them silently changes the output. Java runs exactly
   * this order (Performance.java:385-548) and so must this. The pipeline is these four
   * stages, and each stage's own comment says what it owes the next one:
   *
   * 1. {@link cloneForRender} — clone, rename, and rescale to this performance's PPQ.
   * 2. {@link resolveGlobalMaps} — the global MPM maps, read once here and reused as the
   *    per-part fallback in stage 4.
   * 3. {@link renderGlobal} — the MSM's global maps.
   * 4. {@link renderParts} — every MSM part, one at a time, via {@link renderPart}.
   *
   * Stages 3 and 4 have the same internal shape: collect the MSM maps, run the symbolic
   * passes, cross into the millisecond domain with the tempo pass, then run the millisecond
   * passes. That crossing used to be a convention held up by statement order; it is now
   * carried by the type system — see {@link Timed}.
   *
   * @param msm the score to perform; left unmodified
   * @param options render knobs (§2.4). Omitting them, or passing `{}`, renders exactly
   *   as this method did before they existed — every default is the historic value.
   * @returns a new Msm with performance data added
   */
  perform(msm: Msm, options?: RenderOptions): Msm {
    console.log(`\nRendering performance "${this.getName()}" into "${msm.getTitle()}".`);

    // One context per call, local to it, passed by reference down the render chain. It is
    // never stored anywhere that outlives this method (RULE I1, boundary 6).
    const ctx: RenderContext = { options: options ?? {}, streamOrdinal: 0 };

    const clone = this.cloneForRender(msm);
    const globalMaps = this.resolveGlobalMaps();
    const globalTimeSignatureMap = this.renderGlobal(clone, globalMaps, ctx);
    this.renderParts(clone, globalMaps, globalTimeSignatureMap, ctx);

    console.log('Performance rendering finished.');
    return clone;
  }

  /**
   * Stage 1. The copy every later stage mutates, named after the performance and rescaled:
   * `convertPPQ` rewrites every symbolic `date`, `date.end` and `duration` to this
   * performance's resolution, and everything downstream assumes that has already happened.
   */
  private cloneForRender(msm: Msm): Msm {
    const clone = msm.clone();
    if (clone.getFile() !== null) {
      const origFile = clone.getFile()!;
      const dotIdx = origFile.lastIndexOf('.');
      const base = dotIdx > 0 ? origFile.substring(0, dotIdx) : origFile;
      clone.setFile(`${base}_${this.getName()}.msm`);
    }

    clone.convertPPQ(this.getPPQ());
    return clone;
  }

  /**
   * Stage 2. The global environment's instruction maps, read once per render. Every part
   * that does not bring its own map of a given type falls back to the one collected here
   * ({@link resolvePartMaps}), so this runs before any rendering.
   */
  private resolveGlobalMaps(): MpmMaps {
    const dated = this.getGlobal()!.getDated()!;
    return {
      rubato: dated.getMap(RUBATO_MAP) as RubatoMap | null,
      tempo: dated.getMap(TEMPO_MAP) as TempoMap | null,
      asynchrony: dated.getMap(ASYNCHRONY_MAP) as AsynchronyMap | null,
      imprecisionTiming: dated.getMap(IMPRECISION_MAP_TIMING) as ImprecisionMap | null,
      imprecisionDynamics: dated.getMap(IMPRECISION_MAP_DYNAMICS) as ImprecisionMap | null,
      imprecisionToneduration: dated.getMap(IMPRECISION_MAP_TONEDURATION) as ImprecisionMap | null,
      imprecisionTuning: dated.getMap(IMPRECISION_MAP_TUNING) as ImprecisionMap | null,
      dynamics: dated.getMap(DYNAMICS_MAP) as DynamicsMap | null,
      movement: dated.getMap(MOVEMENT_MAP) as MovementMap | null,
      metricalAccentuation: dated.getMap(
        METRICAL_ACCENTUATION_MAP,
      ) as MetricalAccentuationMap | null,
      ornamentation: dated.getMap(ORNAMENTATION_MAP) as OrnamentationMap | null,
      articulation: dated.getMap(ARTICULATION_MAP) as ArticulationMap | null,
    };
  }

  /**
   * Stage 3. The MSM's *global* maps: they get their `.perf` attributes, global
   * ornamentation is distributed to the parts it affects, rubato and tempo turn symbolic
   * dates into milliseconds, and asynchrony and timing imprecision then shift them.
   *
   * @returns the global `timeSignatureMap`, which stage 4 needs as the fallback for parts
   *   that have none of their own.
   */
  private renderGlobal(clone: Msm, mpm: MpmMaps, ctx: RenderContext): GenericMap | null {
    console.log('Processing global data.');
    const globalDated = firstChildElement('dated', clone.getGlobal()!);
    const maps: GenericMap[] = [];
    Performance.addMsmMapToList('keySignatureMap', globalDated, maps);
    const timeSignatureMap = Performance.addMsmMapToList('timeSignatureMap', globalDated, maps);
    Performance.addMsmMapToList('sectionMap', globalDated, maps);
    Performance.addMsmMapToList('sequencingMap', globalDated, maps);
    Performance.addMsmMapToList('markerMap', globalDated, maps);
    const pedalMap = Performance.addMsmMapToList('pedalMap', globalDated, maps);
    const collected: CollectedMaps = { maps, timeSignatureMap, pedalMap };

    this.renderGlobalOrnamentation(clone, mpm.ornamentation);
    Performance.renderGlobalMilliseconds(this.renderGlobalTiming(collected, mpm), mpm, ctx);

    return timeSignatureMap;
  }

  /**
   * Global ornamentation, inlined from OrnamentationMap.renderGlobalOrnamentationToParts
   * because this file only type-imports the map classes (see the class comment). It adds
   * modifier attributes to the affected parts' notes; those become performance attributes
   * in the per-part processing further down.
   *
   * PARITY NOTE (divergence, benign, do not "fix" without a decision): the reference
   * guard is `(ornamentationMap == null) || ornamentationMap.isEmpty()`
   * (OrnamentationMap.java:215); this tests only for null. An *empty* global
   * ornamentationMap therefore reaches `renderGlobalOrnamentationMap` here where Java
   * returns early. The reachable behaviour is identical — with no ornament entries the
   * apply loop runs zero times — and the one observable difference, an error logged when
   * neither header is set, cannot occur for a global map, since a `Global` always has a
   * `Header`. Java also evaluates `getAllMsmPartsAffectedByGlobalMap` unconditionally
   * where this skips it when the map is null; that method only reads, so nothing depends
   * on it running.
   */
  private renderGlobalOrnamentation(clone: Msm, ornamentationMap: OrnamentationMap | null): void {
    if (ornamentationMap !== null) {
      const affectedParts = this.getAllMsmPartsAffectedByGlobalMap(clone, ORNAMENTATION_MAP);
      const mapsToOrnament: GenericMap[] = [];
      for (const part of affectedParts) {
        const s = firstChildElement('dated', part);
        if (s !== null) {
          const scoreElt = firstChildElement('score', s);
          if (scoreElt !== null) {
            const m = GenericMap.createGenericMap(scoreElt);
            if (m !== null) mapsToOrnament.push(m);
          }
        }
      }
      ornamentationMap.renderGlobalOrnamentationMap(mapsToOrnament);
    }
  }

  /**
   * The global symbolic → millisecond crossing. Rubato and tempo are interleaved in one
   * pass over the collected maps, exactly as the reference has them: rubato shifts a map's
   * symbolic dates and tempo immediately converts that map, so splitting the loop in two
   * would change which dates tempo sees.
   */
  private renderGlobalTiming(collected: CollectedMaps, mpm: MpmMaps): Timed<CollectedMaps> {
    for (const m of collected.maps) {
      if (mpm.rubato !== null) mpm.rubato.renderRubatoToMap(m);
      Performance.renderTempoToMap(m, this.getPPQ(), mpm.tempo);
    }
    return collected as Timed<CollectedMaps>;
  }

  /** The global millisecond-domain passes: both act on the pedal map, in this order. */
  private static renderGlobalMilliseconds(
    collected: Timed<CollectedMaps>,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): void {
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(collected.pedalMap);
    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(collected.pedalMap, true, ctx);
  }

  /**
   * Stage 4. Every MSM part in document order. A part with no MPM counterpart is still
   * performed — it just falls back to the global maps throughout — but a part with no
   * `<dated>` is skipped entirely, since there is nothing to render into.
   */
  private renderParts(
    clone: Msm,
    globalMaps: MpmMaps,
    globalTimeSignatureMap: GenericMap | null,
    ctx: RenderContext,
  ): void {
    const parts = clone.getParts();
    for (let p = 0; p < parts.size(); ++p) {
      const msmPart = parts.get(p);
      const mpmPart = this.getCorrespondingPart(msmPart);
      if (mpmPart === null)
        console.error(
          `No MPM part found that corresponds to MSM part ${getAttributeValue('number', msmPart)} "${getAttributeValue('name', msmPart)}"`,
        );
      else console.log(`Performing part ${mpmPart.getNumber()}: ${mpmPart.getName()}`);

      const dated = firstChildElement('dated', msmPart);
      if (dated === null) continue;
      this.renderPart(dated, mpmPart, globalMaps, globalTimeSignatureMap, ctx);
    }
  }

  /** One part, as the four phases named in {@link perform}. */
  private renderPart(
    dated: Element,
    mpmPart: Part | null,
    globalMaps: MpmMaps,
    globalTimeSignatureMap: GenericMap | null,
    ctx: RenderContext,
  ): void {
    const collected = Performance.collectPartMaps(dated);
    const mpm = Performance.resolvePartMaps(mpmPart, globalMaps);
    const rendered = this.renderPartSymbolic(dated, collected, mpm, globalTimeSignatureMap, ctx);
    this.renderPartMilliseconds(this.renderPartTiming(rendered, mpm), mpm, ctx);
  }

  /**
   * The instruction maps in effect for one part: its own where it has them, the global one
   * of that type otherwise. A part with no MPM counterpart at all inherits the global set
   * wholesale, which is what the per-field fallback degenerates to.
   *
   * The lookups keep the reference's per-part order (which differs from
   * {@link resolveGlobalMaps}'s — the imprecision maps come last here); `Dated.getMap` is a
   * map read with no side effects, so the order is a readability matter only.
   */
  private static resolvePartMaps(mpmPart: Part | null, globalMaps: MpmMaps): MpmMaps {
    if (mpmPart === null) return globalMaps;
    const dated = mpmPart.getDated()!;
    return {
      rubato: (dated.getMap(RUBATO_MAP) as RubatoMap | null) ?? globalMaps.rubato,
      tempo: (dated.getMap(TEMPO_MAP) as TempoMap | null) ?? globalMaps.tempo,
      asynchrony: (dated.getMap(ASYNCHRONY_MAP) as AsynchronyMap | null) ?? globalMaps.asynchrony,
      dynamics: (dated.getMap(DYNAMICS_MAP) as DynamicsMap | null) ?? globalMaps.dynamics,
      movement: (dated.getMap(MOVEMENT_MAP) as MovementMap | null) ?? globalMaps.movement,
      metricalAccentuation:
        (dated.getMap(METRICAL_ACCENTUATION_MAP) as MetricalAccentuationMap | null) ??
        globalMaps.metricalAccentuation,
      ornamentation:
        (dated.getMap(ORNAMENTATION_MAP) as OrnamentationMap | null) ?? globalMaps.ornamentation,
      articulation:
        (dated.getMap(ARTICULATION_MAP) as ArticulationMap | null) ?? globalMaps.articulation,
      imprecisionTiming:
        (dated.getMap(IMPRECISION_MAP_TIMING) as ImprecisionMap | null) ??
        globalMaps.imprecisionTiming,
      imprecisionDynamics:
        (dated.getMap(IMPRECISION_MAP_DYNAMICS) as ImprecisionMap | null) ??
        globalMaps.imprecisionDynamics,
      imprecisionToneduration:
        (dated.getMap(IMPRECISION_MAP_TONEDURATION) as ImprecisionMap | null) ??
        globalMaps.imprecisionToneduration,
      imprecisionTuning:
        (dated.getMap(IMPRECISION_MAP_TUNING) as ImprecisionMap | null) ??
        globalMaps.imprecisionTuning,
    };
  }

  /**
   * The part's MSM maps, registered for timing processing and primed with the `.perf` and
   * `modified` attributes. `score` comes first because {@link addMsmMapToList} appends in
   * call order and the render passes walk that list.
   */
  private static collectPartMaps(dated: Element): PartMaps {
    const maps: GenericMap[] = [];
    const score = Performance.addMsmMapToList('score', dated, maps);
    Performance.addMsmMapToList('keySignatureMap', dated, maps);
    const timeSignatureMap = Performance.addMsmMapToList('timeSignatureMap', dated, maps);
    Performance.addMsmMapToList('sectionMap', dated, maps);
    Performance.addMsmMapToList('sequencingMap', dated, maps);
    Performance.addMsmMapToList('markerMap', dated, maps);
    Performance.addMsmMapToList('programChangeMap', dated, maps);
    const pedalMap = Performance.addMsmMapToList('pedalMap', dated, maps);
    return { maps, score, timeSignatureMap, pedalMap };
  }

  /**
   * The part's symbolic-domain passes, in this order and for these reasons:
   *
   * - *dynamics first*, because it reads symbolic dates and later passes move them; it also
   *   yields the sub-note `channelVolumeMap`, a **new** map appended to the MSM. With no
   *   dynamicsMap anywhere, every note gets the default velocity instead.
   * - *movement* likewise yields a new `positionMap`.
   * - *metrical accentuation*, before rubato, because rubato shifts the symbolic dates the
   *   accentuation pattern is measured against.
   * - *articulation without its millisecond modifiers* — the millisecond half cannot run
   *   until milliseconds exist, i.e. not before the tempo pass. This split is the reason
   *   `ArticulationMap` has two entry points; {@link Timed} is what now enforces it.
   * - *rubato*, over every map collected for timing processing.
   * - *ornamentation*, still symbolic; its millisecond effects are deferred the same way,
   *   to {@link renderMillisecondsModifiersToMap}.
   *
   * Neither of the two maps this creates is added to `collected.maps`, so neither is
   * reached by the rubato loop above or by the tempo loop of {@link renderPartTiming} —
   * {@link renderPartMilliseconds} gives them their own treatment.
   */
  private renderPartSymbolic(
    dated: Element,
    collected: PartMaps,
    mpm: MpmMaps,
    globalTimeSignatureMap: GenericMap | null,
    ctx: RenderContext,
  ): PartRender {
    const { score } = collected;

    // performance rendering of the part
    let channelVolumeMap: GenericMap | null;
    if (mpm.dynamics !== null) {
      channelVolumeMap = mpm.dynamics.renderDynamicsToMap(score);
    } else {
      // fallback: add default velocity to all notes
      if (score !== null) {
        for (let i = 0; i < score.size(); ++i) {
          const e = score.getElement(i)!;
          if (e.getLocalName() === 'note') e.addAttribute(new Attribute('velocity', '100.0'));
        }
      }
      channelVolumeMap = null;
    }
    if (channelVolumeMap !== null) {
      dated.appendChild(channelVolumeMap.getXml());
      Performance.addPerformanceTimingAttributes(channelVolumeMap);
      Performance.addModifiedAttributes(channelVolumeMap);
    }

    const positionMap = mpm.movement !== null ? mpm.movement.renderMovementToMap(ctx) : null;
    if (positionMap !== null) {
      dated.appendChild(positionMap.getXml());
      Performance.addPerformanceTimingAttributes(positionMap);
      Performance.addModifiedAttributes(positionMap);
    }

    if (mpm.metricalAccentuation !== null)
      mpm.metricalAccentuation.renderMetricalAccentuationToMap(
        score,
        collected.timeSignatureMap !== null ? collected.timeSignatureMap : globalTimeSignatureMap,
        this.getPPQ(),
      );
    if (mpm.articulation !== null)
      mpm.articulation.renderArticulationToMap_noMillisecondModifiers(score);

    for (const m of collected.maps) if (mpm.rubato !== null) mpm.rubato.renderRubatoToMap(m);

    if (mpm.ornamentation !== null) mpm.ornamentation.renderOrnamentationToMap(score);

    return { ...collected, channelVolumeMap, positionMap };
  }

  /**
   * The part's symbolic → millisecond crossing: where symbolic time finally becomes
   * `milliseconds.date` / `milliseconds.date.end`. Everything after this point works in
   * milliseconds, which is what the {@link Timed} return type states.
   */
  private renderPartTiming(rendered: PartRender, mpm: MpmMaps): Timed<PartRender> {
    for (const m of rendered.maps) Performance.renderTempoToMap(m, this.getPPQ(), mpm.tempo);
    return rendered as Timed<PartRender>;
  }

  /**
   * The part's millisecond-domain passes. Every one of them reads `milliseconds.date`, so
   * none may run before {@link renderPartTiming} — hence the {@link Timed} parameter.
   *
   * - *pedal, channelVolume and position maps* get their own tempo/asynchrony treatment —
   *   note `channelVolumeMap` and `positionMap` deliberately skip rubato, which would put
   *   rubato's high-frequency wobble into the dynamics and position curves.
   * - *score*: asynchrony, then articulation's millisecond modifiers, then ornamentation's
   *   ({@link renderMillisecondsModifiersToMap}) — the deferred halves, in that order — and
   *   finally the four imprecision maps.
   *
   * A part with no `<score>` still gets its pedal/volume/position maps rendered; only the
   * score block is skipped.
   */
  private renderPartMilliseconds(
    rendered: Timed<PartRender>,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): void {
    // pedalMap
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.pedalMap);
    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(rendered.pedalMap, true, ctx);

    // channelVolumeMap
    Performance.renderTempoToMap(rendered.channelVolumeMap, this.getPPQ(), mpm.tempo);
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.channelVolumeMap);

    // positionMap
    Performance.renderTempoToMap(rendered.positionMap, this.getPPQ(), mpm.tempo);
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.positionMap);

    // score
    const { score } = rendered;
    if (score === null) return;
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(score);
    if (mpm.articulation !== null)
      mpm.articulation.renderArticulationToMap_millisecondModifiers(score);
    Performance.renderMillisecondsModifiersToMap(score, mpm.ornamentation);

    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionDynamics !== null)
      mpm.imprecisionDynamics.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionToneduration !== null)
      mpm.imprecisionToneduration.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionTuning !== null)
      mpm.imprecisionTuning.renderImprecisionToMap(score, true, ctx);
  }

  /**
   * The MSM parts a *global* map of `mapType` actually reaches: all of them, minus those
   * whose MPM part declares its own map of that type (a local map shadows the global one).
   * Read-only — it builds a new list and touches neither the MSM nor this performance.
   */
  private getAllMsmPartsAffectedByGlobalMap(msm: Msm, mapType: string): Element[] {
    const msmPartsWithoutLocalMap: Element[] = [];

    const parts = msm.getParts();
    for (let i = 0; i < parts.size(); ++i) msmPartsWithoutLocalMap.push(parts.get(i));

    for (const part of this.getAllParts()) {
      if (part.getDated()!.getMap(mapType) !== null) {
        const msmPart = msm.getPart(
          part.getNumber(),
          part.getName(),
          part.getMidiChannel(),
          part.getMidiPort(),
        );
        if (msmPart !== null) {
          const idx = msmPartsWithoutLocalMap.indexOf(msmPart);
          if (idx !== -1) msmPartsWithoutLocalMap.splice(idx, 1);
        }
      }
    }
    return msmPartsWithoutLocalMap;
  }

  /**
   * Mirrors `TempoMap.renderTempoToMap(map, ppq, tempoMap)` (TempoMap.java:450-478),
   * re-implemented here because this file only type-imports the map classes.
   *
   * With a tempoMap it just delegates. Without one the fallback is **1 MIDI tick = 1
   * millisecond**: `date.perf` is copied verbatim into `milliseconds.date`, so the numbers
   * are the symbolic ones and only the attribute name changes. `milliseconds.date.end`
   * comes from `date.end.perf` if present; otherwise, and only if both `duration.perf` and
   * `date.perf` exist, it is computed as their sum — and that sum is written back to
   * `date.end.perf` as well, so an element that arrived with only a duration leaves with an
   * end date. Elements with no `date.perf` are left untouched rather than defaulted.
   */
  private static renderTempoToMap(
    map: GenericMap | null,
    ppq: number,
    tempoMap: TempoMap | null,
  ): void {
    if (tempoMap !== null) {
      tempoMap.renderTempoToMap(map, ppq);
      return;
    }
    if (map === null) return;
    for (let i = 0; i < map.size(); ++i) {
      const e = map.getElement(i)!;
      const dateAtt = attribute('date.perf', e);
      if (dateAtt !== null) e.addAttribute(new Attribute('milliseconds.date', dateAtt.getValue()));
      const endAtt = attribute('date.end.perf', e);
      if (endAtt !== null)
        e.addAttribute(new Attribute('milliseconds.date.end', endAtt.getValue()));
      else {
        const durAtt = attribute('duration.perf', e);
        if (durAtt !== null && dateAtt !== null) {
          const dateEnd = parseFloat(dateAtt.getValue()) + parseFloat(durAtt.getValue());
          e.addAttribute(new Attribute('date.end.perf', String(dateEnd)));
          e.addAttribute(new Attribute('milliseconds.date.end', String(dateEnd)));
        }
      }
    }
  }

  /**
   * OrnamentationMap milliseconds modifiers — mirrors OrnamentationMap.renderMillisecondsModifiersToMap
   * (OrnamentationMap.java:477-509), inlined because this file only type-imports the map classes.
   *
   * ⚠ PARITY-CRITICAL, AND A DIVERGENCE THAT WAS ALREADY FOUND AND FIXED ONCE. Do not
   * restructure, rename or reorder anything inside this method; the arithmetic below is
   * required to be bit-identical to the reference. Documented here so the next reader does
   * not have to reconstruct it from the Java a second time.
   *
   * It turns the three `ornament.*` modifier attributes that the ornamentation pass left on
   * a note into the real `milliseconds.*` performance attributes. Notes without
   * `milliseconds.date` are skipped — that attribute is the reference point every branch
   * below is measured from, so there is nothing to transform without it.
   *
   * 1. `ornament.milliseconds.date.offset` shifts `milliseconds.date` by the offset.
   *    `millisecondsDate` keeps the value read *before* that write, and every case below
   *    uses that pre-shift value plus the offset — never the re-read attribute.
   * 2. `ornament.milliseconds.duration` sets an **absolute** end:
   *    `date + offset + duration`, written to `milliseconds.date.end` if it exists and
   *    *added* to the note if it does not. This is the add-attribute-if-absent case; the
   *    single `millisecondsDateEnd` local here is the same expression Java evaluates twice,
   *    in the same operand order, so the sum is bit-identical either way.
   * 3. Otherwise `ornament.noteoff.shift`, which the ornamentation pass only ever creates
   *    with the value `"true"`, so its mere presence is the signal: the end date shifts by
   *    the same offset as the start, leaving the sounding duration unchanged. The end is
   *    re-read from the attribute here rather than recomputed.
   * 4. Neither modifier present: `milliseconds.date.end` is left exactly as it was.
   */
  private static renderMillisecondsModifiersToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || map === null) return;
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.getValue();
      const millisecondsDateAtt = attribute('milliseconds.date', note);
      if (millisecondsDateAtt === null) continue;
      const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
      const ornamentMillisecondsDateAtt = attribute('ornament.milliseconds.date.offset', note);
      let ornamentMillisecondsDateOffset = 0.0;
      if (ornamentMillisecondsDateAtt !== null) {
        ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
      }

      const millisecondsDateEndAtt = attribute('milliseconds.date.end', note);
      const ornamentMillisecondsDurationAtt = attribute('ornament.milliseconds.duration', note); // does the ornament set an absolute duration?
      if (ornamentMillisecondsDurationAtt !== null) {
        // apply it to milliseconds.date.end
        const millisecondsDateEnd = String(
          millisecondsDate +
            ornamentMillisecondsDateOffset +
            parseFloat(ornamentMillisecondsDurationAtt.getValue()),
        );
        if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(millisecondsDateEnd);
        else note.addAttribute(new Attribute('milliseconds.date.end', millisecondsDateEnd));
      } else {
        // act according to noteoff.shift
        const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
        if (ornamentNoteoffShiftAtt !== null) {
          // this attribute is only created when its value is "true", so we need to update milliseconds.date.end; thus, the duration stays the same
          if (millisecondsDateEndAtt !== null)
            millisecondsDateEndAtt.setValue(
              String(
                parseFloat(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset,
              ),
            );
        } // else, ornament.noteoff.shift="false", so milliseconds.date.end remains unaltered
      }
    }
  }
}

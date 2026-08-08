import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import {
  allChildElements,
  attribute,
  firstChildElement,
  getAttributeValue,
} from '../../xml/tree.js';
import { Mpm } from '../../mpm/Mpm.js';
import { KeyValue } from '../../supplementary/KeyValue.js';
import { Global } from './Global.js';
import { Part } from './Part.js';
import { GenericMap } from './maps/GenericMap.js';
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
 * An MPM `<performance>` element: one complete interpretation of a piece.
 * Port of meico.mpm.elements.Performance
 *
 * A performance owns a {@link Global} environment (style definitions and instruction maps
 * that apply to every part) and a list of {@link Part}s (the same, per MSM part). Its
 * reason to exist is {@link perform}, which reads an MSM and returns an augmented copy
 * carrying millisecond timing, velocities and articulation — see that method's comment for
 * the stage order, which is the load-bearing part of this class.
 *
 * NOTE ON THE `import type` BLOCK ABOVE: every map class is imported *for its type only*.
 * That is deliberate — a value import would close an import cycle through `Mpm` (see the
 * IMPORT-ORDER HAZARD note on `GenericStyle`). The price is that this file cannot call the
 * maps' **static** methods, which is why {@link renderTempoToMap} and
 * {@link renderMillisecondsModifiersToMap} exist here as private re-implementations of
 * `TempoMap.renderTempoToMap` and `OrnamentationMap.renderMillisecondsModifiersToMap`.
 * Keep them in sync with their originals; do not "simplify" them into the map classes
 * without breaking the cycle first (item T18).
 */
export class Performance extends AbstractXmlSubtree {
  private nameAttr: Attribute | null = null;
  private pulsesPerQuarter = 720;
  private global: Global | null = null;
  private readonly parts: Part[] = [];
  private id: Attribute | null = null;

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
        const performance = new Element('performance', Mpm.MPM_NAMESPACE);
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
    this.nameAttr = attribute('name', this.getXml()!);
    this.id = attribute('id', this.getXml()!);

    let ppqAtt = attribute('pulsesPerQuarter', this.getXml()!);
    if (ppqAtt === null) {
      ppqAtt = new Attribute('pulsesPerQuarter', '720');
      this.getXml()!.addAttribute(ppqAtt);
      this.pulsesPerQuarter = 720;
    } else {
      this.pulsesPerQuarter = parseInt(ppqAtt.getValue());
    }

    const globalElt = firstChildElement('global', this.getXml()!);
    if (globalElt === null) {
      this.global = Global.createGlobal()!;
      this.getXml()!.appendChild(this.global.getXml()!);
    } else {
      this.global = Global.createGlobal(globalElt);
    }

    const parts = allChildElements(this.getXml()!, 'part');
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
  getAllParts(): Part[] {
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
    const parent = part.getXml()!.getParent();
    if (parent === null || parent !== this.getXml()) {
      part.getXml()!.detach();
      this.getXml()!.appendChild(part.getXml()!);
    }
    part.setGlobal(this.getGlobal());
    return this.parts.push(part) > 0;
  }

  removePartByNumber(number: number): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      if (this.parts[i].getNumber() === number) {
        this.getXml()!.removeChild(this.parts[i].getXml()!);
        this.parts.splice(i, 1);
      }
    }
  }

  removePartByName(name: string): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      if (this.parts[i].getName() === name) {
        this.getXml()!.removeChild(this.parts[i].getXml()!);
        this.parts.splice(i, 1);
      }
    }
  }

  removePart(part: Part): void {
    const idx = this.parts.indexOf(part);
    if (idx !== -1) {
      this.getXml()!.removeChild(part.getXml()!);
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
    attribute('pulsesPerQuarter', this.getXml()!)!.setValue(String(ppq));
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
   * this order (Performance.java:385-548) and so must this. Reading it as a pipeline:
   *
   * 1. **Clone + PPQ conversion.** `convertPPQ` rescales every symbolic `date`,
   *    `date.end` and `duration` to this performance's resolution. Everything downstream
   *    assumes it has already happened.
   * 2. **Global maps are resolved once** (rubato, tempo, asynchrony, the four imprecision
   *    maps, dynamics, movement, metrical accentuation, ornamentation, articulation) and
   *    reused as the per-part fallback in stage 4.
   * 3. **Global data.** The MSM's global maps get `.perf` attributes, then global
   *    ornamentation is distributed to the parts it affects, then rubato and tempo turn
   *    symbolic dates into milliseconds, then asynchrony and timing imprecision shift them.
   * 4. **Per MSM part**, in this order and for these reasons:
   *    - *dynamics first*, because it reads symbolic dates and later passes move them; it
   *      also yields the sub-note `channelVolumeMap`, a **new** map appended to the MSM.
   *    - *movement* likewise yields a new `positionMap`.
   *    - *metrical accentuation*, before rubato, because rubato shifts the symbolic dates
   *      the accentuation pattern is measured against.
   *    - *articulation without its millisecond modifiers* — the millisecond half cannot run
   *      until milliseconds exist, i.e. not before the tempo pass. This split is the reason
   *      `ArticulationMap` has two entry points, and nothing but this ordering enforces it.
   *    - *rubato*, over every map collected for timing processing.
   *    - *ornamentation*, still symbolic; its millisecond effects are deferred the same way.
   *    - *tempo*, which is where symbolic time finally becomes `milliseconds.date` /
   *      `milliseconds.date.end`. Everything after this point works in milliseconds.
   *    - *pedal, channelVolume and position maps* get their own tempo/asynchrony treatment
   *      — note `channelVolumeMap` and `positionMap` deliberately skip rubato, which would
   *      put rubato's high-frequency wobble into the dynamics and position curves.
   *    - *score*: asynchrony, then articulation's millisecond modifiers, then
   *      ornamentation's ({@link renderMillisecondsModifiersToMap}) — the deferred halves,
   *      in that order — and finally the four imprecision maps.
   *
   * A part with no `<dated>` is skipped entirely; a part with no `<score>` still gets its
   * pedal/volume/position maps rendered before being skipped.
   *
   * @param msm the score to perform; left unmodified
   * @returns a new Msm with performance data added
   */
  perform(msm: Msm): Msm {
    console.log(`\nRendering performance "${this.getName()}" into "${msm.getTitle()}".`);

    const clone = msm.clone();
    if (clone.getFile() !== null) {
      const origFile = clone.getFile()!;
      const dotIdx = origFile.lastIndexOf('.');
      const base = dotIdx > 0 ? origFile.substring(0, dotIdx) : origFile;
      clone.setFile(`${base}_${this.getName()}.msm`);
    }

    clone.convertPPQ(this.getPPQ());

    // get global mpm maps
    const globalRubatoMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.RUBATO_MAP) as RubatoMap | null;
    const globalTempoMap = this.getGlobal()!.getDated()!.getMap(Mpm.TEMPO_MAP) as TempoMap | null;
    const globalAsynchronyMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.ASYNCHRONY_MAP) as AsynchronyMap | null;
    const globalImprecisionMap_timing = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.IMPRECISION_MAP_TIMING) as ImprecisionMap | null;
    const globalImprecisionMap_dynamics = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.IMPRECISION_MAP_DYNAMICS) as ImprecisionMap | null;
    const globalImprecisionMap_toneduration = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.IMPRECISION_MAP_TONEDURATION) as ImprecisionMap | null;
    const globalImprecisionMap_tuning = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.IMPRECISION_MAP_TUNING) as ImprecisionMap | null;
    const globalDynamicsMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
    const globalMovementMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.MOVEMENT_MAP) as MovementMap | null;
    const globalMetricalAccentuationMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.METRICAL_ACCENTUATION_MAP) as MetricalAccentuationMap | null;
    const globalOrnamentationMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
    const globalArticulationMap = this.getGlobal()!
      .getDated()!
      .getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
    let maps: GenericMap[] = [];

    // process global data
    console.log('Processing global data.');
    const globalDated = firstChildElement('dated', clone.getGlobal()!);
    Performance.addMsmMapToList('keySignatureMap', globalDated, maps);
    const globalTimeSignatureMap = Performance.addMsmMapToList(
      'timeSignatureMap',
      globalDated,
      maps,
    );
    Performance.addMsmMapToList('sectionMap', globalDated, maps);
    Performance.addMsmMapToList('sequencingMap', globalDated, maps);
    Performance.addMsmMapToList('markerMap', globalDated, maps);
    const globalPedalMap = Performance.addMsmMapToList('pedalMap', globalDated, maps);

    // Global ornamentation, inlined from OrnamentationMap.renderGlobalOrnamentationToParts
    // because this file only type-imports the map classes (see the class comment). It adds
    // modifier attributes to the affected parts' notes; those become performance attributes
    // in the per-part processing further down.
    //
    // PARITY NOTE (divergence, benign, do not "fix" without a decision): the reference
    // guard is `(ornamentationMap == null) || ornamentationMap.isEmpty()`
    // (OrnamentationMap.java:215); this tests only for null. An *empty* global
    // ornamentationMap therefore reaches `renderGlobalOrnamentationMap` here where Java
    // returns early. The reachable behaviour is identical — with no ornament entries the
    // apply loop runs zero times — and the one observable difference, an error logged when
    // neither header is set, cannot occur for a global map, since a `Global` always has a
    // `Header`. Java also evaluates `getAllMsmPartsAffectedByGlobalMap` unconditionally
    // where this skips it when the map is null; that method only reads, so nothing depends
    // on it running.
    if (globalOrnamentationMap !== null) {
      const affectedParts = this.getAllMsmPartsAffectedByGlobalMap(clone, Mpm.ORNAMENTATION_MAP);
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
      globalOrnamentationMap.renderGlobalOrnamentationMap(mapsToOrnament);
    }

    for (const m of maps) {
      if (globalRubatoMap !== null) globalRubatoMap.renderRubatoToMap(m);
      Performance.renderTempoToMap(m, this.getPPQ(), globalTempoMap);
    }
    if (globalAsynchronyMap !== null) globalAsynchronyMap.renderAsynchronyToMap(globalPedalMap);
    if (globalImprecisionMap_timing !== null)
      globalImprecisionMap_timing.renderImprecisionToMap(globalPedalMap, true);

    // process the msm parts
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
      maps = [];
      const score = Performance.addMsmMapToList('score', dated, maps);
      Performance.addMsmMapToList('keySignatureMap', dated, maps);
      const timeSignatureMap = Performance.addMsmMapToList('timeSignatureMap', dated, maps);
      Performance.addMsmMapToList('sectionMap', dated, maps);
      Performance.addMsmMapToList('sequencingMap', dated, maps);
      Performance.addMsmMapToList('markerMap', dated, maps);
      Performance.addMsmMapToList('programChangeMap', dated, maps);
      const pedalMap = Performance.addMsmMapToList('pedalMap', dated, maps);

      let rubatoMap: RubatoMap | null = null;
      let tempoMap: TempoMap | null = null;
      let asynchronyMap: AsynchronyMap | null = null;
      let dynamicsMap: DynamicsMap | null = null;
      let movementMap: MovementMap | null = null;
      let metricalAccentuationMap: MetricalAccentuationMap | null = null;
      let ornamentationMap: OrnamentationMap | null = null;
      let articulationMap: ArticulationMap | null = null;
      let imprecisionMap_timing: ImprecisionMap | null = null;
      let imprecisionMap_dynamics: ImprecisionMap | null = null;
      let imprecisionMap_toneduration: ImprecisionMap | null = null;
      let imprecisionMap_tuning: ImprecisionMap | null = null;
      if (mpmPart !== null) {
        rubatoMap = mpmPart.getDated()!.getMap(Mpm.RUBATO_MAP) as RubatoMap | null;
        tempoMap = mpmPart.getDated()!.getMap(Mpm.TEMPO_MAP) as TempoMap | null;
        asynchronyMap = mpmPart.getDated()!.getMap(Mpm.ASYNCHRONY_MAP) as AsynchronyMap | null;
        dynamicsMap = mpmPart.getDated()!.getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
        movementMap = mpmPart.getDated()!.getMap(Mpm.MOVEMENT_MAP) as MovementMap | null;
        metricalAccentuationMap = mpmPart
          .getDated()!
          .getMap(Mpm.METRICAL_ACCENTUATION_MAP) as MetricalAccentuationMap | null;
        ornamentationMap = mpmPart
          .getDated()!
          .getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
        articulationMap = mpmPart
          .getDated()!
          .getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
        imprecisionMap_timing = mpmPart
          .getDated()!
          .getMap(Mpm.IMPRECISION_MAP_TIMING) as ImprecisionMap | null;
        imprecisionMap_dynamics = mpmPart
          .getDated()!
          .getMap(Mpm.IMPRECISION_MAP_DYNAMICS) as ImprecisionMap | null;
        imprecisionMap_toneduration = mpmPart
          .getDated()!
          .getMap(Mpm.IMPRECISION_MAP_TONEDURATION) as ImprecisionMap | null;
        imprecisionMap_tuning = mpmPart
          .getDated()!
          .getMap(Mpm.IMPRECISION_MAP_TUNING) as ImprecisionMap | null;
      }

      if (rubatoMap === null) rubatoMap = globalRubatoMap;
      if (tempoMap === null) tempoMap = globalTempoMap;
      if (asynchronyMap === null) asynchronyMap = globalAsynchronyMap;
      if (dynamicsMap === null) dynamicsMap = globalDynamicsMap;
      if (movementMap === null) movementMap = globalMovementMap;
      if (metricalAccentuationMap === null) metricalAccentuationMap = globalMetricalAccentuationMap;
      if (ornamentationMap === null) ornamentationMap = globalOrnamentationMap;
      if (articulationMap === null) articulationMap = globalArticulationMap;
      if (imprecisionMap_timing === null) imprecisionMap_timing = globalImprecisionMap_timing;
      if (imprecisionMap_dynamics === null) imprecisionMap_dynamics = globalImprecisionMap_dynamics;
      if (imprecisionMap_toneduration === null)
        imprecisionMap_toneduration = globalImprecisionMap_toneduration;
      if (imprecisionMap_tuning === null) imprecisionMap_tuning = globalImprecisionMap_tuning;

      // performance rendering of the part
      let channelVolumeMap: GenericMap | null;
      if (dynamicsMap !== null) {
        channelVolumeMap = dynamicsMap.renderDynamicsToMap(score);
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
        dated.appendChild(channelVolumeMap.getXml()!);
        Performance.addPerformanceTimingAttributes(channelVolumeMap);
        Performance.addModifiedAttributes(channelVolumeMap);
      }

      const positionMap = movementMap !== null ? movementMap.renderMovementToMap() : null;
      if (positionMap !== null) {
        dated.appendChild(positionMap.getXml()!);
        Performance.addPerformanceTimingAttributes(positionMap);
        Performance.addModifiedAttributes(positionMap);
      }

      if (metricalAccentuationMap !== null)
        metricalAccentuationMap.renderMetricalAccentuationToMap(
          score,
          timeSignatureMap !== null ? timeSignatureMap : globalTimeSignatureMap,
          this.getPPQ(),
        );
      if (articulationMap !== null)
        articulationMap.renderArticulationToMap_noMillisecondModifiers(score);

      for (const m of maps) if (rubatoMap !== null) rubatoMap.renderRubatoToMap(m);

      if (ornamentationMap !== null) ornamentationMap.renderOrnamentationToMap(score);

      for (const m of maps) Performance.renderTempoToMap(m, this.getPPQ(), tempoMap);

      // pedalMap
      if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(pedalMap);
      if (imprecisionMap_timing !== null)
        imprecisionMap_timing.renderImprecisionToMap(pedalMap, true);

      // channelVolumeMap
      Performance.renderTempoToMap(channelVolumeMap, this.getPPQ(), tempoMap);
      if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(channelVolumeMap);

      // positionMap
      Performance.renderTempoToMap(positionMap, this.getPPQ(), tempoMap);
      if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(positionMap);

      // score
      if (score === null) continue;
      if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(score);
      if (articulationMap !== null)
        articulationMap.renderArticulationToMap_millisecondModifiers(score);
      Performance.renderMillisecondsModifiersToMap(score, ornamentationMap);

      if (imprecisionMap_timing !== null) imprecisionMap_timing.renderImprecisionToMap(score, true);
      if (imprecisionMap_dynamics !== null)
        imprecisionMap_dynamics.renderImprecisionToMap(score, true);
      if (imprecisionMap_toneduration !== null)
        imprecisionMap_toneduration.renderImprecisionToMap(score, true);
      if (imprecisionMap_tuning !== null) imprecisionMap_tuning.renderImprecisionToMap(score, true);
    }

    console.log('Performance rendering finished.');
    return clone;
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

  setId(id: string | null): void {
    if (id === null) {
      if (this.id !== null) {
        this.id.detach();
        this.id = null;
      }
      return;
    }
    if (this.id === null) {
      this.id = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id);
      this.getXml()!.addAttribute(this.id);
      return;
    }
    this.id.setValue(id);
  }
  getId(): string | null {
    return this.id === null ? null : this.id.getValue();
  }
}

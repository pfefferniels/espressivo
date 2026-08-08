import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
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

export class Performance extends AbstractXmlSubtree {
  private nameAttr: Attribute | null = null;
  private pulsesPerQuarter = 720;
  private global: Global | null = null;
  private readonly parts: Part[] = [];
  private id: Attribute | null = null;

  private constructor() {
    super();
  }

  static createPerformance(name: string): Performance | null;
  static createPerformance(name: string, pulsesPerQuarter: number): Performance | null;
  static createPerformance(name: string, pulsesPerQuarter: number, id: string): Performance | null;
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

  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Performance object. XML Element is null.');
    const name = Helper.getAttribute('name', xml);
    if (name === null || name.getValue() === '')
      throw new Error('Cannot generate Performance object. Attribute name is missing or empty.');
    this.setXml(xml);
    this.nameAttr = Helper.getAttribute('name', this.getXml()!);
    this.id = Helper.getAttribute('id', this.getXml()!);

    let ppqAtt = Helper.getAttribute('pulsesPerQuarter', this.getXml()!);
    if (ppqAtt === null) {
      ppqAtt = new Attribute('pulsesPerQuarter', '720');
      this.getXml()!.addAttribute(ppqAtt);
      this.pulsesPerQuarter = 720;
    } else {
      this.pulsesPerQuarter = parseInt(ppqAtt.getValue());
    }

    const globalElt = Helper.getFirstChildElement('global', this.getXml()!);
    if (globalElt === null) {
      this.global = Global.createGlobal()!;
      this.getXml()!.appendChild(this.global.getXml()!);
    } else {
      this.global = Global.createGlobal(globalElt);
    }

    const parts = Helper.getAllChildElements('part', this.getXml()!);
    if (parts) {
      for (const element of parts) {
        const part = Part.createPart(element);
        if (part === null) continue;
        part.setGlobal(this.global);
        this.parts.push(part);
      }
    }
  }

  size(): number {
    return this.parts.length;
  }
  getAllParts(): Part[] {
    return this.parts;
  }

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
    Helper.getAttribute('pulsesPerQuarter', this.getXml()!)!.setValue(String(ppq));
  }
  setPPQ(ppq: number): void {
    this.setPulsesPerQuarter(ppq);
  }

  getCorrespondingPart(msmPart: Element | null): Part | null {
    if (msmPart === null) return null;
    let mpmPart = this.getPart(parseInt(Helper.getAttributeValue('number', msmPart)));
    if (mpmPart === null) {
      mpmPart = this.getPart(Helper.getAttributeValue('name', msmPart));
    }
    return mpmPart;
  }

  private static addMsmMapToList(
    mapName: string,
    msmDated: Element | null,
    list: GenericMap[],
  ): GenericMap | null {
    if (msmDated === null) return null;
    const e = Helper.getFirstChildElement(mapName, msmDated);
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

  private static addPerformanceTimingAttributes(map: GenericMap | null): void {
    if (map === null || map.isEmpty()) return;
    for (const e of map.getAllElements()) {
      e.getValue().addAttribute(
        new Attribute('date.perf', Helper.getAttributeValue('date', e.getValue())),
      );
      const duration = Helper.getAttribute('duration', e.getValue());
      if (duration !== null)
        e.getValue().addAttribute(new Attribute('duration.perf', duration.getValue()));
      const dateEnd = Helper.getAttribute('date.end', e.getValue());
      if (dateEnd !== null)
        e.getValue().addAttribute(new Attribute('date.end.perf', dateEnd.getValue()));
    }
  }

  private static addModifiedAttributes(map: GenericMap | null): void {
    if (map === null || map.isEmpty()) return;
    for (const e of map.getAllElements()) e.getValue().addAttribute(new Attribute('modified', ''));
  }

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
    const globalDated = Helper.getFirstChildElement('dated', clone.getGlobal()!);
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

    if (globalOrnamentationMap !== null) {
      const affectedParts = this.getAllMsmPartsAffectedByGlobalMap(clone, Mpm.ORNAMENTATION_MAP);
      const mapsToOrnament: GenericMap[] = [];
      for (const part of affectedParts) {
        const s = Helper.getFirstChildElement('dated', part);
        if (s !== null) {
          const scoreElt = Helper.getFirstChildElement('score', s);
          if (scoreElt !== null) {
            const m = GenericMap.createGenericMap(scoreElt);
            if (m !== null) mapsToOrnament.push(m);
          }
        }
      }
      (globalOrnamentationMap as any).renderGlobalOrnamentationMap(mapsToOrnament);
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
          `No MPM part found that corresponds to MSM part ${Helper.getAttributeValue('number', msmPart)} "${Helper.getAttributeValue('name', msmPart)}"`,
        );
      else console.log(`Performing part ${mpmPart.getNumber()}: ${mpmPart.getName()}`);

      const dated = Helper.getFirstChildElement('dated', msmPart);
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
   * TempoMap static fallback: when tempoMap is non-null, delegates to instance method;
   * when null, copies date.perf directly as milliseconds.date (identity mapping).
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
      const dateAtt = Helper.getAttribute('date.perf', e);
      if (dateAtt !== null) e.addAttribute(new Attribute('milliseconds.date', dateAtt.getValue()));
      const endAtt = Helper.getAttribute('date.end.perf', e);
      if (endAtt !== null)
        e.addAttribute(new Attribute('milliseconds.date.end', endAtt.getValue()));
      else {
        const durAtt = Helper.getAttribute('duration.perf', e);
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
   */
  private static renderMillisecondsModifiersToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || map === null) return;
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.getValue();
      const millisecondsDateAtt = Helper.getAttribute('milliseconds.date', note);
      if (millisecondsDateAtt === null) continue;
      const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
      const ornamentMillisecondsDateAtt = Helper.getAttribute(
        'ornament.milliseconds.date.offset',
        note,
      );
      let ornamentMillisecondsDateOffset = 0.0;
      if (ornamentMillisecondsDateAtt !== null) {
        ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
      }

      const millisecondsDateEndAtt = Helper.getAttribute('milliseconds.date.end', note);
      const ornamentMillisecondsDurationAtt = Helper.getAttribute(
        'ornament.milliseconds.duration',
        note,
      ); // does the ornament set an absolute duration?
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
        const ornamentNoteoffShiftAtt = Helper.getAttribute('ornament.noteoff.shift', note);
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

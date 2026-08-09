import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { DYNAMICS_STYLE, MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { DynamicsData } from './data/DynamicsData.js';
import { DynamicsStyle } from '../styles/DynamicsStyle.js';

/**
 * An MPM `dynamicsMap`: loudness over the timeline, as constant levels and as
 * crescendo/diminuendo transitions.
 *
 * Rendering has two modes and they use different MIDI mechanisms. Ordinarily each note
 * simply gets the `velocity` its date calls for. But a `<dynamics>` marked
 * `subNoteDynamics` needs loudness to change *while a note sounds*, which velocity
 * cannot express — so those spans instead pin every note to velocity 100 and emit the
 * shape as a channel-volume curve. That is why
 * {@link DynamicsMap.renderDynamicsToMap} returns a second map: the `channelVolumeMap`
 * the MIDI export turns into CC 7 events.
 *
 * Port of meico.mpm.elements.maps.DynamicsMap
 */
export class DynamicsMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createDynamicsMap(xml?: Element): DynamicsMap | null {
    try {
      return xml !== undefined ? new DynamicsMap(xml) : new DynamicsMap('dynamicsMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addDynamics(
    date: number,
    volume: string,
    transitionTo?: string,
    curvature?: number,
    protraction?: number,
    subNoteDynamics?: boolean,
    id?: string,
  ): number {
    const e = new Element('dynamics', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('volume', volume));
    if (transitionTo !== undefined) e.addAttribute(new Attribute('transition.to', transitionTo));
    if (curvature !== undefined)
      e.addAttribute(new Attribute('curvature', String(DynamicsMap.clampCurvature(curvature))));
    if (protraction !== undefined)
      e.addAttribute(
        new Attribute('protraction', String(DynamicsMap.clampProtraction(protraction))),
      );
    if (subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDynamicsFromData(data: DynamicsData): number {
    const e = new Element('dynamics', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.startDate)));
    if (data.volumeString !== null) e.addAttribute(new Attribute('volume', data.volumeString));
    else if (data.volume !== null) e.addAttribute(new Attribute('volume', String(data.volume)));
    else {
      console.error('Cannot add dynamics, volume not specified.');
      return -1;
    }
    if (data.transitionToString !== null)
      e.addAttribute(new Attribute('transition.to', data.transitionToString));
    else if (data.transitionTo !== null)
      e.addAttribute(new Attribute('transition.to', String(data.transitionTo)));
    // The clamped values are written back into `data`, so a caller that reuses the object
    // sees the correction rather than keeping a value the document does not carry.
    if (data.curvature !== null) {
      data.curvature = DynamicsMap.clampCurvature(data.curvature);
      e.addAttribute(new Attribute('curvature', String(data.curvature)));
    }
    if (data.protraction !== null) {
      data.protraction = DynamicsMap.clampProtraction(data.protraction);
      e.addAttribute(new Attribute('protraction', String(data.protraction)));
    }
    if (data.subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    return this.insertElement(new KeyValue(data.startDate, e), false);
  }

  /**
   * Curvature is a fraction of the segment's own extent, so only `[0, 1]` denotes
   * anything; a value outside it is corrected and reported rather than let through into
   * the Bézier's control points. Both boundary guards are applied wherever a curve
   * parameter enters or leaves the map — {@link DynamicsMap.getDynamicsDataOf} on the way
   * in, {@link DynamicsMap.addDynamics} and {@link DynamicsMap.addDynamicsFromData} on
   * the way out — so an out-of-range value can neither be written to a document nor be
   * read back out of one.
   */
  private static clampCurvature(curvature: number): number {
    if (curvature < 0.0) {
      console.error(`Invalid curvature value: ${String(curvature)} < 0.0. Setting it to 0.0.`);
      return 0.0;
    }
    if (curvature > 1.0) {
      console.error(`Invalid curvature value: ${String(curvature)} > 1.0. Setting it to 1.0.`);
      return 1.0;
    }
    return curvature;
  }

  /** Protraction skews the curve towards one end; `[-1, 1]`. See {@link clampCurvature}. */
  private static clampProtraction(protraction: number): number {
    if (protraction < -1.0) {
      console.error(
        `Invalid protraction value: ${String(protraction)} < -1.0. Setting it to -1.0.`,
      );
      return -1.0;
    }
    if (protraction > 1.0) {
      console.error(`Invalid protraction value: ${String(protraction)} > 1.0. Setting it to 1.0.`);
      return 1.0;
    }
    return protraction;
  }

  getDynamicsDataAt(date: number): DynamicsData | null {
    for (let i = this.getElementIndexBeforeAt(date); i >= 0; --i) {
      const dd = this.getDynamicsDataOf(i);
      if (dd !== null) return dd;
    }
    return null;
  }

  /**
   * Read the dynamics instruction at `index` into a {@link DynamicsData}, resolving
   * style-relative names such as `"forte"` through the style in scope (found by scanning
   * backwards for the nearest preceding `<style>`). Returns null if the entry is not a
   * usable `<dynamics>`.
   *
   * The two curve parameters are read only in the transition branch: a constant
   * instruction has no curve for them to shape. Each is clamped to its valid range on the
   * way in (see {@link DynamicsMap.clampCurvature}).
   *
   * When there is no `transition.to`, the instruction is made explicitly constant —
   * `transitionTo` is set equal to `volume` and both curve parameters are zeroed —
   * rather than left null. That keeps {@link DynamicsData.getDynamicsAt} on a single
   * code path instead of having it branch on null.
   */
  getDynamicsDataOf(index: number): DynamicsData | null {
    const i = this.resolveEntryIndex(index, 'dynamics');
    if (i < 0) return null;
    const e = this.elements[i].getValue();
    const dd = new DynamicsData();
    dd.startDate = this.elements[i].getKey();
    dd.endDate = this.getEndDate(i);
    dd.xml = e;
    const att = attribute('id', e);
    if (att !== null) dd.xmlId = att.getValue();
    dd.styleName = this.findStyleNameAt(i) ?? dd.styleName;
    dd.style = this.getStyle(DYNAMICS_STYLE, dd.styleName) as DynamicsStyle | null;
    const volAtt = attribute('volume', e);
    if (volAtt === null) return null;
    dd.volumeString = volAtt.getValue();
    dd.volume = DynamicsStyle.getNumericValueStatic(dd.volumeString, dd.style);
    const ttAtt = attribute('transition.to', e);
    if (ttAtt !== null) {
      dd.transitionToString = ttAtt.getValue();
      dd.transitionTo = DynamicsStyle.getNumericValueStatic(dd.transitionToString, dd.style);
      const curvAtt = attribute('curvature', e);
      if (curvAtt !== null)
        dd.curvature = DynamicsMap.clampCurvature(parseFloat(curvAtt.getValue()));
      const protAtt = attribute('protraction', e);
      if (protAtt !== null)
        dd.protraction = DynamicsMap.clampProtraction(parseFloat(protAtt.getValue()));
    } else {
      dd.transitionToString = dd.volumeString;
      dd.transitionTo = dd.volume;
      dd.curvature = 0.0;
      dd.protraction = 0.0;
    }
    const sndAtt = attribute('subNoteDynamics', e);
    if (sndAtt !== null) dd.subNoteDynamics = sndAtt.getValue() === 'true';
    return dd;
  }

  private getEndDate(index: number): number {
    for (let j = index + 1; j < this.elements.length; ++j) {
      if (this.elements[j].getValue().getLocalName() === 'dynamics')
        return this.elements[j].getKey();
    }
    return Number.MAX_VALUE;
  }

  /**
   * Write a `velocity` onto every note of `map` and return the `channelVolumeMap`
   * needed for the sub-note spans (see the class doc), or null if there is nothing to
   * do.
   *
   * As in {@link TempoMap.renderTempoToMap}, `mapIndex` lives outside the instruction
   * loop and is never rewound, so the two maps are walked once in lockstep.
   *
   * The channel volume is pinned back to 100.0 at the start of every non-sub-note span,
   * but only when it is not already there — otherwise a run of ordinary instructions
   * would emit a redundant CC 7 event apiece. Those entries carry `mandatory="true"`,
   * which stops the MIDI export from optimising them away; without it, the reset after
   * a sub-note curve could be dropped and the curve's final volume would leak into the
   * following notes.
   *
   * Note the asymmetry in the two inner loops: notes *before* the current instruction
   * get a flat 100.0 (nothing has defined their dynamics yet), while a sub-note span
   * skips them instead — its notes are handled by the volume curve, not by velocity.
   */
  renderDynamicsToMap(map: GenericMap | null): GenericMap | null {
    if (map === null || this.elements.length === 0) return null;
    const chanVolMap = GenericMap.createGenericMap('channelVolumeMap');
    let mapIndex = 0;
    for (let dynamicsIndex = 0; dynamicsIndex < this.size(); ++dynamicsIndex) {
      const dd = this.getDynamicsDataOf(dynamicsIndex);
      if (dd === null) continue;

      if (chanVolMap !== null) {
        if (dd.subNoteDynamics && dynamicsIndex < this.size() - 1) {
          // sub-note dynamics: generate volume curve events
          DynamicsMap.generateSubNoteDynamics(dd, chanVolMap);
          for (; mapIndex < map.size(); ++mapIndex) {
            const mapEntry = map.elements[mapIndex];
            if (mapEntry.getKey() < dd.startDate || mapEntry.getValue().getLocalName() !== 'note')
              continue;
            if (mapEntry.getKey() >= dd.endDate!) break;
            mapEntry.getValue().addAttribute(new Attribute('velocity', '100.0'));
          }
          continue;
        }
        // non-sub-note dynamics: add a volume=100 entry to channelVolumeMap
        if (
          chanVolMap.isEmpty() ||
          getAttributeValue('value', chanVolMap.getLastElement()) !== '100.0'
        ) {
          const volE = new Element('volume', chanVolMap.getXml().getNamespaceURI());
          volE.addAttribute(new Attribute('date', String(dd.startDate)));
          volE.addAttribute(new Attribute('value', '100.0'));
          volE.addAttribute(new Attribute('mandatory', 'true'));
          chanVolMap.addElement(volE);
        }
      }

      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        if (mapEntry.getValue().getLocalName() !== 'note') continue;
        if (mapEntry.getKey() < dd.startDate) {
          mapEntry.getValue().addAttribute(new Attribute('velocity', '100.0'));
          continue;
        }
        if (mapEntry.getKey() >= dd.endDate!) break;
        mapEntry
          .getValue()
          .addAttribute(new Attribute('velocity', String(dd.getDynamicsAt(mapEntry.getKey()))));
      }
    }
    return chanVolMap;
  }

  private static generateSubNoteDynamics(
    dynamicsData: DynamicsData,
    channelVolumeMap: GenericMap,
  ): void {
    const subNoteDynamicsSegment = dynamicsData.getSubNoteDynamicsSegment(2.0);
    const es: Element[] = [];
    for (const event of subNoteDynamicsSegment) {
      const e = new Element('volume', channelVolumeMap.getXml().getNamespaceURI());
      e.addAttribute(new Attribute('date', String(event[0])));
      e.addAttribute(new Attribute('value', String(event[1])));
      channelVolumeMap.addElement(e);
      es.push(e);
    }
    if (es.length > 0) es[0].addAttribute(new Attribute('mandatory', 'true'));
  }

  static renderDynamicsToMap(
    map: GenericMap | null,
    dynamicsMap: DynamicsMap | null,
  ): GenericMap | null {
    if (dynamicsMap !== null) return dynamicsMap.renderDynamicsToMap(map);
    if (map === null) return null;
    for (let i = 0; i < map.size(); ++i) {
      const e = map.getElement(i)!;
      if (e.getLocalName() === 'note') e.addAttribute(new Attribute('velocity', '100.0'));
    }
    return null;
  }
}

GenericMap.registerMapFactory('dynamicsMap', (xml) => DynamicsMap.createDynamicsMap(xml));

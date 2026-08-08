import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { DynamicsData } from './data/DynamicsData.js';
import { DynamicsStyle } from '../styles/DynamicsStyle.js';

export class DynamicsMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createDynamicsMap(): DynamicsMap | null;
  static createDynamicsMap(xml: Element): DynamicsMap | null;
  static createDynamicsMap(xml?: Element): DynamicsMap | null {
    try {
      return xml !== undefined ? new DynamicsMap(xml) : new DynamicsMap('dynamicsMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
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
    const e = new Element('dynamics', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('volume', volume));
    if (transitionTo !== undefined) e.addAttribute(new Attribute('transition.to', transitionTo));
    if (curvature !== undefined) e.addAttribute(new Attribute('curvature', String(curvature)));
    if (protraction !== undefined)
      e.addAttribute(new Attribute('protraction', String(protraction)));
    if (subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDynamicsFromData(data: DynamicsData): number {
    const e = new Element('dynamics', Mpm.MPM_NAMESPACE);
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
    if (data.curvature !== null) e.addAttribute(new Attribute('curvature', String(data.curvature)));
    if (data.protraction !== null)
      e.addAttribute(new Attribute('protraction', String(data.protraction)));
    if (data.subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    return this.insertElement(new KeyValue(data.startDate, e), false);
  }

  getDynamicsDataAt(date: number): DynamicsData | null {
    for (let i = this.getElementIndexBeforeAt(date); i >= 0; --i) {
      const dd = this.getDynamicsDataOf(i);
      if (dd !== null) return dd;
    }
    return null;
  }

  getDynamicsDataOf(index: number): DynamicsData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const e = this.elements[index].getValue();
    if (e.getLocalName() !== 'dynamics') return null;
    const dd = new DynamicsData();
    dd.startDate = this.elements[index].getKey();
    dd.endDate = this.getEndDate(index);
    dd.xml = e;
    const att = Helper.getAttribute('id', e);
    if (att !== null) dd.xmlId = att.getValue();
    for (let j = index; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') {
        dd.styleName = Helper.getAttributeValue('name.ref', s);
        break;
      }
    }
    dd.style = this.getStyle(Mpm.DYNAMICS_STYLE, dd.styleName) as DynamicsStyle | null;
    const volAtt = Helper.getAttribute('volume', e);
    if (volAtt === null) return null;
    dd.volumeString = volAtt.getValue();
    dd.volume = DynamicsStyle.getNumericValueStatic(dd.volumeString, dd.style);
    const ttAtt = Helper.getAttribute('transition.to', e);
    if (ttAtt !== null) {
      dd.transitionToString = ttAtt.getValue();
      dd.transitionTo = DynamicsStyle.getNumericValueStatic(dd.transitionToString, dd.style);
    } else {
      dd.transitionToString = dd.volumeString;
      dd.transitionTo = dd.volume;
      dd.curvature = 0.0;
      dd.protraction = 0.0;
    }
    const sndAtt = Helper.getAttribute('subNoteDynamics', e);
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
          Helper.getAttributeValue('value', chanVolMap.getLastElement()!) !== '100.0'
        ) {
          const volE = new Element('volume', chanVolMap.getXml()!.getNamespaceURI());
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
      const e = new Element('volume', channelVolumeMap.getXml()!.getNamespaceURI());
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

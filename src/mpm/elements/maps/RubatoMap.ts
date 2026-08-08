import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { RubatoData } from './data/RubatoData.js';
import { RubatoStyle } from '../styles/RubatoStyle.js';

export class RubatoMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createRubatoMap(): RubatoMap | null;
  static createRubatoMap(xml: Element): RubatoMap | null;
  static createRubatoMap(xml?: Element): RubatoMap | null {
    try {
      return xml !== undefined ? new RubatoMap(xml) : new RubatoMap('rubatoMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
  }

  addRubato(
    date: number,
    frameLength: number,
    intensity: number,
    lateStart: number,
    earlyEnd: number,
    loop: boolean,
  ): number;
  addRubato(date: number, rubatoDefName: string, loop: boolean): number;
  addRubato(data: RubatoData): number;
  addRubato(
    dateOrData: number | RubatoData,
    arg2?: number | string,
    arg3?: number | boolean,
    arg4?: number,
    arg5?: number,
    arg6?: boolean,
  ): number {
    if (typeof dateOrData !== 'number') {
      const data = dateOrData;
      const e = new Element('rubato', Mpm.MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', String(data.startDate)));
      if (data.rubatoDefString !== null)
        e.addAttribute(new Attribute('name.ref', data.rubatoDefString));
      if (data.frameLength !== null)
        e.addAttribute(new Attribute('frameLength', String(data.frameLength)));
      if (data.intensity !== null)
        e.addAttribute(new Attribute('intensity', String(data.intensity)));
      if (data.lateStart !== null)
        e.addAttribute(new Attribute('lateStart', String(data.lateStart)));
      if (data.earlyEnd !== null) e.addAttribute(new Attribute('earlyEnd', String(data.earlyEnd)));
      e.addAttribute(new Attribute('loop', String(data.loop)));
      if (data.xmlId !== null)
        e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
      return this.insertElement(new KeyValue(data.startDate, e), false);
    }
    const date = dateOrData;
    const e = new Element('rubato', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    if (typeof arg2 === 'string') {
      e.addAttribute(new Attribute('name.ref', arg2));
      e.addAttribute(new Attribute('loop', String(arg3)));
    } else {
      e.addAttribute(new Attribute('frameLength', String(arg2)));
      e.addAttribute(new Attribute('intensity', String(arg3)));
      e.addAttribute(new Attribute('lateStart', String(arg4)));
      e.addAttribute(new Attribute('earlyEnd', String(arg5)));
      e.addAttribute(new Attribute('loop', String(arg6)));
    }
    return this.insertElement(new KeyValue(date, e), false);
  }

  getRubatoDataOf(index: number): RubatoData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const e = this.elements[index].getValue();
    if (e.getLocalName() !== 'rubato') return null;
    const rd = new RubatoData();
    rd.startDate = this.elements[index].getKey();
    rd.endDate = this.getEndDate(index);
    rd.xml = e;
    const att = Helper.getAttribute('id', e);
    if (att !== null) rd.xmlId = att.getValue();
    for (let j = index; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') {
        rd.styleName = Helper.getAttributeValue('name.ref', s);
        break;
      }
    }
    rd.style = this.getStyle(Mpm.RUBATO_STYLE, rd.styleName) as RubatoStyle | null;
    if (rd.style !== null) {
      const nrAtt = Helper.getAttribute('name.ref', e);
      if (nrAtt !== null) {
        rd.rubatoDefString = nrAtt.getValue();
        rd.rubatoDef = rd.style.getDef(rd.rubatoDefString) ?? null;
      }
    }
    const flAtt = Helper.getAttribute('frameLength', e);
    if (flAtt !== null) rd.frameLength = parseFloat(flAtt.getValue());
    else if (rd.rubatoDef !== null) rd.frameLength = rd.rubatoDef.getFrameLength();
    else return null;
    const loopAtt = Helper.getAttribute('loop', e);
    if (loopAtt !== null) rd.loop = loopAtt.getValue() === 'true';
    const intAtt = Helper.getAttribute('intensity', e);
    if (intAtt !== null) rd.intensity = parseFloat(intAtt.getValue());
    else if (rd.rubatoDef !== null) rd.intensity = rd.rubatoDef.getIntensity();
    const lsAtt = Helper.getAttribute('lateStart', e);
    if (lsAtt !== null) rd.lateStart = parseFloat(lsAtt.getValue());
    else if (rd.rubatoDef !== null) rd.lateStart = rd.rubatoDef.getLateStart();
    const eeAtt = Helper.getAttribute('earlyEnd', e);
    if (eeAtt !== null) rd.earlyEnd = parseFloat(eeAtt.getValue());
    else if (rd.rubatoDef !== null) rd.earlyEnd = rd.rubatoDef.getEarlyEnd();
    // ensure boundaries
    if (rd.lateStart !== null && rd.lateStart < 0.0) rd.lateStart = 0.0;
    if (rd.earlyEnd !== null && rd.earlyEnd > 1.0) rd.earlyEnd = 1.0;
    if (rd.lateStart !== null && rd.earlyEnd !== null && rd.lateStart >= rd.earlyEnd) {
      rd.lateStart = 0.0;
      rd.earlyEnd = 1.0;
    }
    return rd;
  }

  private getEndDate(index: number): number {
    for (let j = index + 1; j < this.elements.length; ++j) {
      if (this.elements[j].getValue().getLocalName() === 'rubato') return this.elements[j].getKey();
    }
    return Number.MAX_VALUE;
  }

  private static computeRubatoTransformation(date: number, rd: RubatoData): number {
    const localDate = (date - rd.startDate) % rd.frameLength!;
    const d =
      (Math.pow(localDate / rd.frameLength!, rd.intensity!) * (rd.earlyEnd! - rd.lateStart!) +
        rd.lateStart!) *
      rd.frameLength!;
    return date + d - localDate;
  }

  renderRubatoToMap(map: GenericMap | null): void {
    if (map === null || this.elements.length === 0) return;
    const pendingDurations: KeyValue<number, Attribute>[] = [];
    let mapIndex = 0;
    for (let rubIndex = 0; rubIndex < this.size(); ++rubIndex) {
      const rd = this.getRubatoDataOf(rubIndex);
      if (rd === null) continue;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        if (mapEntry.getKey() < rd.startDate) continue;
        if (
          mapEntry.getKey() >= rd.endDate! ||
          (!rd.loop && mapEntry.getKey() >= rd.startDate + rd.frameLength!)
        )
          break;

        const dateAtt = Helper.getAttribute('date.perf', mapEntry.getValue());
        if (dateAtt !== null)
          dateAtt.setValue(
            String(RubatoMap.computeRubatoTransformation(parseFloat(dateAtt.getValue()), rd)),
          );

        let dateEndAtt = Helper.getAttribute('date.end.perf', mapEntry.getValue());
        if (dateEndAtt !== null) {
          const endDate = parseFloat(dateEndAtt.getValue());
          pendingDurations.push(new KeyValue(endDate, dateEndAtt));
          continue;
        }
        const durAtt = Helper.getAttribute('duration.perf', mapEntry.getValue());
        if (durAtt !== null) {
          const endDate = mapEntry.getKey() + parseFloat(durAtt.getValue());
          dateEndAtt = new Attribute('date.end.perf', String(endDate));
          mapEntry.getValue().addAttribute(dateEndAtt);
          pendingDurations.push(new KeyValue(endDate, dateEndAtt));
        }
      }

      for (let i = 0; i < pendingDurations.length; ++i) {
        const pd = pendingDurations[i];
        const dateEnd = pd.getKey();
        if (dateEnd >= rd.endDate! || (!rd.loop && dateEnd >= rd.startDate + rd.frameLength!))
          break;
        if (dateEnd >= rd.startDate)
          pd.getValue().setValue(String(RubatoMap.computeRubatoTransformation(dateEnd, rd)));
        pendingDurations.splice(i, 1);
        --i;
      }
    }
  }

  static renderRubatoToMap(map: GenericMap | null, rubatoMap: RubatoMap | null): void {
    if (rubatoMap !== null) rubatoMap.renderRubatoToMap(map);
  }
}

GenericMap.registerMapFactory('rubatoMap', (xml) => RubatoMap.createRubatoMap(xml));

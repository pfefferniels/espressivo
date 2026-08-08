import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';

export class AsynchronyMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createAsynchronyMap(): AsynchronyMap | null;
  static createAsynchronyMap(xml: Element): AsynchronyMap | null;
  static createAsynchronyMap(xml?: Element): AsynchronyMap | null {
    try {
      return xml !== undefined ? new AsynchronyMap(xml) : new AsynchronyMap('asynchronyMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
  }

  addAsynchrony(date: number, millisecondsOffset: number): number {
    const e = new Element('asynchrony', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('milliseconds.offset', String(millisecondsOffset)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  getAsynchronyAt(date: number): number {
    let i = this.getElementIndexBeforeAt(date);
    if (i < 0) return 0.0;
    while (!this.elements[i].getValue().getLocalName().includes('asynchrony'))
      if (--i < 0) return 0.0;
    return parseFloat(Helper.getAttributeValue('milliseconds.offset', this.elements[i].getValue()));
  }

  renderAsynchronyToMap(map: GenericMap | null): void {
    if (map === null || this.elements.length === 0) return;
    const mapEntries = [...map.getAllElements()];
    const done: KeyValue<number, Element>[] = [];
    for (let asynIndex = 0; asynIndex < this.size(); ++asynIndex) {
      const asynElement = this.getElement(asynIndex)!;
      const xmlId = Helper.getAttributeValue('xml:id', asynElement);
      const asynEndDate =
        asynIndex < this.elements.length - 1
          ? this.elements[asynIndex + 1].getKey()
          : Number.MAX_VALUE;
      const offset = parseFloat(Helper.getAttributeValue('milliseconds.offset', asynElement));
      for (let mapIndex = 0; mapIndex < mapEntries.length; ++mapIndex) {
        const mapEntry = mapEntries[mapIndex];
        if (mapEntry.getKey() >= asynEndDate) break;
        let startDateMs = 0.0;
        if (mapEntry.getKey() >= this.elements[asynIndex].getKey()) {
          const att = Helper.getAttribute('milliseconds.date', mapEntry.getValue());
          if (att !== null) {
            startDateMs = Math.max(0.0, parseFloat(att.getValue()) + offset);
            att.setValue(String(startDateMs));
            Helper.addToListAttribute(mapEntry.getValue(), 'modified', xmlId);
          }
        }
        const dur = Helper.getAttribute('duration', mapEntry.getValue());
        if (dur === null) {
          done.push(mapEntry);
          continue;
        }
        const end = parseFloat(dur.getValue()) + mapEntry.getKey();
        if (end >= asynEndDate) continue;
        if (end >= this.elements[asynIndex].getKey()) {
          const att = Helper.getAttribute('milliseconds.date.end', mapEntry.getValue());
          if (att !== null) {
            const ms = parseFloat(att.getValue()) + offset;
            att.setValue(String(Math.max(ms, startDateMs + 1)));
            Helper.addToListAttribute(mapEntry.getValue(), 'modified', xmlId);
          }
        }
        done.push(mapEntry);
      }
      for (const removeMe of done) {
        const idx = mapEntries.indexOf(removeMe);
        if (idx !== -1) mapEntries.splice(idx, 1);
      }
      done.length = 0;
    }
  }

  static renderAsynchronyToMap(map: GenericMap | null, asynchronyMap: AsynchronyMap | null): void {
    if (asynchronyMap !== null) asynchronyMap.renderAsynchronyToMap(map);
  }
}

GenericMap.registerMapFactory('asynchronyMap', (xml) => AsynchronyMap.createAsynchronyMap(xml));

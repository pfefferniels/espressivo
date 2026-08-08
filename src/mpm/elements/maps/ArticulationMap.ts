import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { ArticulationData } from './data/ArticulationData.js';
import { ArticulationStyle } from '../styles/ArticulationStyle.js';
import { ArticulationDef } from '../styles/defs/ArticulationDef.js';

export class ArticulationMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createArticulationMap(): ArticulationMap | null;
  static createArticulationMap(xml: Element): ArticulationMap | null;
  static createArticulationMap(xml?: Element): ArticulationMap | null {
    try {
      return xml !== undefined ? new ArticulationMap(xml) : new ArticulationMap('articulationMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
  }

  addArticulation(
    date: number,
    articulationDefName: string | null,
    noteid: string | null,
    id: string | null,
  ): number {
    const e = new Element('articulation', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    if (articulationDefName === null) return -1;
    e.addAttribute(new Attribute('name.ref', articulationDefName));
    if (noteid !== null) e.addAttribute(new Attribute('noteid', noteid));
    if (id !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addArticulationFromData(data: ArticulationData): number {
    const e = new Element('articulation', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.date)));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    if (data.articulationDefName !== null)
      e.addAttribute(new Attribute('name.ref', data.articulationDefName));
    if (data.noteid !== null) e.addAttribute(new Attribute('noteid', data.noteid));
    if (data.absoluteDuration !== null)
      e.addAttribute(new Attribute('absoluteDuration', String(data.absoluteDuration)));
    if (data.absoluteDurationChange !== 0.0)
      e.addAttribute(new Attribute('absoluteDurationChange', String(data.absoluteDurationChange)));
    if (data.relativeDuration !== 1.0)
      e.addAttribute(new Attribute('relativeDuration', String(data.relativeDuration)));
    return this.insertElement(new KeyValue(data.date, e), false);
  }

  addArticulationStyleSwitch(
    date: number,
    styleName: string,
    defaultArticulation?: string | null,
    id?: string | null,
  ): number {
    const e = new Element('style', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', styleName));
    if (defaultArticulation !== null && defaultArticulation !== undefined)
      e.addAttribute(new Attribute('defaultArticulation', defaultArticulation));
    if (id !== null && id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), true);
  }

  getArticulationDataOf(index: number): ArticulationData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const e = this.getElement(index);
    if (!e || e.getLocalName() !== 'articulation') return null;
    const ad = new ArticulationData();
    ad.xml = e;
    ad.date = this.elements[index].getKey();
    const att = Helper.getAttribute('xml:id', e);
    if (att !== null) ad.xmlId = att.getValue();
    const nidAtt = Helper.getAttribute('noteid', e);
    if (nidAtt !== null) ad.noteid = nidAtt.getValue().substring(1);
    this.findStyle(index, ad);
    const nrAtt = Helper.getAttribute('name.ref', e);
    if (nrAtt !== null) {
      ad.articulationDefName = nrAtt.getValue();
      if (ad.style !== null) ad.articulationDef = ad.style.getDef(ad.articulationDefName) ?? null;
    }
    return ad;
  }

  private findStyle(index: number, ad: ArticulationData): void {
    for (let j = index; j >= 0; --j) {
      const s = this.elements[j].getValue();
      if (s.getLocalName() === 'style') {
        ad.styleName = Helper.getAttributeValue('name.ref', s);
        ad.style = this.getStyle(Mpm.ARTICULATION_STYLE, ad.styleName) as ArticulationStyle | null;
        const att = Helper.getAttribute('defaultArticulation', s);
        if (att !== null) {
          ad.defaultArticulation = att.getValue();
          if (ad.style !== null)
            ad.defaultArticulationDef = ad.style.getDef(ad.defaultArticulation) ?? null;
        }
        return;
      }
    }
  }

  renderArticulationToMap_noMillisecondModifiers(map: GenericMap | null): void {
    if (map === null) return;

    // make a hashmap (note element, articulation data list) for all notes with a specific (i.e. non-default) articulation
    const noteArtics = new Map<Element, ArticulationData[]>();
    let mapTimingChanged = false;

    for (let articIndex = 0; articIndex < this.size(); ++articIndex) {
      const ad = this.getArticulationDataOf(articIndex);
      if (ad === null) continue;

      if (ad.noteid !== null) {
        const index = map.getElementIndexByID(ad.noteid);
        if (index < 0) continue;
        if (map.getAllElements()[index].getKey() !== ad.date)
          console.error(
            `Warning: articulation date and referee date do not match!\n    ${ad.xml!.toXML()}\n    ${map.getAllElements()[index].getValue().toXML()}`,
          );
        const note = map.getAllElements()[index].getValue();
        let adList = noteArtics.get(note);
        if (adList === undefined) {
          adList = [];
          noteArtics.set(note, adList);
        }
        adList.push(ad);
        continue;
      }

      // if no noteid is specified, the articulation is potentially relevant to all map elements at the same date
      const elements = map.getAllElementsAt(ad.date);
      for (const element of elements) {
        if (element.getValue().getLocalName() !== 'note') continue;
        let adList = noteArtics.get(element.getValue());
        if (adList === undefined) {
          adList = [];
          noteArtics.set(element.getValue(), adList);
        }
        adList.push(ad);
      }
    }

    // create a list of styles/switches
    const defaultArticulations: KeyValue<number, ArticulationDef | null>[] = [];
    const styleSwitchList = this.getAllElementsOfType('style');
    for (const styleEntry of styleSwitchList) {
      const aStyle = this.getStyle(
        Mpm.ARTICULATION_STYLE,
        Helper.getAttributeValue('name.ref', styleEntry.getValue()),
      ) as ArticulationStyle | null;
      if (aStyle === null) continue;

      const defaultArticulationAtt = Helper.getAttribute(
        'defaultArticulation',
        styleEntry.getValue(),
      );
      if (defaultArticulationAtt === null) {
        defaultArticulations.push(
          new KeyValue<number, ArticulationDef | null>(styleEntry.getKey(), null),
        );
        continue;
      }

      const aDef = aStyle.getDef(defaultArticulationAtt.getValue()) ?? null;
      if (aDef === null)
        console.error(
          `Warning: attribute ${Helper.getAttribute('defaultArticulation', styleEntry.getValue())!.toXML()} in style element refers to an unknown articulationDef.`,
        );
      defaultArticulations.push(
        new KeyValue<number, ArticulationDef | null>(styleEntry.getKey(), aDef),
      );
    }

    // articulate the map elements
    let defaultArticulationIndex = 0;
    for (let mapIndex = 0; mapIndex < map.size(); ++mapIndex) {
      const mapEntry = map.elements[mapIndex];
      if (mapEntry.getValue().getLocalName() !== 'note') continue;

      const artics = noteArtics.get(mapEntry.getValue());
      if (artics !== undefined) {
        for (const artic of artics) {
          mapTimingChanged = artic.articulateNote(mapEntry.getValue()) || mapTimingChanged;
        }
        continue;
      }

      // otherwise apply the default articulation
      if (defaultArticulations.length === 0) continue;

      // make sure we use the latest default articulation
      while (
        defaultArticulationIndex + 1 < defaultArticulations.length &&
        defaultArticulations[defaultArticulationIndex + 1].getKey() <= mapEntry.getKey()
      )
        defaultArticulationIndex++;

      const defaultArticulationDef = defaultArticulations[defaultArticulationIndex].getValue();
      if (defaultArticulationDef === null) continue;

      mapTimingChanged =
        defaultArticulationDef.articulateNote(mapEntry.getValue()) || mapTimingChanged;
    }

    // correct map order due to timing changes
    if (mapTimingChanged) map.sort();
  }

  static renderArticulationToMap_noMillisecondModifiers(
    map: GenericMap | null,
    articulationMap: ArticulationMap | null,
  ): void {
    if (articulationMap !== null)
      articulationMap.renderArticulationToMap_noMillisecondModifiers(map);
  }

  renderArticulationToMap_millisecondModifiers(map: GenericMap | null): void {
    if (map === null) return;
    for (const entry of map.elements) {
      const dateAtt = Helper.getAttribute('milliseconds.date', entry.getValue());
      if (dateAtt === null) continue;
      const date = parseFloat(dateAtt.getValue());
      let dateNew = date;
      const endAtt = Helper.getAttribute('milliseconds.date.end', entry.getValue());
      let endNew = endAtt !== null ? parseFloat(endAtt.getValue()) : null;
      const absoluteDelayMs = Helper.getAttribute('articulation.absoluteDelayMs', entry.getValue());
      if (absoluteDelayMs !== null) {
        dateNew += parseFloat(absoluteDelayMs.getValue());
        entry.getValue().removeAttribute(absoluteDelayMs);
      }
      const absoluteDurationMs = Helper.getAttribute(
        'articulation.absoluteDurationMs',
        entry.getValue(),
      );
      if (absoluteDurationMs !== null) {
        if (endNew !== null) endNew = dateNew + parseFloat(absoluteDurationMs.getValue());
        entry.getValue().removeAttribute(absoluteDurationMs);
      }
      const absoluteDurationChangeMs = Helper.getAttribute(
        'articulation.absoluteDurationChangeMs',
        entry.getValue(),
      );
      if (absoluteDurationChangeMs !== null) {
        if (endNew !== null) endNew += parseFloat(absoluteDurationChangeMs.getValue());
        entry.getValue().removeAttribute(absoluteDurationChangeMs);
      }
      if (endNew === null || dateNew < endNew) {
        dateAtt.setValue(String(dateNew));
        if (endAtt !== null && endNew !== null) endAtt.setValue(String(endNew));
      }
    }
  }

  static renderArticulationToMap_millisecondModifiers(
    map: GenericMap | null,
    articulationMap: ArticulationMap | null,
  ): void {
    if (articulationMap !== null) articulationMap.renderArticulationToMap_millisecondModifiers(map);
  }
}

GenericMap.registerMapFactory('articulationMap', (xml) =>
  ArticulationMap.createArticulationMap(xml),
);

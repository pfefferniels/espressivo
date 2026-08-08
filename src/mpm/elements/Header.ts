import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../mei/Helper.js';
import { Mpm } from '../../mpm/Mpm.js';
import { GenericStyle } from './styles/GenericStyle.js';
import { ArticulationStyle } from './styles/ArticulationStyle.js';
import { TempoStyle } from './styles/TempoStyle.js';
import { DynamicsStyle } from './styles/DynamicsStyle.js';
import { MetricalAccentuationStyle } from './styles/MetricalAccentuationStyle.js';
import { RubatoStyle } from './styles/RubatoStyle.js';
import { OrnamentationStyle } from './styles/OrnamentationStyle.js';

export class Header extends AbstractXmlSubtree {
  private readonly styleDefs = new Map<string, Map<string, GenericStyle>>();

  private constructor() {
    super();
  }

  static createHeader(): Header | null;
  static createHeader(xml: Element): Header | null;
  static createHeader(xml?: Element): Header | null {
    try {
      const h = new Header();
      if (xml !== undefined) h.parseData(xml);
      else h.parseData(new Element('header', Mpm.MPM_NAMESPACE));
      return h;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Header object. XML Element is null.');
    this.setXml(xml);

    const styles = this.getXml()!.query("descendant::*[contains(local-name(), 'Styles')]");
    for (let s = 0; s < styles.size(); ++s) {
      this.addStyleType(styles.get(s) as Element);
    }
  }

  addStyleType(type: string): Map<string, GenericStyle> | null;
  addStyleType(xml: Element): Map<string, GenericStyle> | null;
  addStyleType(typeOrXml: string | Element): Map<string, GenericStyle> | null {
    if (typeof typeOrXml === 'string') {
      if (!typeOrXml) return null;
      return this.addStyleType(new Element(typeOrXml, Mpm.MPM_NAMESPACE));
    }
    const xml = typeOrXml;
    const type = xml.getLocalName();
    if (this.styleDefs.get(type) !== undefined) this.removeStyleType(type);

    const styleDefElements = Helper.getAllChildElements('styleDef', xml);
    const styleDefsMap = new Map<string, GenericStyle>();

    if (styleDefElements) {
      for (const styleDef of styleDefElements) {
        let sd: GenericStyle | null;
        switch (type) {
          case Mpm.ARTICULATION_STYLE:
            sd = ArticulationStyle.createArticulationStyle(styleDef);
            break;
          case Mpm.TEMPO_STYLE:
            sd = TempoStyle.createTempoStyle(styleDef);
            break;
          case Mpm.DYNAMICS_STYLE:
            sd = DynamicsStyle.createDynamicsStyle(styleDef);
            break;
          case Mpm.METRICAL_ACCENTUATION_STYLE:
            sd = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDef);
            break;
          case Mpm.RUBATO_STYLE:
            sd = RubatoStyle.createRubatoStyle(styleDef);
            break;
          case Mpm.ORNAMENTATION_STYLE:
            sd = OrnamentationStyle.createOrnamentationStyle(styleDef);
            break;
          default:
            sd = GenericStyle.createGenericStyle(styleDef);
        }
        if (sd === null) continue;
        styleDefsMap.set(sd.getName(), sd);
      }
    }

    const parent = xml.getParent();
    if (parent === null || parent !== this.getXml()) {
      xml.detach();
      this.getXml()!.appendChild(xml);
    }
    this.styleDefs.set(type, styleDefsMap);
    return styleDefsMap;
  }

  removeStyleType(type: string): void {
    if (this.styleDefs.delete(type)) {
      const typeElt = this.getXml()!.getFirstChildElement(type, Mpm.MPM_NAMESPACE);
      if (typeElt) this.getXml()!.removeChild(typeElt);
    }
  }

  getAllStyleTypes(): Map<string, Map<string, GenericStyle>> {
    return this.styleDefs;
  }
  getAllStyleDefs(type: string): Map<string, GenericStyle> | undefined {
    return this.styleDefs.get(type);
  }

  getStyleDef(type: string, name: string): GenericStyle | null {
    const styleType = this.styleDefs.get(type);
    if (styleType === undefined) return null;
    return styleType.get(name) ?? null;
  }

  addStyleDef(type: string, styleDef: GenericStyle): void;
  addStyleDef(type: string, name: string): GenericStyle | null;
  addStyleDef(type: string, styleDefOrName: GenericStyle | string): GenericStyle | null | void {
    if (typeof styleDefOrName === 'string') {
      let styleDef: GenericStyle | null;
      switch (type) {
        case Mpm.DYNAMICS_STYLE:
          styleDef = DynamicsStyle.createDynamicsStyle(styleDefOrName);
          break;
        case Mpm.ARTICULATION_STYLE:
          styleDef = ArticulationStyle.createArticulationStyle(styleDefOrName);
          break;
        case Mpm.METRICAL_ACCENTUATION_STYLE:
          styleDef = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDefOrName);
          break;
        case Mpm.TEMPO_STYLE:
          styleDef = TempoStyle.createTempoStyle(styleDefOrName);
          break;
        case Mpm.RUBATO_STYLE:
          styleDef = RubatoStyle.createRubatoStyle(styleDefOrName);
          break;
        case Mpm.ORNAMENTATION_STYLE:
          styleDef = OrnamentationStyle.createOrnamentationStyle(styleDefOrName);
          break;
        default:
          styleDef = GenericStyle.createGenericStyle(styleDefOrName);
      }
      if (styleDef === null) return null;
      this.addStyleDef(type, styleDef);
      return styleDef;
    }

    const styleDef = styleDefOrName;
    if (!type || styleDef === null) return;
    let styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) {
      this.getXml()!.appendChild(new Element(type, Mpm.MPM_NAMESPACE));
      styleCollection = new Map();
      this.styleDefs.set(type, styleCollection);
    }
    if (styleCollection.has(styleDef.getName())) this.removeStyleDef(type, styleDef.getName());
    this.getXml()!.getFirstChildElement(type, Mpm.MPM_NAMESPACE)!.appendChild(styleDef.getXml()!);
    styleCollection.set(styleDef.getName(), styleDef);
  }

  removeStyleDef(type: string, name: string): void {
    if (!type) return;
    const styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) return;
    const styleDef = styleCollection.get(name);
    if (styleDef !== undefined) {
      styleCollection.delete(name);
      this.getXml()!.getFirstChildElement(type, Mpm.MPM_NAMESPACE)!.removeChild(styleDef.getXml()!);
    }
  }

  renameStyleDef(type: string, currentName: string, newName: string): GenericStyle | null {
    if (currentName === newName) return this.getStyleDef(type, currentName);
    const allStyleDefs = this.getAllStyleDefs(type);
    if (!allStyleDefs || allStyleDefs.size === 0) {
      console.log(`There are no styleDef elements for type ${type}`);
      return null;
    }
    const styleDef = allStyleDefs.get(currentName);
    if (styleDef === undefined) {
      console.log(`There is no styleDef element with name "${currentName}" to be renamed.`);
      return null;
    }
    allStyleDefs.delete(newName);
    Helper.getAttribute('name', styleDef.getXml()!)!.setValue(newName);
    allStyleDefs.delete(currentName);
    allStyleDefs.set(newName, styleDef);
    return styleDef;
  }

  clear(): void {
    this.getXml()!.removeChildren();
    this.styleDefs.clear();
  }
}

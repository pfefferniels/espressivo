import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { allChildElements, attribute } from '../../xml/tree.js';
import {
  ARTICULATION_STYLE,
  DYNAMICS_STYLE,
  METRICAL_ACCENTUATION_STYLE,
  MPM_NAMESPACE,
  ORNAMENTATION_STYLE,
  RUBATO_STYLE,
  TEMPO_STYLE,
} from '../names.js';
import { GenericStyle } from './styles/GenericStyle.js';
import { ArticulationStyle } from './styles/ArticulationStyle.js';
import { TempoStyle } from './styles/TempoStyle.js';
import { DynamicsStyle } from './styles/DynamicsStyle.js';
import { MetricalAccentuationStyle } from './styles/MetricalAccentuationStyle.js';
import { RubatoStyle } from './styles/RubatoStyle.js';
import { OrnamentationStyle } from './styles/OrnamentationStyle.js';

/**
 * An MPM `<header>` element: the style definitions available to the instruction maps that
 * sit beside it in the same environment.
 * Port of meico.mpm.elements.Header
 *
 * The shape is two levels deep, and {@link styleDefs} mirrors it: *style type*
 * (`tempoStyles`, `dynamicsStyles`, … — the `Mpm.*_STYLE` constants) → *style name* →
 * {@link GenericStyle}. A map instruction naming `style="foo"` is resolved by looking `foo`
 * up under its own type, first in the part's local header and then in the global one.
 *
 * Both a `Global` and a `Part` own a header, which is what makes that two-stage lookup
 * possible — see `GenericMap.setHeaders`.
 *
 * The XML element remains the single source of truth (see {@link AbstractXmlSubtree}):
 * {@link styleDefs} is a lookup index over the element's children, kept in step by
 * {@link addStyleType}/{@link removeStyleType} and {@link addStyleDef}/{@link removeStyleDef}.
 * Never insert into it directly.
 */
export class Header extends AbstractXmlSubtree {
  private readonly styleDefs = new Map<string, Map<string, GenericStyle>>();

  private constructor() {
    super();
  }

  /**
   * Create an empty header, or one parsed from an existing `<header>` element. Returns null
   * — after logging — instead of throwing, as every factory in this cluster does.
   */
  static createHeader(xml?: Element): Header | null {
    try {
      const h = new Header();
      if (xml !== undefined) h.parseData(xml);
      else h.parseData(new Element('header', MPM_NAMESPACE));
      return h;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying.
   *
   * Style-type collections are discovered by *name shape*, not by an allow-list: any
   * descendant whose local name contains `Styles` is treated as one. That is how the six
   * `Mpm.*_STYLE` types and any future or vendor-specific one are picked up alike, and it
   * is why {@link addStyleType} falls back to a plain {@link GenericStyle} for unknown types
   * rather than rejecting them.
   */
  protected parseData(xml: Element): void {
    if (xml === null) throw new Error('Cannot generate Header object. XML Element is null.');
    this.setXml(xml);

    const styles = this.getXml()!.query("descendant::*[contains(local-name(), 'Styles')]");
    for (let s = 0; s < styles.size(); ++s) {
      this.addStyleType(styles.get(s) as Element);
    }
  }

  /**
   * Add a whole style-type collection: either create an empty one of the given type, or
   * adopt an existing `…Styles` element and parse the `<styleDef>` children out of it. Two
   * genuinely different operations, which is why the overloads are not collapsed onto a
   * `string | Element` union.
   *
   * An existing collection of the same type is **replaced**, not merged. `styleDef`
   * children that fail to parse are skipped, and duplicates of a name silently keep the
   * last one — the map is keyed by name.
   */
  addStyleType(type: string): Map<string, GenericStyle> | null;
  addStyleType(xml: Element): Map<string, GenericStyle> | null;
  addStyleType(typeOrXml: string | Element): Map<string, GenericStyle> | null {
    if (typeof typeOrXml === 'string') {
      if (!typeOrXml) return null;
      return this.addStyleType(new Element(typeOrXml, MPM_NAMESPACE));
    }
    const xml = typeOrXml;
    const type = xml.getLocalName();
    if (this.styleDefs.get(type) !== undefined) this.removeStyleType(type);

    const styleDefElements = allChildElements(xml, 'styleDef');
    const styleDefsMap = new Map<string, GenericStyle>();

    for (const styleDef of styleDefElements) {
      let sd: GenericStyle | null;
      switch (type) {
        case ARTICULATION_STYLE:
          sd = ArticulationStyle.createArticulationStyle(styleDef);
          break;
        case TEMPO_STYLE:
          sd = TempoStyle.createTempoStyle(styleDef);
          break;
        case DYNAMICS_STYLE:
          sd = DynamicsStyle.createDynamicsStyle(styleDef);
          break;
        case METRICAL_ACCENTUATION_STYLE:
          sd = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDef);
          break;
        case RUBATO_STYLE:
          sd = RubatoStyle.createRubatoStyle(styleDef);
          break;
        case ORNAMENTATION_STYLE:
          sd = OrnamentationStyle.createOrnamentationStyle(styleDef);
          break;
        default:
          sd = GenericStyle.createGenericStyle(styleDef);
      }
      if (sd === null) continue;
      styleDefsMap.set(sd.getName(), sd);
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
      const typeElt = this.getXml()!.getFirstChildElement(type, MPM_NAMESPACE);
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

  /**
   * Add one style definition under a style type, either an existing {@link GenericStyle} or
   * a fresh empty one created from a name. The type's collection is created on demand, and
   * an existing def of the same name is removed first, so a name never appears twice.
   *
   * The `switch` picks the subclass that knows how to parse that type's defs; an unknown
   * type falls back to {@link GenericStyle}, matching {@link parseData}'s open-ended
   * discovery.
   */
  addStyleDef(type: string, styleDef: GenericStyle): void;
  addStyleDef(type: string, name: string): GenericStyle | null;
  addStyleDef(type: string, styleDefOrName: GenericStyle | string): GenericStyle | null | void {
    if (typeof styleDefOrName === 'string') {
      let styleDef: GenericStyle | null;
      switch (type) {
        case DYNAMICS_STYLE:
          styleDef = DynamicsStyle.createDynamicsStyle(styleDefOrName);
          break;
        case ARTICULATION_STYLE:
          styleDef = ArticulationStyle.createArticulationStyle(styleDefOrName);
          break;
        case METRICAL_ACCENTUATION_STYLE:
          styleDef = MetricalAccentuationStyle.createMetricalAccentuationStyle(styleDefOrName);
          break;
        case TEMPO_STYLE:
          styleDef = TempoStyle.createTempoStyle(styleDefOrName);
          break;
        case RUBATO_STYLE:
          styleDef = RubatoStyle.createRubatoStyle(styleDefOrName);
          break;
        case ORNAMENTATION_STYLE:
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
      this.getXml()!.appendChild(new Element(type, MPM_NAMESPACE));
      styleCollection = new Map();
      this.styleDefs.set(type, styleCollection);
    }
    if (styleCollection.has(styleDef.getName())) this.removeStyleDef(type, styleDef.getName());
    this.getXml()!.getFirstChildElement(type, MPM_NAMESPACE)!.appendChild(styleDef.getXml()!);
    styleCollection.set(styleDef.getName(), styleDef);
  }

  removeStyleDef(type: string, name: string): void {
    if (!type) return;
    const styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) return;
    const styleDef = styleCollection.get(name);
    if (styleDef !== undefined) {
      styleCollection.delete(name);
      this.getXml()!.getFirstChildElement(type, MPM_NAMESPACE)!.removeChild(styleDef.getXml()!);
    }
  }

  /**
   * Rename a style definition in place, keeping the same object and XML element and only
   * changing its `name` attribute and its key in the index.
   *
   * Any def already holding `newName` is dropped from the index first — so a rename onto an
   * occupied name wins, and note that the loser is removed from the index only: its element
   * stays in the XML. Renaming to the current name is a no-op that returns the def.
   */
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
    attribute('name', styleDef.getXml()!)!.setValue(newName);
    allStyleDefs.delete(currentName);
    allStyleDefs.set(newName, styleDef);
    return styleDef;
  }

  clear(): void {
    this.getXml()!.removeChildren();
    this.styleDefs.clear();
  }
}

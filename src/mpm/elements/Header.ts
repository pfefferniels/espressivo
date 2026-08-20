import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { allChildElements, descendantElements } from '../../xml/tree.js';
import { MPM_NAMESPACE } from '../names.js';
import { isErr } from '../../prelude/index.js';
import {
  createStyle,
  describeStyleError,
  parseStyle,
  styleKindOfCollection,
  type AnyStyle,
} from './styles/style.js';

/**
 * An MPM `<header>` element: the style definitions available to the instruction maps that
 * sit beside it in the same environment.
 * Port of meico.mpm.elements.Header
 *
 * The shape is two levels deep, and {@link styleDefs} mirrors it: *style type*
 * (`tempoStyles`, `dynamicsStyles`, … — the `Mpm.*_STYLE` constants) → *style name* →
 * {@link AnyStyle}. A map instruction naming `style="foo"` is resolved by looking `foo`
 * up under its own type, first in the part's local header and then in the global one.
 *
 * The index is kind-erased — a header holds styles of every kind at once — but it erases to
 * the *union* {@link AnyStyle}, not to a base class. That is what lets a reader recover the
 * kind with `styleOfKind` instead of the unchecked `as TempoStyle | null` the previous
 * `GenericStyle`-typed index forced on it. Which kind a collection holds is decided in one
 * place, {@link styleKindOfCollection}, where this class used to carry two copies of the
 * same seven-armed `switch`.
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
  private readonly styleDefs = new Map<string, Map<string, AnyStyle>>();

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
   * is why {@link styleKindOfCollection} answers `'generic'` for unknown types rather than
   * rejecting them.
   *
   * The parameter is `Element | null` rather than the base class's `Element` because the
   * null really does arrive — `Header.test.ts:75` pins `createHeader(null as unknown as
   * Element)` returning null — and saying so is what lets the guard below be a check the
   * type system agrees is reachable instead of a `no-unnecessary-condition` finding.
   */
  protected parseData(xml: Element | null): void {
    if (xml === null) throw new Error('Cannot generate Header object. XML Element is null.');
    this.setXml(xml);

    const styles = descendantElements(this.getXml(), (element) =>
      element.getLocalName().includes('Styles'),
    );
    for (const style of styles) {
      this.addStyleType(style);
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
  addStyleType(type: string): Map<string, AnyStyle> | null;
  addStyleType(xml: Element): Map<string, AnyStyle> | null;
  addStyleType(typeOrXml: string | Element): Map<string, AnyStyle> | null {
    if (typeof typeOrXml === 'string') {
      if (!typeOrXml) return null;
      return this.addStyleType(new Element(typeOrXml, MPM_NAMESPACE));
    }
    const xml = typeOrXml;
    const type = xml.getLocalName();
    if (this.styleDefs.get(type) !== undefined) this.removeStyleType(type);

    const kind = styleKindOfCollection(type);
    const styleDefsMap = new Map<string, AnyStyle>();

    for (const styleDef of allChildElements(xml, 'styleDef')) {
      // A `styleDef` that will not parse is skipped, not fatal — one malformed collection
      // member must not lose the rest. Where the incumbent's factory logged the exception it
      // had caught and returned a bare null, the reason now arrives here as a value and this
      // — the caller, which knows it is converting somebody's document — is what decides to
      // print it.
      const parsed = parseStyle(kind, styleDef);
      if (isErr(parsed)) {
        console.error(describeStyleError(parsed.error));
        continue;
      }
      styleDefsMap.set(parsed.value.getName(), parsed.value);
    }

    const parent = xml.getParent();
    if (parent === null || parent !== this.getXml()) {
      xml.detach();
      this.getXml().appendChild(xml);
    }
    this.styleDefs.set(type, styleDefsMap);
    return styleDefsMap;
  }

  removeStyleType(type: string): void {
    if (this.styleDefs.delete(type)) {
      const typeElt = this.getXml().getFirstChildElement(type, MPM_NAMESPACE);
      if (typeElt) this.getXml().removeChild(typeElt);
    }
  }

  getAllStyleTypes(): Map<string, Map<string, AnyStyle>> {
    return this.styleDefs;
  }
  getAllStyleDefs(type: string): Map<string, AnyStyle> | undefined {
    return this.styleDefs.get(type);
  }

  getStyleDef(type: string, name: string): AnyStyle | null {
    const styleType = this.styleDefs.get(type);
    if (styleType === undefined) return null;
    return styleType.get(name) ?? null;
  }

  /**
   * Add one style definition under a style type, either an existing {@link AnyStyle} or a
   * fresh empty one created from a name. The type's collection is created on demand, and an
   * existing def of the same name is removed first, so a name never appears twice.
   *
   * The name form no longer returns `AnyStyle | null`: {@link createStyle} builds its own
   * element, so the `@name` it then needs is one it just wrote and cannot be missing. The
   * seven-armed `switch` that used to pick a subclass here is now the one-line kind lookup
   * it always was.
   */
  addStyleDef(type: string, styleDef: AnyStyle): void;
  addStyleDef(type: string, name: string): AnyStyle;
  addStyleDef(type: string, styleDefOrName: AnyStyle | string): AnyStyle | void {
    if (typeof styleDefOrName === 'string') {
      const styleDef = createStyle(styleKindOfCollection(type), styleDefOrName);
      this.addStyleDef(type, styleDef);
      return styleDef;
    }

    const styleDef = styleDefOrName;
    if (!type) return;
    let styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) {
      this.getXml().appendChild(new Element(type, MPM_NAMESPACE));
      styleCollection = new Map();
      this.styleDefs.set(type, styleCollection);
    }
    if (styleCollection.has(styleDef.getName())) this.removeStyleDef(type, styleDef.getName());
    // Namespace-EXACT, and left that way: `tree.ts`'s `requireFirstChildElement(name, …)`
    // matches on local name alone, which would start finding the `…Styles` collections that
    // `parseData` discovers outside the MPM namespace. Same reasoning in `removeStyleDef`.
    this.getXml().getFirstChildElement(type, MPM_NAMESPACE)!.appendChild(styleDef.getXml());
    styleCollection.set(styleDef.getName(), styleDef);
  }

  removeStyleDef(type: string, name: string): void {
    if (!type) return;
    const styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) return;
    const styleDef = styleCollection.get(name);
    if (styleDef !== undefined) {
      styleCollection.delete(name);
      this.getXml().getFirstChildElement(type, MPM_NAMESPACE)!.removeChild(styleDef.getXml());
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
  renameStyleDef(type: string, currentName: string, newName: string): AnyStyle | null {
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
    // Was `attribute('name', styleDef.getXml())!.setValue(newName)` — the same attribute node
    // `Style` already holds, reached around the object rather than through it.
    styleDef.setName(newName);
    allStyleDefs.delete(currentName);
    allStyleDefs.set(newName, styleDef);
    return styleDef;
  }

  clear(): void {
    this.getXml().removeChildren();
    this.styleDefs.clear();
  }
}

import { Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import { allChildElements, descendantElements } from '../../xml/tree.js';
import { MissingNodeError } from '../../xml/errors.js';
import { isStyleCollectionName, MPM_NAMESPACE } from '../names.js';
import { err, isErr, type Result } from '../../prelude/index.js';
import { attemptParse, type MpmParseError } from './parseError.js';
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
 * the *union* {@link AnyStyle}, not to a base class, so a reader can recover the kind with
 * `styleOfKind` rather than an unchecked cast. Which kind a collection holds is decided in one
 * place, {@link styleKindOfCollection}.
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
   * Create an empty header, or one parsed from an existing `<header>` element.
   *
   * Reports the reason rather than printing it — see `elements/parseError.ts`.
   */
  static createHeader(xml?: Element | null): Result<Header, MpmParseError> {
    const source = xml === undefined ? new Element('header', MPM_NAMESPACE) : xml;
    if (source === null) return err({ kind: 'noElement', what: 'Header' });
    return attemptParse('Header', () => {
      const h = new Header();
      h.parseData(source);
      return h;
    });
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
   */
  protected parseData(xml: Element): void {
    this.setXml(xml);

    const styles = descendantElements(this.getXml(), (e) =>
      isStyleCollectionName(e.getLocalName()),
    );
    for (const style of styles) this.adoptStyleType(style);
  }

  /**
   * Create an empty style-type collection of the given type and hang it off this header.
   *
   * Only this one can answer null, and only for the empty type name (`Header.java:79`'s
   * `type.isEmpty()`); {@link adoptStyleType} always produces a collection.
   */
  addStyleType(type: string): Map<string, AnyStyle> | null {
    if (!type) return null;
    return this.adoptStyleType(new Element(type, MPM_NAMESPACE));
  }

  /**
   * Adopt an existing `…Styles` element: parse the `<styleDef>` children out of it, index
   * them under its local name, and re-parent the element under this header.
   *
   * An existing collection of the same type is **replaced**, not merged. `styleDef`
   * children that fail to parse are skipped, and duplicates of a name silently keep the
   * last one — the map is keyed by name.
   */
  adoptStyleType(xml: Element): Map<string, AnyStyle> {
    const type = xml.getLocalName();
    if (this.styleDefs.get(type) !== undefined) this.removeStyleType(type);

    const kind = styleKindOfCollection(type);
    const styleDefsMap = new Map<string, AnyStyle>();

    for (const styleDef of allChildElements(xml, 'styleDef')) {
      // A `styleDef` that will not parse is skipped, not fatal — one malformed collection
      // member must not lose the rest. This is the layer that prints, because it is the one
      // that knows it is converting somebody's document.
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
   * The name form is total: {@link createStyle} builds its own element, so the `@name` it then
   * needs is one it just wrote and cannot be missing.
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
    this.requireStyleTypeElement(type).appendChild(styleDef.getXml());
    styleCollection.set(styleDef.getName(), styleDef);
  }

  /**
   * The `<…Styles>` child element for `type`. Missing it is a reachable failure, not an
   * invariant, so this throws rather than asserting.
   *
   * The lookup is namespace-EXACT, and left that way, even though {@link parseData} discovers
   * collections by local name alone: a `<header>` carrying a foreign-namespace `<tempoStyles>`
   * gets `tempoStyles` into {@link styleDefs} while this lookup answers null for it, and
   * {@link addStyleDef} and {@link removeStyleDef} then throw. `Header.test.ts` builds that
   * header and pins both throws.
   *
   * Java dereferences `getFirstChildElement(type, Mpm.MPM_NAMESPACE)` unguarded in the same two
   * places (`Header.java:141,163`), so this is not a divergence to repair here — and matching
   * on local name instead would change which element a def is written into.
   */
  private requireStyleTypeElement(type: string): Element {
    const elt = this.getXml().getFirstChildElement(type, MPM_NAMESPACE);
    if (elt === null)
      throw new MissingNodeError(`this <header> has no <${type}> collection in the MPM namespace`);
    return elt;
  }

  removeStyleDef(type: string, name: string): void {
    if (!type) return;
    const styleCollection = this.styleDefs.get(type);
    if (styleCollection === undefined) return;
    const styleDef = styleCollection.get(name);
    if (styleDef !== undefined) {
      styleCollection.delete(name);
      this.requireStyleTypeElement(type).removeChild(styleDef.getXml());
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
    // Both null returns mean the same thing to a caller of a rename — nothing was renamed — so
    // neither reports which of the two it was.
    const allStyleDefs = this.getAllStyleDefs(type);
    if (!allStyleDefs || allStyleDefs.size === 0) return null;
    const styleDef = allStyleDefs.get(currentName);
    if (styleDef === undefined) return null;
    allStyleDefs.delete(newName);
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

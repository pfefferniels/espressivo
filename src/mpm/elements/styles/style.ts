import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { allChildElements, attribute } from '../../../xml/tree.js';
import {
  ARTICULATION_STYLE,
  DYNAMICS_STYLE,
  METRICAL_ACCENTUATION_STYLE,
  MPM_NAMESPACE,
  ORNAMENTATION_STYLE,
  RUBATO_STYLE,
  TEMPO_STYLE,
} from '../../names.js';
import { err, filterMap, matchKind, ok, unwrapOr, type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import type { Def } from './defs/def.js';
import { AccentuationPatternDef } from './defs/AccentuationPatternDef.js';
import { ArticulationDef } from './defs/ArticulationDef.js';
import { DynamicsDef } from './defs/DynamicsDef.js';
import { OrnamentDef } from './defs/OrnamentDef.js';
import { RubatoDef } from './defs/RubatoDef.js';
import { TempoDef } from './defs/TempoDef.js';

/**
 * An MPM `styleDef` element — a named bag of definitions ("defs") that performance
 * instructions elsewhere in the document refer to by name — and the one table that says how
 * each kind of style reads its own children.
 *
 * Ports meico.mpm.elements.styles.{GenericStyle, TempoStyle, DynamicsStyle,
 * ArticulationStyle, MetricalAccentuationStyle, RubatoStyle, OrnamentationStyle}.
 *
 * One class rather than seven, because all six subclasses varied in only two values — a child
 * element name and a def factory — which {@link STYLE_SHAPE} writes down as data. A seventh
 * style kind is therefore a compile error in that table rather than a seventh file. The typed
 * `getDef` the subclasses bought survives as the type parameter (`Style<'tempo'>.getDef`
 * returns a `TempoDef | undefined`), and their names survive as the aliases
 * {@link TempoStyle} … {@link OrnamentationStyle}.
 *
 * {@link AnyStyle} is a union, not a base class. A `Header` indexes styles of every kind
 * together, so what it stores has to be kind-erased; erasing to the union keeps the
 * discriminant, so {@link styleOfKind} can *check* what a cast would merely assert, and a style
 * filed under the wrong collection name reads as absent rather than as a `TempoDef` that is
 * really a `RubatoDef`.
 *
 * IMPORT-ORDER HAZARD: import the namespace constants from `names.js`, never from `Mpm.js`.
 * `Mpm` imports this module back, and that cycle makes a deep import throw before `Mpm` is
 * evaluated (RULE M3). `import/no-cycle` in `eslint.config.js` guards against reintroducing it.
 */

/**
 * What kind of def each style kind holds.
 *
 * `generic` is the open-ended fallback: `Header` discovers style-type collections by name
 * shape (any element whose local name contains `Styles`), so a vendor-specific or future
 * collection gets a style object too. Nothing knows how to read its children, so its defs map
 * is only ever filled through {@link Style.addDef}; it holds the whole {@link Def} sum, which a
 * reader takes apart with `matchDef`.
 */
export interface DefOfStyleKind {
  readonly tempo: TempoDef;
  readonly dynamics: DynamicsDef;
  readonly articulation: ArticulationDef;
  readonly metricalAccentuation: AccentuationPatternDef;
  readonly rubato: RubatoDef;
  readonly ornamentation: OrnamentDef;
  readonly generic: Def;
}

/** The seven style kinds — the six MPM `…Styles` collections plus the fallback. */
export type StyleKind = keyof DefOfStyleKind;

/** How one style kind reads its own `styleDef` children. */
interface StyleShape<K extends StyleKind> {
  /**
   * The `…Styles` collection element this kind lives in — one of the `Mpm.*_STYLE`
   * constants — or null for `generic`, which by definition has no fixed name.
   */
  readonly collectionName: string | null;
  /** The def child element to index, or null where there is nothing to index. */
  readonly defChildName: string | null;
  /** Read one such child, or say why it could not be read. */
  readonly parseDef: (xml: Element) => Result<DefOfStyleKind[K], MpmParseError>;
}

/**
 * How each style kind reads its children. A total mapped type over {@link StyleKind}, so an
 * eighth kind added to {@link DefOfStyleKind} fails to compile here.
 *
 * The `generic` row's `parseDef` is unreachable (`defChildName` is null, and {@link parseStyle}
 * indexes nothing without one). It is spelled out rather than made optional because an optional
 * field would let a *real* kind be added with no parser by accident.
 */
const STYLE_SHAPE: { readonly [K in StyleKind]: StyleShape<K> } = {
  tempo: {
    collectionName: TEMPO_STYLE,
    defChildName: 'tempoDef',
    parseDef: (xml) => TempoDef.fromXml(xml),
  },
  dynamics: {
    collectionName: DYNAMICS_STYLE,
    defChildName: 'dynamicsDef',
    parseDef: (xml) => DynamicsDef.fromXml(xml),
  },
  articulation: {
    collectionName: ARTICULATION_STYLE,
    defChildName: 'articulationDef',
    parseDef: (xml) => ArticulationDef.createArticulationDef(xml),
  },
  metricalAccentuation: {
    collectionName: METRICAL_ACCENTUATION_STYLE,
    defChildName: 'accentuationPatternDef',
    parseDef: (xml) => AccentuationPatternDef.fromXml(xml),
  },
  rubato: {
    collectionName: RUBATO_STYLE,
    defChildName: 'rubatoDef',
    parseDef: (xml) => RubatoDef.fromXml(xml),
  },
  ornamentation: {
    collectionName: ORNAMENTATION_STYLE,
    defChildName: 'ornamentDef',
    parseDef: (xml) => OrnamentDef.createOrnamentDef(xml),
  },
  generic: {
    collectionName: null,
    defChildName: null,
    parseDef: () => err({ kind: 'noElement', what: 'GenericStyle' }),
  },
};

/**
 * The inverse of {@link StyleShape.collectionName}, derived rather than written twice.
 *
 * The cast is sound by construction: `Object.entries` loses the key type of a mapped type,
 * but the object it is applied to is declared total over {@link StyleKind} exactly, so every
 * key it yields is one.
 */
const KIND_OF_COLLECTION_NAME: ReadonlyMap<string, StyleKind> = new Map(
  Object.entries(STYLE_SHAPE).flatMap(([kind, shape]) =>
    shape.collectionName === null ? [] : [[shape.collectionName, kind as StyleKind] as const],
  ),
);

/**
 * Which kind of style a `…Styles` collection holds.
 *
 * Anything outside the six known collection names is `generic`, which is what makes
 * `Header`'s discovery-by-name-shape work: a `<vendorStyles>` element still yields styles,
 * they simply index no defs.
 */
export function styleKindOfCollection(collectionName: string): StyleKind {
  return KIND_OF_COLLECTION_NAME.get(collectionName) ?? 'generic';
}

/**
 * The `…Styles` collection a kind of style lives in, or null for `generic` — which is
 * "whatever collection this port does not recognise" and so names none.
 *
 * The other direction of {@link styleKindOfCollection}, so that a caller which knows the kind
 * (a `TempoMap` looking for its tempo styles) never has to name the collection too.
 */
export function collectionNameOfKind(kind: StyleKind): string | null {
  return STYLE_SHAPE[kind].collectionName;
}

/**
 * One `styleDef` element, of a statically known kind.
 *
 * The XML element is the single source of truth (see {@link AbstractXmlSubtree}). The defs
 * map is only a lookup index over the element's def children; {@link addDef} and
 * {@link removeDef} keep the two in step, so never insert into it directly.
 *
 * Not `readonly` throughout, and deliberately so: `Header.addStyleDef` and the MEI converter
 * both build styles by adding defs to a live document, and an immutable record would mean
 * either rebuilding the element on every add or letting the record and the element drift.
 */
export class Style<K extends StyleKind = StyleKind> extends AbstractXmlSubtree {
  private readonly defs = new Map<string, DefOfStyleKind[K]>();

  /**
   * @param kind which of the seven this is; also the discriminant of {@link AnyStyle}
   * @param xml the `styleDef` element, which becomes this object's single source of truth
   * @param nameAttr its `@name`, held as the attribute node so {@link setName} writes through
   */
  private constructor(
    readonly kind: K,
    xml: Element,
    private readonly nameAttr: Attribute,
  ) {
    super();
    this.setXml(xml);
    this.id = attribute('id', xml);
  }

  /**
   * Required by {@link AbstractXmlSubtree} as a shape constraint, not a dispatch point. This
   * class meets the invariant in its constructor instead: {@link parseStyle} does the parsing
   * and hands the finished pieces over, which is what lets {@link nameAttr} be `readonly`.
   *
   * Re-parsing a *different* element into a live style is not a supported operation —
   * {@link defs} would go on indexing the old element's children — hence a throw rather than a
   * silent no-op.
   */
  protected parseData(): never {
    throw new Error(
      'Style is constructed by parseStyle/createStyle; parseData is not an entry point.',
    );
  }

  getName(): string {
    return this.nameAttr.getValue();
  }

  /** Rename the style, in the object and in the element. */
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }

  /** The live lookup index, not a copy — hence read-only. Mutate via {@link addDef}. */
  getAllDefs(): ReadonlyMap<string, DefOfStyleKind[K]> {
    return this.defs;
  }

  getDef(name: string): DefOfStyleKind[K] | undefined {
    return this.defs.get(name);
  }

  /**
   * Add a def, replacing any def of the same name in both the map and the element.
   *
   * The null guard is unreachable from typed code and is kept anyway: it is Java's
   * (`GenericStyle.addDef` logs and returns), a unit test pins the logging, and this object
   * is reachable from the untyped `as`-casts that the MEI converter still performs.
   */
  addDef(def: DefOfStyleKind[K]): void {
    if ((def as DefOfStyleKind[K] | null) === null) {
      console.error('Cannot add a null object to the styleDef.');
      return;
    }
    this.removeDef(def.getName());
    this.defs.set(def.getName(), def);
    this.getXml().appendChild(def.getXml());
  }

  removeDef(name: string): void {
    const ad = this.defs.get(name);
    if (ad === undefined) return;
    this.defs.delete(name);
    this.getXml().removeChild(ad.getXml());
  }

  size(): number {
    return this.defs.size;
  }

  isEmpty(): boolean {
    return this.defs.size === 0;
  }

  /**
   * Index the def children of this style's kind. Only {@link parseStyle} calls it, once,
   * before the style is visible to anyone.
   *
   * A def that fails to parse is skipped rather than fatal, so one malformed child cannot
   * lose the whole style; and with two defs of the same name the LAST one wins, because they
   * are inserted in document order.
   */
  private indexDefs(xml: Element): void {
    const { defChildName, parseDef } = STYLE_SHAPE[this.kind];
    if (defChildName === null) return;
    // the reason is dropped rather than printed: a `Style` has nowhere to keep it and no
    // caller asking for it.
    const defs = filterMap(allChildElements(xml, defChildName), (c) => unwrapOr(parseDef(c), null));
    for (const def of defs) this.defs.set(def.getName(), def);
  }

  /**
   * The two entry points, as statics so the constructor can stay private and the invariant
   * "a `Style` has been through one of these" can hold. {@link parseStyle} and
   * {@link createStyle} are the free-function forms.
   */
  static parse<K extends StyleKind>(
    kind: K,
    xml: Element | null,
  ): Result<StyleOfKind<K>, StyleError> {
    if (xml === null) return err({ kind: 'noElement' });
    const nameAttr = attribute('name', xml);
    if (nameAttr === null) return err({ kind: 'missingName', element: xml });

    const style = new Style(kind, xml, nameAttr);
    style.indexDefs(xml);
    return ok(style);
  }

  static create<K extends StyleKind>(kind: K, name: string, id?: string): StyleOfKind<K> {
    const xml = new Element('styleDef', MPM_NAMESPACE);
    const nameAttr = new Attribute('name', name);
    xml.addAttribute(nameAttr);

    const style = new Style(kind, xml, nameAttr);
    if (id !== undefined) style.setId(id);
    return style;
  }
}

/**
 * Why a `styleDef` element could not be read. Deliberately does *not* carry the def children
 * that were skipped: those are reported by the def factories themselves.
 */
export type StyleError =
  { readonly kind: 'noElement' } | { readonly kind: 'missingName'; readonly element: Element };

/**
 * A {@link StyleError} as a sentence, for a caller that has decided to log it. Separate from
 * the error value because *whether* to print is the caller's call: `Header` prints, a validator
 * would collect the values instead and never come here.
 */
export function describeStyleError(error: StyleError): string {
  return matchKind(error, {
    noElement: () => 'Cannot read a styleDef: the XML element is null.',
    missingName: (e) =>
      `Cannot read the styleDef ${e.element.toXML()}: it has no name attribute, so nothing could refer to it.`,
  });
}

/**
 * Read one `styleDef` element as a style of the given kind. `xml` is nullable because XOM
 * lookups are, so a caller can hand a lookup result straight in.
 */
export function parseStyle<K extends StyleKind>(
  kind: K,
  xml: Element | null,
): Result<StyleOfKind<K>, StyleError> {
  return Style.parse(kind, xml);
}

/**
 * Build an empty style of the given kind. Total: this path constructs the element itself, so
 * the `@name` it then looks for is one it just put there and cannot be missing.
 */
export function createStyle<K extends StyleKind>(
  kind: K,
  name: string,
  id?: string,
): StyleOfKind<K> {
  return Style.create(kind, name, id);
}

/**
 * `Style<K>` distributed over `K` — one arm per kind, rather than one type whose `kind`
 * field is the whole union.
 *
 * The distinction is what lets readers stop casting. `Style<'tempo' | 'rubato'>` has a `getDef`
 * returning `TempoDef | RubatoDef` **regardless** of what `kind` turns out to be, so testing
 * `kind` narrows nothing. `Style<'tempo'> | Style<'rubato'>` is a discriminated union: the test
 * narrows the arm, and with it the def type. Every public signature here returns this rather
 * than a bare `Style<K>`.
 *
 * It costs nothing: `new Style(kind, …)` where `kind: K` satisfies this without a cast, because
 * TypeScript distributes the assignability check the same way it distributes the type.
 */
export type StyleOfKind<K extends StyleKind> = { readonly [Q in K]: Style<Q> }[K];

/** A style of *some* kind — what a `Header` stores and what a map lookup returns. */
export type AnyStyle = StyleOfKind<StyleKind>;

/**
 * Narrow a kind-erased style to one kind, or null if it is not that kind.
 *
 * A style is filed under a collection name and read back under a map's expectation of what that
 * name holds. Those two agree in every well-formed document; where they do not, this returns
 * null instead of a def of the wrong type for someone to call `getFrameLength()` on.
 */
export function styleOfKind<K extends StyleKind>(style: AnyStyle | null, kind: K): Style<K> | null {
  return style !== null && style.kind === kind ? (style as Style<K>) : null;
}

/** A `styleDef` in a `tempoStyles` collection, holding `tempoDef` children. */
export type TempoStyle = Style<'tempo'>;
/** A `styleDef` in a `dynamicsStyles` collection, holding `dynamicsDef` children. */
export type DynamicsStyle = Style<'dynamics'>;
/** A `styleDef` in an `articulationStyles` collection, holding `articulationDef` children. */
export type ArticulationStyle = Style<'articulation'>;
/**
 * A `styleDef` in a `metricalAccentuationStyles` collection, holding
 * `accentuationPatternDef` children.
 */
export type MetricalAccentuationStyle = Style<'metricalAccentuation'>;
/** A `styleDef` in a `rubatoStyles` collection, holding `rubatoDef` children. */
export type RubatoStyle = Style<'rubato'>;
/** A `styleDef` in an `ornamentationStyles` collection, holding `ornamentDef` children. */
export type OrnamentationStyle = Style<'ornamentation'>;

/**
 * Resolve a tempo string to beats per minute: a matching `tempoDef` wins, otherwise the
 * string is read as a number, otherwise 100.0. A null style is tolerated because a tempo
 * instruction may name no style, or name one the header does not have.
 *
 * The 100.0 fallback is load-bearing, not defensive — `comparison/values.ts` documents it as
 * the reason a `bpm="?"` renders rather than refusing — so it must keep logging and keep
 * returning, not start throwing.
 */
export function numericBpmValue(tempoString: string, style: TempoStyle | null): number {
  const tempoDef = style !== null ? style.getDef(tempoString) : undefined;
  if (tempoDef !== undefined) return tempoDef.getValue();
  const val = parseFloat(tempoString);
  if (!isNaN(val)) return val;
  console.error(
    `Failed to convert tempo string "${tempoString}" to double. No tempoDef, no number format.`,
  );
  return 100.0;
}

/**
 * Resolve a dynamics string to a numeric value: a matching `dynamicsDef` wins, otherwise the
 * string is read as a number, otherwise 100.0. See {@link numericBpmValue} on the fallback;
 * the two log different messages, and that difference is Java's.
 */
export function numericDynamicsValue(dynamicsString: string, style: DynamicsStyle | null): number {
  const dynamicsDef = style !== null ? style.getDef(dynamicsString) : undefined;
  if (dynamicsDef !== undefined) return dynamicsDef.getValue();
  const val = parseFloat(dynamicsString);
  if (!isNaN(val)) return val;
  console.error(`Failed to convert dynamics string "${dynamicsString}" to double.`);
  return 100.0;
}

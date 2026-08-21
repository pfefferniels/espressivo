/**
 * Style resolution and level reading — how a string in `@bpm`, `@volume` or
 * `@transition.to` becomes the number the renderer uses.
 *
 * Two rules from DESIGN.md D-A live here, both of which decide *which numbers the engine
 * writes*, not merely how it finds them.
 *
 * **Whole-styleDef shadowing, never a per-def merge.** `GenericMap.getStyle`
 * (GenericMap.ts:506-513) asks the part's header for a `styleDef` of the wanted name and
 * falls back to the global header only when the part has no `styleDef` OF THAT NAME. It
 * never merges the two. So a part that redeclares `<styleDef name="MEI export">` with a
 * single `<dynamicsDef name="p">` shadows the global `"MEI export"` WHOLESALE: a level of
 * `"f"` under it resolves to no def at all and falls through to `parseFloat("f")`, rather
 * than picking up the global `"MEI export"`'s `f`. Getting this wrong changes a rendered
 * velocity, not just a lookup path.
 *
 * **Def lookup first, then `parseFloat`.** `TempoStyle.getNumericBpmValueStatic`
 * (TempoStyle.ts:49-56) and `DynamicsStyle.getNumericValueStatic` (DynamicsStyle.ts:49-56)
 * both try the def index before reading the string as a number. A strict
 * `Number()`-or-regex classifier is wrong in both directions: `bpm="120bpm"` renders as
 * 120 because `parseFloat` stops at the first non-numeric character, and
 * `<tempoDef name="120" value="60"/>` makes `bpm="120"` render as 60 because the def wins
 * over the numeral it looks like.
 *
 * The renderer's third step — the 100.0 fallback with a `console.error` — is deliberately
 * NOT reproduced. 100.0 is a rendering default, not a reading of the document; feeding it
 * into a geometric mean would invent a level the author never wrote, and transforming
 * around it would move every other level. Unresolvable levels are reported as such
 * ({@link LevelReading}'s `unresolvable`) and skipped, per §1.2 and the "String levels"
 * note in §7.2 — MEI's `'+'`, `'-'` and `'?'` placeholders all land here.
 */
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { DYNAMICS_STYLE, TEMPO_STYLE } from '../mpm/names.js';
import { parseJavaDouble } from '../supplementary/parseJavaDouble.js';
import type { MpmEnvironment } from './mpmTree.js';

/** The two level families that resolve through a style: tempo and dynamics. */
export type LevelDomain = 'tempo' | 'dynamics';

/** Where a level domain's style collection and def children are found. */
export const LEVEL_DOMAINS: Readonly<
  Record<LevelDomain, { readonly styleKind: string; readonly defName: string }>
> = {
  tempo: { styleKind: TEMPO_STYLE, defName: 'tempoDef' },
  dynamics: { styleKind: DYNAMICS_STYLE, defName: 'dynamicsDef' },
};

/** A `styleDef` element together with the environment whose header it was found in. */
export interface ResolvedStyleDef {
  readonly styleDef: Element;
  readonly environment: MpmEnvironment;
}

/**
 * What a level string resolved to.
 *
 * The three cases are the engine's three site dispositions: `def` means the writable site
 * is the def's `@value` and the instruction attribute must be left alone (D-C forbids
 * rewriting a name as a number — it severs the style linkage); `literal` means the
 * instruction attribute is itself the site; `unresolvable` means skip and report.
 *
 * **Deliberately not a `Result`.** Reading `unresolvable` as the failure arm would fuse `def`
 * and `literal` into one success, and those two are not one thing: they name *different
 * writable sites*, which is the only question this type is asked. Every caller would have to
 * re-discriminate inside the `ok` arm, so the two-arm shape would buy a combinator nobody can
 * use and cost a switch everybody still has to write. It is a three-way sum because the
 * dispositions are three.
 */
export type LevelReading =
  | {
      readonly kind: 'def';
      /** The def's `@value`. May be non-finite when the document says `value="NaN"`. */
      readonly value: number;
      readonly def: Element;
      readonly styleDef: Element;
      /** The environment the `styleDef` was found in — the part's own, or the global one. */
      readonly environment: MpmEnvironment;
    }
  | { readonly kind: 'literal'; readonly value: number }
  | { readonly kind: 'unresolvable'; readonly value: number };

/**
 * The last `<styleDef name="name">` child of `collection`, or null.
 *
 * LAST, not first, because `Header.addStyleType` builds its index by assigning into a `Map`
 * keyed by name in document order (Header.ts:128), so a duplicate name silently keeps the
 * later element. A `styleDef` without `@name` is skipped: `GenericStyle.parseData` throws
 * on it (GenericStyle.ts:40-42) and the factory turns that into a `null` the index never
 * receives.
 */
function findStyleDefIn(collection: Element, name: string): Element | null {
  let found: Element | null = null;
  for (const styleDef of collection.getChildElements('styleDef')) {
    if (attribute('name', styleDef)?.getValue() === name) found = styleDef;
  }
  return found;
}

/**
 * The `<styleDef name="styleName">` in scope for `environment` — the part's own header
 * first, the performance's global header second.
 *
 * Returns the whole `styleDef` element and the environment it came from; the caller looks
 * up its own def inside it and does NOT fall back a second time. An empty or null
 * `styleName` resolves to nothing, matching `GenericMap.getStyle`'s first line
 * (GenericMap.ts:507) — that is the state of every instruction before the map's first
 * `<style>` switch.
 */
export function findStyleDef(
  styleKind: string,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): ResolvedStyleDef | null {
  if (styleName === null || styleName === '') return null;

  const candidates =
    environment === globalEnvironment ? [globalEnvironment] : [environment, globalEnvironment];
  for (const candidate of candidates) {
    const collection = candidate.styleCollections.get(styleKind);
    if (collection === undefined) continue;
    const styleDef = findStyleDefIn(collection, styleName);
    if (styleDef !== null) return { styleDef, environment: candidate };
  }
  return null;
}

/**
 * A def's `@value` read the way its class reads it, or null when the class would have
 * dropped the def.
 *
 * `TempoDef`/`DynamicsDef` parse `@value` with {@link parseJavaDouble}, which THROWS on
 * anything Java's `Double.parseDouble` rejects; the surrounding factory catches that and
 * returns null, and `parseDefs` then skips the def entirely (GenericStyle.ts:62-63). So a
 * `<dynamicsDef name="f" value="loud"/>` does not exist for lookup purposes, and a level of
 * `"f"` under it falls through to `parseFloat("f")` — not to some NaN-valued def. The
 * `try`/`catch` here IS that factory's behaviour, expressed at the one place that needs it.
 *
 * Note the surviving non-finite case: Java's grammar accepts the literals `NaN` and
 * `Infinity`, so `value="NaN"` yields a def the index holds with a NaN value. The §1.2
 * validation gate is what keeps it out of the transform; this function's job is only to
 * report what the renderer would read.
 */
export function readDefValue(def: Element): number | null {
  const raw = attribute('value', def);
  if (raw === null) return null;
  try {
    return parseJavaDouble(raw.getValue(), `${def.getLocalName()}/@value`);
  } catch {
    return null;
  }
}

/**
 * Read a level string against an already-resolved `styleDef`: def first, then `parseFloat`,
 * then unresolvable.
 *
 * Pass `style: null` for an instruction with no style in scope — the common case before a
 * map's first `<style>` switch, and the case the positional style lookup produces at equal
 * dates where the date-based one would not.
 *
 * The def scan keeps the last VALID def of the name rather than the last def of the name:
 * `parseDefs` `continue`s past a def its factory rejected without assigning it
 * (GenericStyle.ts:62-63), so an invalid duplicate does not displace a valid earlier one.
 */
export function readLevel(
  levelString: string,
  style: ResolvedStyleDef | null,
  domain: LevelDomain,
): LevelReading {
  if (style !== null) {
    let def: Element | null = null;
    let defValue = NaN;
    for (const candidate of style.styleDef
      .getChildElements(LEVEL_DOMAINS[domain].defName)
      .toArray()) {
      if (attribute('name', candidate)?.getValue() !== levelString) continue;
      const value = readDefValue(candidate);
      if (value === null) continue;
      def = candidate;
      defValue = value;
    }
    if (def !== null) {
      return {
        kind: 'def',
        value: defValue,
        def,
        styleDef: style.styleDef,
        environment: style.environment,
      };
    }
  }

  const literal = parseFloat(levelString);
  if (!isNaN(literal)) return { kind: 'literal', value: literal };
  return { kind: 'unresolvable', value: NaN };
}

/**
 * {@link findStyleDef} composed with {@link readLevel}: the whole path from a level string
 * and the style name in scope to the number the renderer would use.
 */
export function resolveLevel(
  levelString: string,
  domain: LevelDomain,
  styleName: string | null,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): LevelReading {
  const style = findStyleDef(
    LEVEL_DOMAINS[domain].styleKind,
    styleName,
    environment,
    globalEnvironment,
  );
  return readLevel(levelString, style, domain);
}

/**
 * Articulation atoms and their LIVENESS — DESIGN.md §5.5, first half.
 *
 * This module answers one question per `<articulation>`: **which of its attributes does the
 * renderer actually apply?** §5.5's "the atom's effective modifier is resolved before pricing,
 * not summed over rows" is exactly that, and it is a prerequisite for pricing rather than part
 * of it — revision 1 charged 0.59 nepers for a `@relativeDuration` the renderer never applied.
 *
 * What is deliberately NOT here: the default-articulation step function, and the matching of
 * atoms between two documents. Both are blocked on rulings — the step function because the
 * renderer's default reaches BACKWARDS in a way §5.5 does not describe (see below), the
 * matching because §5.5 delegates it to §5.6's alignment DP, which is a later cut's module.
 *
 * ## Exactly one duration lever fires INLINE; on a def they compose (AD-11i, R4)
 *
 * `ArticulationData.articulateNote` reads `duration` **once**, up front, and every branch
 * computes from that original value — so the three tick-domain levers overwrite one another
 * instead of composing, and the last to fire wins. In source order that makes the precedence
 * `absoluteDurationChange > relativeDuration > absoluteDuration`, and `absoluteDurationMs`
 * short-circuits the entire tick branch before any of them. Executed on a 100-tick note:
 * `relativeDuration="0.5" absoluteDurationChange="10"` performs **110** — the factor entirely
 * inert. The same pair on an `<articulationDef>` performs **60** (0.5 then +10), because
 * `ArticulationDef.articulateNote` composes. The rule is therefore keyed on the ELEMENT and
 * never on the attribute name, which is why {@link resolveDurationLever} takes a `site`.
 *
 * ## The VELOCITY levers compose, on both elements
 *
 * A trap worth stating because the duration rule is so nearly its opposite: `articulateNote`
 * **re-reads** `@velocity` after each write, so `@absoluteVelocity`, `@relativeVelocity` and
 * `@absoluteVelocityChange` chain. Executed: velocity 64 with `absoluteVelocity="80"`,
 * `relativeVelocity="0.5"`, `absoluteVelocityChange="7"` performs **47**. AD-11i's one-lever
 * rule is a duration rule and does not generalise.
 *
 * ## Atoms compose ACROSS atoms, in map order
 *
 * One note can collect several atoms — `noteArtics` is a list per note — and each
 * `articulateNote` call re-reads the note it is mutating. Two `<articulation>` elements at one
 * date with `relativeDuration` 0.5 and 0.25 perform **12.5**, not 25 and not 50; a `noteid`
 * atom and a date-targeted atom on the same note likewise both apply. So the per-note effective
 * modifier is a composition of per-atom modifiers, each of which is internally last-write-wins
 * on duration and chained on velocity.
 *
 * ## An unresolvable `@name.ref` does NOT drop the atom (contrast §5.4)
 *
 * If no `<style>` is in scope, or the style in scope has no def of that name, the def is
 * silently ignored and **the atom's own inline modifiers still apply**. Executed both ways:
 * `name.ref="stacc" relativeDuration="1.2"` performs 120 on a 100-tick note with the def
 * missing, and 60 with it present (0.5 then 1.2). §5.4's accentuation skips the whole
 * instruction in the same situation, so the two sections genuinely differ and this module says
 * which is which rather than leaving it to be inferred.
 */
import { head, isNonEmpty } from '../prelude/index.js';
import { optionAt } from '../prelude/seq.js';
import type { Element } from '../xml/XomTypes.js';
import { attribute } from '../xml/tree.js';
import { ARTICULATION_MAP, ARTICULATION_STYLE } from '../mpm/names.js';
import { readAttributeValue } from '../expression/attributes.js';
import { INLINE_DURATION_PRECEDENCE } from '../expression/registry.js';
import { findStyleDef } from '../expression/styleScope.js';
import type { MpmEnvironment } from '../expression/mpmTree.js';
import { assertSpanEndRule } from './spanEnds.js';
import { resolutionAt, type OrderedMapView } from './document.js';

/**
 * The attribute whose presence takes the whole tick-domain duration branch out of play
 * (`ArticulationData.articulateNote`'s `if (this.absoluteDurationMs !== null)`).
 */
export const DURATION_SHORT_CIRCUIT = 'absoluteDurationMs';

/** Which element an attribute sits on — the key the duration rule is stated over. */
export type ArticulationSite = 'instruction' | 'def';

/**
 * The tick-domain duration levers in the order the renderer lets them win, highest first.
 *
 * Imported from the expression registry rather than restated: §5.5 names that constant as the
 * precedence, and two copies of an ordering that must agree is exactly the drift AD-33.6's
 * "wire it or remove it" is about.
 */
export const DURATION_PRECEDENCE: readonly string[] = INLINE_DURATION_PRECEDENCE;

/** Every attribute `ArticulationData` reads, in the order `articulateNote` applies them. */
export const ARTICULATION_ATTRIBUTES: readonly string[] = [
  'absoluteDelay',
  'absoluteDelayMs',
  'absoluteDurationMs',
  'absoluteDuration',
  'relativeDuration',
  'absoluteDurationChange',
  'absoluteDurationChangeMs',
  'absoluteVelocity',
  'relativeVelocity',
  'absoluteVelocityChange',
  'detuneCents',
  'detuneHz',
];

/**
 * The value at which the renderer treats an attribute as absent, per attribute.
 *
 * Not one constant, and the difference is observable: `relativeDuration` and
 * `relativeVelocity` guard on `!== 1.0`, the change and delay levers on `!== 0.0`, and the
 * three replacement attributes on `!== null` — which is why an authored `relativeVelocity="0"`
 * is a silenced note rather than a neutral one, and why a replacement attribute has no neutral
 * at all (§5.5/AD-2: present-vs-absent reads `⊥`).
 */
export const ARTICULATION_NEUTRALS: Readonly<Record<string, number | null>> = {
  absoluteDelay: 0,
  absoluteDelayMs: 0,
  absoluteDurationMs: null,
  absoluteDuration: null,
  relativeDuration: 1,
  absoluteDurationChange: 0,
  absoluteDurationChangeMs: 0,
  absoluteVelocity: null,
  relativeVelocity: 1,
  absoluteVelocityChange: 0,
  detuneCents: 0,
  detuneHz: 0,
};

/** One attribute of one atom, as written and as the renderer disposes of it. */
export interface AtomAttribute {
  readonly attribute: string;
  /** The number the renderer parses, or `NaN` where the text is unparseable. */
  readonly value: number;
  /** Where it was written — an inline `<articulation>` or the `<articulationDef>` it names. */
  readonly site: ArticulationSite;
  /** False where a higher-precedence lever on the same element shadows it (AD-11i). */
  readonly live: boolean;
  /** True where the value equals the renderer's own no-op guard for that attribute. */
  readonly neutral: boolean;
}

export interface ArticulationAtom {
  /** In common ticks, from the instruction's own `@date`. */
  readonly dateTicks: number;
  /** The entry index in the map's ordered view — the identity a matcher can pin on. */
  readonly entryIndex: number;
  readonly xmlId: string | null;
  /** `@name.ref`, whether or not it resolved. */
  readonly nameRef: string | null;
  /** The `<articulationDef>` in scope, or null where the name did not resolve. */
  readonly def: Element | null;
  /**
   * `@noteid` with its first character stripped, as the renderer strips it — unconditionally,
   * on the assumption that it reads `#id`. `noteid="n0"` therefore addresses `"0"`.
   */
  readonly noteid: string | null;
  /**
   * False for a `noteid`-targeted atom read without an MSM: the note it lands on decides its
   * date, and the renderer applies it there even when the dates disagree (§5.5/AD-7).
   */
  readonly datePositionKnown: boolean;
  /** Every attribute the renderer reads, from the def and the instruction, liveness resolved. */
  readonly attributes: readonly AtomAttribute[];
}

export interface ArticulationAtomNote {
  readonly kind: 'unresolved-def' | 'shadowed-lever' | 'noteid-targeted' | 'renderer-skip';
  readonly dateTicks: number;
  readonly detail: string;
}

export interface ArticulationAtoms {
  readonly atoms: readonly ArticulationAtom[];
  readonly notes: readonly ArticulationAtomNote[];
}

/**
 * Which duration lever fires, given the attributes present on ONE element.
 *
 * @param site `'instruction'` applies the precedence; `'def'` returns every present lever,
 *   because `ArticulationDef.articulateNote` composes them.
 * @returns the winning attribute names — one for an instruction, up to three for a def, and
 *   `['absoluteDurationMs']` alone wherever that attribute is present on an instruction.
 */
export function resolveDurationLever(
  present: (attribute: string) => boolean,
  site: ArticulationSite,
): readonly string[] {
  const levers = DURATION_PRECEDENCE.filter((lever) => present(lever));
  if (site === 'def') return levers;
  // The short-circuit is tested BEFORE the precedence, because it removes the branch the
  // precedence lives in rather than winning inside it.
  if (present(DURATION_SHORT_CIRCUIT)) return [];
  return isNonEmpty(levers) ? [head(levers)] : [];
}

/** The renderer's parse of one attribute: a number, or NaN where it cannot read one. */
function numberOf(element: Element, name: string): number | null {
  const text = readAttributeValue(element, name);
  return text === null ? null : parseFloat(text);
}

/**
 * Whether a value is the renderer's own no-op for its attribute.
 *
 * A `null` neutral is not "no neutral found": it is §5.5's REPLACEMENT case, where the
 * attribute has no neutral at all and present-vs-absent reads `⊥` (AD-2). The lookup is total
 * over {@link ARTICULATION_ATTRIBUTES}, which the test pins, so a missing key would be a
 * programmer error rather than data.
 */
function isNeutral(name: string, value: number): boolean {
  const neutral = ARTICULATION_NEUTRALS[name];
  return neutral !== null && value === neutral;
}

/**
 * Read one element's articulation attributes with the duration precedence resolved.
 *
 * The velocity and delay levers are all live whenever present — they compose (see the module
 * note) — so only the duration family has a liveness question to answer.
 */
function readAttributes(
  element: Element,
  site: ArticulationSite,
  notes: ArticulationAtomNote[],
  dateTicks: number,
): AtomAttribute[] {
  const present = (name: string) => readAttributeValue(element, name) !== null;
  const liveLevers = resolveDurationLever(present, site);

  const attributes: AtomAttribute[] = [];
  for (const name of ARTICULATION_ATTRIBUTES) {
    const value = numberOf(element, name);
    if (value === null) continue;

    const isDurationLever = DURATION_PRECEDENCE.includes(name);
    const live = !isDurationLever || liveLevers.includes(name);
    if (!live)
      notes.push({
        kind: 'shadowed-lever',
        dateTicks,
        detail: `@${name} is present but INERT on this <articulation>: ${
          present(DURATION_SHORT_CIRCUIT)
            ? `@${DURATION_SHORT_CIRCUIT} short-circuits the whole tick-domain duration branch`
            : `@${liveLevers[0]} has higher precedence and overwrites it`
        } (§5.5/AD-11i, executed). On an <articulationDef> the same pair would compose.`,
      });

    attributes.push({ attribute: name, value, site, live, neutral: isNeutral(name, value) });
  }
  return attributes;
}

/**
 * Read one scope's articulation atoms, liveness resolved.
 *
 * The def's attributes come FIRST in the returned list, because that is the order
 * `articulateNote` applies them — the def runs, then the inline modifiers land on its result.
 * A consumer that folds the list into an effective modifier must preserve that order.
 */
export function readArticulationAtoms(
  view: OrderedMapView | null,
  scaleFactor: number,
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
): ArticulationAtoms {
  assertSpanEndRule(ARTICULATION_MAP, 'event');
  if (view === null) return { atoms: [], notes: [] };

  const atoms: ArticulationAtom[] = [];
  const notes: ArticulationAtomNote[] = [];

  for (const [index, entry] of view.entries.entries()) {
    const element = entry.element;
    if (element.getLocalName() !== 'articulation') continue;

    const resolution = resolutionAt(view, index, scaleFactor, environment, globalEnvironment);
    const dateTicks = entry.date * resolution.scaleFactor;
    if (!Number.isFinite(entry.date)) {
      notes.push({
        kind: 'renderer-skip',
        dateTicks,
        detail:
          'an unparseable @date: the atom is indexed at NaN by the ordered view and can match ' +
          'no note by date, so it is carried but positioned nowhere',
      });
    }

    const nameRef = readAttributeValue(element, 'name.ref');
    let def: Element | null = null;
    if (nameRef !== null) {
      const style = findStyleDef(
        ARTICULATION_STYLE,
        optionAt(view.styleNames, index, 'a map view style-name list'),
        resolution.environment,
        resolution.globalEnvironment,
      );
      if (style !== null)
        for (const candidate of style.styleDef.getChildElements('articulationDef').toArray())
          if (attribute('name', candidate)?.getValue() === nameRef) def = candidate;

      if (def === null)
        notes.push({
          kind: 'unresolved-def',
          dateTicks,
          detail:
            `no <articulationDef name="${nameRef}"> in scope: the def is silently ignored and ` +
            'the atom’s own inline modifiers STILL APPLY — executed. Contrast §5.4, where an ' +
            'instruction with no style in scope is skipped entirely.',
        });
    }

    const rawNoteid = readAttributeValue(element, 'noteid');
    if (rawNoteid !== null)
      notes.push({
        kind: 'noteid-targeted',
        dateTicks,
        detail:
          `@noteid="${rawNoteid}" addresses "${rawNoteid.slice(1)}" — the first character is ` +
          'stripped UNCONDITIONALLY, on the assumption that it reads "#id". The atom lands on ' +
          'that note wherever it is (a date mismatch is a warning and it is applied anyway) ' +
          'and is dropped entirely if the id resolves to nothing. Without an MSM neither is ' +
          'decidable here, so the atom is carried with datePositionKnown: false (§5.5/AD-7).',
      });

    atoms.push({
      dateTicks,
      entryIndex: index,
      xmlId: attribute('id', element)?.getValue() ?? null,
      nameRef,
      def,
      noteid: rawNoteid === null ? null : rawNoteid.slice(1),
      datePositionKnown: rawNoteid === null,
      attributes: [
        ...(def === null ? [] : readAttributes(def, 'def', notes, dateTicks)),
        ...readAttributes(element, 'instruction', notes, dateTicks),
      ],
    });
  }

  return { atoms, notes };
}

/**
 * One `<articulationDef>` on its own, as the atom a `@defaultArticulation` step performs.
 *
 * The default names a def and the renderer applies it to every note in the step's span that
 * carries no atom of its own, with no inline instruction on top (AD-37.2b: an atom SHADOWS the
 * default rather than composing with it). So the atom is the def's attributes and nothing else,
 * read at site `'def'` — where every duration lever composes rather than shadowing, which is
 * exactly the affine form §5.5's pricing wants and the reason this is a call into this module
 * rather than a second reader in `articulationDefault`.
 *
 * `readAttributes`' note channel is discarded here and that is not a loss: `resolveDurationLever`
 * returns every present lever at site `'def'`, so the only note it can raise — `shadowed-lever` —
 * cannot fire.
 */
export function articulationDefAtom(def: Element, dateTicks: number): ArticulationAtom {
  return {
    dateTicks,
    entryIndex: -1,
    xmlId: attribute('id', def)?.getValue() ?? null,
    nameRef: attribute('name', def)?.getValue() ?? null,
    def,
    noteid: null,
    datePositionKnown: true,
    attributes: readAttributes(def, 'def', [], dateTicks),
  };
}

/** The live, non-neutral attributes of an atom — what a matcher will price it on. */
export function effectiveAttributes(atom: ArticulationAtom): readonly AtomAttribute[] {
  return atom.attributes.filter((candidate) => candidate.live && !candidate.neutral);
}

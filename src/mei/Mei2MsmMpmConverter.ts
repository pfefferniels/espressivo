import { Element, Attribute, Elements, Document } from '../xml/XomTypes.js';
import { addToMap } from '../msm/dateMap.js';
import { duration2decimal } from '../music/duration.js';
import { accidString2decimal, pname2midi } from '../music/pitch.js';
import { extractAllIntegersFromString, getFilenameWithoutExtension } from '../music/text.js';
import { copyId } from '../xml/ids.js';
import {
  allChildElements,
  attribute,
  cloneElement,
  descendantElements,
  firstChildElement,
  firstChildElementOf,
  requireAttribute,
  requireAttributeValue,
  requireFirstChildElement,
  requireParentElement,
  reverseDescendantElements,
  getAttributeValue,
  getNextSiblingElement,
  parentElement,
} from '../xml/tree.js';
import { MissingNodeError } from '../xml/errors.js';
import { describeMpmParseError } from '../mpm/elements/parseError.js';
import { Mei } from './Mei.js';
import {
  buildOrnamentData,
  createMeiOrnamentDef,
  resolveOrnamentSign,
} from './MeiOrnamentExpander.js';
import { VERSION } from '../version.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { Goto } from '../msm/Goto.js';
import { Msm } from '../msm/Msm.js';
import { Mpm } from '../mpm/Mpm.js';
import { v4 as uuidv4 } from 'uuid';
import { Performance } from '../mpm/elements/Performance.js';
import type { Header } from '../mpm/elements/Header.js';
import type { Dated } from '../mpm/elements/Dated.js';
import { Part as MpmPart } from '../mpm/elements/Part.js';
import { GenericMap } from '../mpm/elements/maps/GenericMap.js';
import { TempoMap } from '../mpm/elements/maps/TempoMap.js';
import { DynamicsMap } from '../mpm/elements/maps/DynamicsMap.js';
import { ArticulationMap } from '../mpm/elements/maps/ArticulationMap.js';
import { OrnamentationMap } from '../mpm/elements/maps/OrnamentationMap.js';
import type {
  ArticulationStyle,
  DynamicsStyle,
  OrnamentationStyle,
  TempoStyle,
} from '../mpm/elements/styles/style.js';
import { TempoDef } from '../mpm/elements/styles/defs/TempoDef.js';
import { DynamicsDef } from '../mpm/elements/styles/defs/DynamicsDef.js';
import { ArticulationDef } from '../mpm/elements/styles/defs/ArticulationDef.js';
import { OrnamentDef } from '../mpm/elements/styles/defs/OrnamentDef.js';
import { TempoData } from '../mpm/elements/maps/data/TempoData.js';
import { DynamicsData } from '../mpm/elements/maps/data/DynamicsData.js';
import { OrnamentData } from '../mpm/elements/maps/data/OrnamentData.js';
import { Author } from '../mpm/elements/metadata/Author.js';
import { Comment } from '../mpm/elements/metadata/Comment.js';
import { RelatedResource } from '../mpm/elements/metadata/RelatedResource.js';
import {
  firstPresent,
  foldl,
  head,
  isErr,
  isNonEmpty,
  isOk,
  mapPresent,
  orDefault,
  unwrapOr,
} from '../prelude/index.js';
import { elementAt, findLast, removeAt } from '../prelude/seq.js';

/**
 * The circle of fifths as `[midi.pitch, pitchname]` pairs, sharpwards and flatwards — the
 * accidentals a key signature carries, in the order it accumulates them.
 *
 * `makeKeySignature` takes the first `|accidCount|` entries of one of these, so the order is
 * the whole content: F♯ C♯ G♯ D♯ A♯ E♯ B♯ going sharpwards, B♭ E♭ A♭ D♭ G♭ C♭ F♭ going
 * flatwards. Java holds them as two parallel arrays indexed by one counter, rebuilt on every
 * call; as pairs at module scope they are neither indexed nor reallocated.
 *
 * The flatward list is the sharpward one reversed, and is written out rather than derived so
 * that reading either one against a key-signature table needs no mental step.
 */
const CIRCLE_OF_FIFTHS_SHARPWARD = [
  ['5.0', 'F'],
  ['0.0', 'C'],
  ['7.0', 'G'],
  ['2.0', 'D'],
  ['9.0', 'A'],
  ['4.0', 'E'],
  ['11.0', 'B'],
] as const;

const CIRCLE_OF_FIFTHS_FLATWARD = [
  ['11.0', 'B'],
  ['4.0', 'E'],
  ['9.0', 'A'],
  ['2.0', 'D'],
  ['7.0', 'G'],
  ['0.0', 'C'],
  ['5.0', 'F'],
] as const;

/**
 * What the walker does with an element once its handler has run.
 *
 * This is the traversal policy that used to be spelled `continue` / `break` inside the
 * dispatch switch, made explicit: `'done'` means the element is finished (either it was
 * ignored or its handler took over the descent itself), `'descend'` means the walker
 * recurses into its children. The set of `'descend'` elements is exactly the set whose
 * children reach the converter through the generic path, so moving an element between the
 * two silently changes what gets converted.
 */
type Traversal = 'done' | 'descend';

/**
 * The movement being converted: the MSM and the MPM performance being filled, and the
 * `meiHead` `work` this `mdiv` claims, if any.
 *
 * These were `currentMsmMovement`, `currentPerformance` and `currentWork`, and unlike the
 * cursors in {@link WalkContext} they were never saved and restored — `makeMovement` set them
 * once and {@link Mei2MsmMpmConverter.reset} cleared them before the next `mdiv`. That is
 * ambient *context* rather than a position: every method below the mdiv reads the same three
 * values and none of them may change one. Which is exactly a Reader, and is why this is one
 * immutable record reached through {@link WalkContext.movement} rather than three fields.
 *
 * `work` is the one that could be missed, and the reason `reset()` clearing it was load-bearing:
 * `makeMovement` assigns it only when the `mdiv` claims a `work` by `@decls` or matches one by
 * `@n`, so as a field it would otherwise have kept the *previous* movement's work and served
 * that movement's fallback tempo and `<meter>` to this one. As a field of a record built per
 * movement, "not claimed" is simply null.
 *
 * The fourth field of the old set, `currentMdiv`, is not here: nothing but `makeMovement`
 * itself ever read it, so it is a local variable there and not context at all.
 */
interface MovementContext {
  /** the root of the MSM being filled */
  readonly msm: Element;
  /** the `meiHead` `work` this movement claims, or null if it claims none */
  readonly work: Element | null;
  /** the MPM performance being filled */
  readonly performance: Performance;
}

/**
 * Where in the MEI the walk currently is: the movement being filled, plus the part, layer,
 * measure and chord enclosing the element being converted.
 *
 * These four were `this.currentPart` / `currentLayer` / `currentMeasure` / `currentChord`,
 * and every one of them was **dynamic scoping written by hand**:
 *
 * ```ts
 * const parentPart = this.currentPart;
 * this.currentPart = this.makePart(staffDef);
 * this.convertElement(staffDef);          // ← the whole subtree runs under the new value
 * this.currentPart = parentPart;
 * ```
 *
 * The save/restore pair is the giveaway: a value that is installed for the duration of a
 * recursive call and then put back is a *parameter of that call*, spelled the long way. As a
 * field it made every one of the converter's ~196 methods unreadable alone — `processNote`'s
 * behaviour depends on which part, layer and chord are live, and nothing in its signature said
 * so. As a record threaded down {@link Mei2MsmMpmConverter.convertElement} it is stated: a
 * method that takes `ctx` reads its enclosing context, a method that does not, does not, and
 * the "restore" is simply not passing the new record any further than the subtree it belongs
 * to.
 *
 * Every field is `readonly` and the record is never mutated — a descent builds a new one
 * (`{ ...ctx, part: … }`), which is the reason no restore is needed. Four such records are
 * allocated per staff, layer, measure and chord respectively, none per note, so the hot path
 * is untouched.
 *
 * **`measure` is the one that is not quite a save/restore.** {@link
 * Mei2MsmMpmConverter.processMeasure} used to write `this.currentMeasure = null` after the
 * descent rather than restoring the saved value — correct only because measures do not nest,
 * so the saved value was always null anyway. Here the difference disappears: the record the
 * measure's subtree gets simply does not outlive it.
 */
interface WalkContext {
  /**
   * the movement being filled, or null before any `mdiv` has been entered
   *
   * The null is not decoration: {@link Mei2MsmMpmConverter.getMidiTime} and
   * {@link Mei2MsmMpmConverter.processReh} branch on it, because a `body` is walked before
   * any movement exists and an element outside every `mdiv` still reaches the dispatch table.
   */
  readonly movement: MovementContext | null;
  /** the MSM `part` being filled, or null outside any staff */
  readonly part: Element | null;
  /** the MEI `layer` being walked, or null outside any voice */
  readonly layer: Element | null;
  /** the MEI `measure` being walked, or null between measures */
  readonly measure: Element | null;
  /** the MEI `chord` being walked, or null for a note that stands alone */
  readonly chord: Element | null;
}

/**
 * The context of an element that no movement, part, layer, measure or chord encloses.
 *
 * {@link Mei2MsmMpmConverter.convertMei} starts from it, walking a `body` whose children are
 * `mdiv`s — and {@link Mei2MsmMpmConverter.makeMovement} starts each movement from
 * `{ ...NOTHING_OPEN, movement }`, which is exactly what {@link Mei2MsmMpmConverter.reset}'s
 * eight `this.currentX = null` lines used to say.
 */
const NOTHING_OPEN: WalkContext = {
  movement: null,
  part: null,
  layer: null,
  measure: null,
  chord: null,
};

/**
 * The movement the walk is inside.
 *
 * Null here means the walk has not entered an `mdiv`, which is a broken invariant for every
 * caller that goes through this one: they are below a handler `makeMovement` dispatched. The
 * two places where an absent movement is a real *outcome* — {@link
 * Mei2MsmMpmConverter.getMidiTime} and {@link Mei2MsmMpmConverter.processReh} — branch on
 * `ctx.movement === null` themselves rather than coming here.
 */
function requireMovement(ctx: WalkContext): MovementContext {
  if (ctx.movement === null)
    throw new MissingNodeError('no MSM movement is currently being converted');
  return ctx.movement;
}

/** the MPM performance being filled; see {@link requireMovement} */
function requirePerformance(ctx: WalkContext): Performance {
  return requireMovement(ctx).performance;
}

/**
 * The `global/dated/<name>` map of the MSM movement being filled.
 *
 * This path is read thirty-odd times, and used to be spelled out at each of them as
 * `this.currentMsmMovement!.getFirstChildElement('global')!.getFirstChildElement('dated')!
 * .getFirstChildElement(name)` — three assertions per site for a skeleton
 * {@link Msm.createMsm} builds unconditionally. `global` and `dated` are therefore
 * required; the map itself is not, because a map is created on demand and several callers
 * hand the result straight to `addToMap`, which treats a null map as "nowhere to add".
 */
function globalDatedMap(ctx: WalkContext, name: string): Element | null {
  return datedMap(requireFirstChildElement(requireMovement(ctx).msm, 'global'), name);
}

/** {@link globalDatedMap} for the callers that read or write the map; see {@link requireDatedMap} */
function requireGlobalDatedMap(ctx: WalkContext, name: string): Element {
  return requireDatedMap(requireFirstChildElement(requireMovement(ctx).msm, 'global'), name);
}

/**
 * The MPM performance's global `header`, where the styles this converter authors live.
 *
 * `Performance.createPerformance` builds `global`, its `header` and its `dated` together, so
 * neither can be absent once a performance exists — which is what the two assertions in
 * `globalHeader(ctx)` were claiming, once per style lookup.
 */
function globalHeader(ctx: WalkContext): Header {
  const global = requirePerformance(ctx).getGlobal();
  if (global === null) throw new MissingNodeError('the MPM performance has no global section');
  const header = global.getHeader();
  if (header === null) throw new MissingNodeError('the MPM global section has no header');
  return header;
}

/** the MPM performance's global `dated`, where its maps live; see {@link globalHeader} */
function globalDated(ctx: WalkContext): Dated {
  const global = requirePerformance(ctx).getGlobal();
  if (global === null) throw new MissingNodeError('the MPM performance has no global section');
  const dated = global.getDated();
  if (dated === null) throw new MissingNodeError('the MPM global section has no dated');
  return dated;
}

/**
 * The MSM part the walk is inside.
 *
 * Roughly ninety reads of `this.currentPart` stood as `this.currentPart!` before RULE N2a;
 * they became a `requirePart()` method, and are now this. The null is real — `part` is null
 * until a `staff` or `staffDef` opens one — but on every path a fixture reaches, the handler
 * was dispatched from below the element that set it, so an empty cursor here is a broken
 * invariant and not an outcome. Where it *is* an outcome the callers still branch on
 * `ctx.part === null` directly; this is for the sites that would otherwise assert.
 */
function requirePart(ctx: WalkContext): Element {
  if (ctx.part === null) throw new MissingNodeError('the walk is not inside a part');
  return ctx.part;
}

/** the `dated/<name>` map of the MSM part the walk is inside; see {@link datedMap} */
function partDatedMap(ctx: WalkContext, name: string): Element | null {
  return datedMap(requirePart(ctx), name);
}

/** {@link partDatedMap} for the callers that read or write the map; see {@link requireDatedMap} */
function requirePartDatedMap(ctx: WalkContext, name: string): Element {
  return requireDatedMap(requirePart(ctx), name);
}

/**
 * One entry of {@link Mei2MsmMpmConverter.ELEMENT_HANDLERS}.
 *
 * Handlers are free functions rather than methods so the table can be a single static
 * value; they receive the converter explicitly because the conversion's *output* state — the
 * movement being filled, the deferred work lists — is still the converter. Where the walk
 * *is* is the third parameter: see {@link WalkContext}.
 */
type ElementHandler = (c: Mei2MsmMpmConverter, e: Element, ctx: WalkContext) => Traversal;

/**
 * The `dated/<name>` map of an MSM `global` or `part` element, or null if it holds no such map.
 *
 * MSM puts every timed list under a `dated` wrapper, so essentially every map access in this
 * converter is a two-step descent. Written out, that step was
 * `container.getFirstChildElement('dated')!.getFirstChildElement(name)` — seventy-odd sites,
 * each asserting a `dated` that {@link Msm.createMsm} and {@link Mei2MsmMpmConverter.makePart}
 * build unconditionally, and which is therefore *required* here rather than asserted.
 *
 * The map itself stays nullable: maps are created on demand, and most callers pass the result
 * straight to `addToMap`, whose contract already includes "null map, nothing to do".
 */
function datedMap(container: Element, name: string): Element | null {
  return firstChildElementOf(requireFirstChildElement(container, 'dated'), name);
}

/**
 * {@link datedMap} for the callers that go on to read or write the map, where its absence is a
 * broken skeleton rather than an outcome.
 *
 * `Msm.createMsm` gives every `global/dated` a `timeSignatureMap`, `keySignatureMap`,
 * `markerMap`, `sectionMap`, `phraseMap`, `sequencingMap`, `pedalMap` and `miscMap`, and
 * `Msm.addPart` gives every part's `dated` the same set minus `sectionMap` plus `score`. Those
 * are the only names asked for here, and the empty ones are not pruned until `msmCleanup`
 * runs at the very end of the conversion — long after every read below.
 */
function requireDatedMap(container: Element, name: string): Element {
  return requireFirstChildElement(requireFirstChildElement(container, 'dated'), name);
}

/**
 * MEI's `@label`, else its `@n`, else null — the readable name of a structural element.
 *
 * `phrase` (twice) and `section` carry the same optional pair with the same preference, and
 * each wrote it as `if (e.getAttribute('label') !== null) … e.getAttributeValue('label')!
 * else if (e.getAttribute('n') !== null) …` — four attribute lookups and two assertions to
 * express one choice. {@link firstPresent} is the choice.
 *
 * `ending` is deliberately not routed through here: {@link processEnding} prefers `@n` over
 * `@label`, the other way round, and that order decides which ending a `goto` names.
 */
function labelOrN(ofThis: Element): string | null {
  return firstPresent(ofThis.getAttributeValue('label'), ofThis.getAttributeValue('n'));
}

/**
 * An MSM part's running clock: its `currentDate` attribute, as an attribute rather than a
 * value, so a caller can read and advance it through the same handle.
 *
 * Every part carries one from the moment {@link Mei2MsmMpmConverter.makePart} creates it, and
 * {@link Mei2MsmMpmConverter.processStaff} refreshes it on re-entry, so its absence is a
 * broken MSM and not a case to branch on — which is what the twenty-odd
 * `part.getAttribute('currentDate')!` sites were saying with an assertion.
 *
 * The pairing matters more than the assertion: the write sites read the clock through
 * `getAttributeValue(…)!` and wrote it through `getAttribute(…)!`, two lookups of the same
 * attribute with the arithmetic in between. One handle makes it one lookup and makes it
 * visible that the value being incremented is the one being stored.
 */
function partClock(part: Element): Attribute {
  return requireAttribute('currentDate', part);
}

/** move an MSM part's clock forward by `ticks`; see {@link partClock} */
function advancePartClock(part: Element, ticks: number): void {
  const clock = partClock(part);
  clock.setValue(String(parseFloat(clock.getValue()) + ticks));
}

/**
 * An MPM part's `dated`, where the part-local maps live.
 *
 * `Part.createPart` builds a part's `header` and `dated` in one go and nothing removes
 * either, so the fifteen `mpmDated(part)` sites were asserting a fact the constructor
 * guarantees. The MPM counterpart of {@link Mei2MsmMpmConverter.globalDated}, which does the
 * same for the performance's global section.
 */
function mpmDated(part: MpmPart): Dated {
  const dated = part.getDated();
  if (dated === null)
    throw new MissingNodeError(`the MPM part '${part.getName()}' has no dated environment`);
  return dated;
}

/**
 * The element an MPM map holds at `index`, where the index came from the map itself.
 *
 * `GenericMap.getElement` answers null for an out-of-range index, which the four call sites
 * asserted away — each of them having just been *handed* the index by `addDynamicsFromData`,
 * `addTempo`, `addOrnamentFromData` or the map's own `size()`. Java dereferences the same
 * lookup unguarded and would NPE; this names what was missing instead.
 */
function mapElement(map: GenericMap, index: number): Element {
  const element = map.getElement(index);
  if (element === null)
    throw new MissingNodeError(`the MPM map holds no element at index ${index}`);
  return element;
}

/** element without effect on the sounding result: skipped whole, not descended into */
const IGNORE: ElementHandler = () => 'done';

/** structural wrapper with no meaning of its own: nothing to do but walk its children */
const DESCEND: ElementHandler = () => 'descend';

/**
 * Converts MEI into MSM (the score, as written) plus MPM (the performance instructions
 * that make it expressive). This is where essentially all the musical knowledge in the
 * port lives; {@link Mei} only owns the tree and {@link Msm}/{@link Mpm} only own the
 * output formats.
 *
 * ### How to use it
 *
 * One converter, one conversion: {@link convert} is not re-entrant, because the object
 * *is* the conversion's working state. Instantiate, call `convert(mei)`, discard.
 *
 * ### The shape of the conversion
 *
 * `convert(mei)` ({@link convertMei}) runs a fixed sequence:
 * 1. bail out unless there is a `music/body` to convert;
 * 2. raise {@link ppq} if {@link Mei.computeMinimalPPQ} says this score needs a finer grid
 *    — and remember the original, because the field is restored at the end;
 * 3. snapshot the MEI document if `cleanup` is set, since the next step rewrites it;
 * 4. preprocess: resolve `copyof`/`sameas`, drop `rend`, resolve `expansion`s (unless
 *    `ignoreExpansions`) — see {@link Mei} for what each does;
 * 5. walk each `body` with {@link convertElement}, which is where the MSMs and MPMs get
 *    built and pushed onto {@link movements} / {@link performances};
 * 6. postprocess the MPMs, restore `ppq` and the MEI document, clean the MSMs, and name
 *    the outputs after the source file.
 *
 * Step 5 is the recursive heart: {@link convertElement} looks every MEI element name up in
 * {@link ELEMENT_HANDLERS} and either handles it, descends into it, or skips it. Everything
 * else in this class is a handler for one of those elements (`processNote`,
 * `processMeasure`, …), a builder (`makeMovement`, `makePart`, …), or a shared computation
 * (`getMidiTime`, `computeDuration`, `computePitch`, …).
 *
 * ### Working state: what is a parameter and what is a field
 *
 * Java keeps this conversion's state on a `Helper` instance; this port hoisted it onto the
 * converter, which is why the port's `Helper` held no state at all — and is why T14 could
 * dissolve it into plain modules. It arrived as eight `current*` fields, and the division
 * between them turned out to be the design:
 *
 * - **Where the walk is** — the part, layer, measure and chord — is {@link WalkContext}, a
 *   parameter threaded down {@link convertElement}. Each of the four was installed before a
 *   recursive call and put back after it, which is dynamic scoping spelled by hand; as a
 *   parameter, a method that depends on the enclosing part says so in its signature. That is
 *   what makes any one of the ~196 methods below readable on its own.
 * - **Which movement is being filled** — the old `currentMsmMovement`, `currentWork` and
 *   `currentPerformance` — is {@link MovementContext}, reached through
 *   {@link WalkContext.movement}. These were set once per `mdiv` and never restored, i.e.
 *   ambient context rather than a position, which is a Reader; as one immutable record built
 *   per movement, "cleared between movements" stops being something `reset` has to remember.
 *   `currentMdiv` is not in it: only `makeMovement` ever read it, so it is a local there.
 * - **Genuinely sequential state** stays a field, because it is an accumulator and not a
 *   position: the deferred lists (`accid`, `endids`, `tstamp2s`, `lyrics`,
 *   `arpeggiosToSort`) and {@link endingCounter}. They exist because MEI lets an element
 *   refer forward: an `accid` applies to notes that come later in the measure, an
 *   `endid`/`tstamp2` closes a span whose end has not been walked yet, and an arpeggio's
 *   note order is not known until every note it names has a pitch. Each is drained at a
 *   defined point — `accid` per measure, `endids`/`tstamp2s` as the referenced elements are
 *   met ({@link checkEndid}), `arpeggiosToSort` at the end of the movement. {@link reset} is
 *   now about exactly these.
 * - **The real running clock is not a field at all**: it is `part/@currentDate`, an attribute
 *   on the MSM output document, advanced by `processNote`/`processChord`/`processRest` and
 *   erased by `msmCleanupSingle` before delivery. See {@link partClock}.
 *
 * The handlers in {@link ELEMENT_HANDLERS} still take the converter itself, because the
 * accumulators above really are the converter's.
 *
 * ARCHITECTURE.md §8.5 ruled the first two bullets out of scope, on the grounds that
 * `reset()`'s semantics are subtle and the fixture suite cannot prove a change in a field's
 * *lifetime*. The second half of that is exactly true and was measured before the split: all
 * sixteen MEI fixtures hold one `mdiv` each, so `reset` is never asked to clear anything. The
 * control the corpus lacks is `tests/mei/Mei2MsmMpmConverter.test.ts`'s multi-movement
 * section, written first, which pins every field's lifetime — and found one real leak in
 * `arpeggiosToSort` on the way.
 *
 * ### Parity constraints
 *
 * All timing, duration and pitch arithmetic is compared byte-for-byte against
 * Java-generated MSM/MPM/MIDI references. Expression order, `parseFloat`/`parseInt`
 * choices and rounding are therefore frozen, as is the order in which
 * {@link addUUID} is called. The element dispatch is equally frozen: the {@link Traversal}
 * each {@link ELEMENT_HANDLERS} entry returns encodes which elements are descended into, and
 * moving an element between the traversal groups changes what gets visited.
 *
 * Port of `meico.mei.Mei2MsmMpmConverter`.
 * @author Axel Berndt
 */
export class Mei2MsmMpmConverter {
  private mei: Mei | null = null;
  /** Both are constructor options and neither is touched again — RULE I4, `prefer-readonly`. */
  private readonly ignoreExpansions: boolean = false;
  private readonly cleanup: boolean = true;
  /**
   * Whether `<trill>`, `<mordent>` and `<turn>` are expanded into MPM ornaments
   * ({@link MeiOrnamentExpander}). **Defaults to false, and that default is load-bearing.**
   *
   * Expansion authors MPM the Java reference does not author, so a converter that expanded by
   * default would change the output of every fixture carrying an ornament sign and break the
   * MEI equivalence suites against their Java references. The layering that avoids this is the
   * reference's own: in Java the expansion is a pre-pass in `Mei.exportMsmMpm`, and
   * `new Mei2MsmMpmConverter(…).convert(mei)` — which is what those suites call, and what
   * `Mei.exportMsmMpm` throws in favour of here (see {@link Mei.exportMsmMpm}) — never expands.
   *
   * The facade turns it on: `convertMeiToMsmMpm` passes `ConvertOptions.expandOrnaments ?? true`,
   * mirroring PR #32's `ignoreOrnaments` CLI flag, whose default is likewise "expansion on".
   * So the *product* expands by default and the *parity harness* does not, which is the split
   * the two callers want.
   */
  private readonly expandOrnaments: boolean = false;

  /** the tick grid; raised during {@link convertMei} if the source needs finer resolution */
  protected ppq = 720;
  /** serial number for the synthetic markers {@link processEnding} generates */
  protected endingCounter = 0;
  protected dontUseChannel10 = true;

  // --- deferred work, drained at the points named in the class comment ---
  /** accidentals seen in this measure, applying to later notes of the same pitch */
  protected accid: Element[] = [];
  /** MSM entries still waiting for the MEI element their `endid` names */
  protected endids: Element[] = [];
  /** MSM entries still waiting for the measure their `tstamp2` names */
  protected tstamp2s: Element[] = [];
  protected lyrics: Element[] = [];
  /** every note and chord of the current mdiv, by id — the target of `startid`/`plist` */
  protected allNotesAndChords = new Map<string, Element>();
  /** arpeggio note lists to order by pitch once all pitches are known; the flag is "upwards" */
  protected arpeggiosToSort: KeyValue<Attribute, boolean>[] = [];

  protected movements: Msm[] = [];
  protected performances: Mpm[] = [];

  /** the MEI being converted, set by {@link convertMei} before anything below it runs */
  private requireMei(): Mei {
    if (this.mei === null) throw new MissingNodeError('no MEI is currently being converted');
    return this.mei;
  }

  /**
   * The settings other than `ppq` all have a default, and the defaults are the field
   * initialisers above spelled a second time — which is what lets this be one signature.
   *
   * Java overloads the name (`(ppq)` for defaults, `(ppq, …)` for the full set) and the port
   * followed, but the "default settings" arm was declared and never called: every caller in
   * `src/` and `tests/` passes at least four arguments. Default parameters express the same
   * thing without a second declaration or a `??` chain, and additionally make the partial
   * forms — `(ppq, dontUseChannel10)` — legal, which the two overloads refused for no reason.
   */
  constructor(
    ppq: number,
    dontUseChannel10 = true,
    ignoreExpansions = false,
    cleanup = true,
    expandOrnaments = false,
  ) {
    this.ppq = ppq;
    this.dontUseChannel10 = dontUseChannel10;
    this.ignoreExpansions = ignoreExpansions;
    this.cleanup = cleanup;
    this.expandOrnaments = expandOrnaments;
  }

  /**
   * Converts the provided MEI data into MSM and MPM format and returns a tuplet of lists.
   *
   * Java overloads this name: `convert(Mei)` is the conversion, `convert(Element)` is the
   * recursive walker. The walker is {@link convertElement} here and is private, because no
   * caller outside the conversion ever meaningfully drove it — which leaves this method with
   * one signature and no `instanceof` dispatch.
   */
  convert(mei: Mei): KeyValue<Msm[], Mpm[]> {
    return this.convertMei(mei);
  }

  /** the whole conversion, step by step; see the class comment for the outline */
  private convertMei(mei: Mei): KeyValue<Msm[], Mpm[]> {
    // Java opens with `if (mei == null) { print; return empty; }`. Nothing can reach it here:
    // the sole caller is {@link convert}, whose parameter is a non-nullable `Mei`. The case it
    // was really guarding — a `Mei` with nothing in it — is not null at all and is caught two
    // lines below, where `getMusic()` answers null for exactly that. The branch is deleted
    // rather than reworded, along with the `console.error` the console sweep moved into it.
    //
    // The two progress banners this method opened and closed with — "Converting X to MSM and
    // MPM." and "conversion finished. Time consumed: N milliseconds" — went in that sweep,
    // with the `startTime` that existed only to feed the second.
    this.mei = mei;

    // `getMusic()` is null exactly when the instance is empty, so one read covers both of the
    // first two tests and gives the third something to look at without an assertion.
    const music = this.mei.getMusic();
    if (music === null || music.getFirstChildElement('body', music.getNamespaceURI()) === null)
      return new KeyValue<Msm[], Mpm[]>([], []);

    const minPPQ = this.mei.computeMinimalPPQ();
    const originalPPQ = this.ppq;
    if (minPPQ > this.ppq) {
      this.ppq = minPPQ;
      console.error(
        `The specified pulses per quarter note resolution (ppq) is too coarse to capture the shortest duration values in the mei source with integer values. Using the minimal required resolution of ${this.ppq} instead`,
      );
    }

    // The snapshot `cleanup` promises to restore, taken before the three preprocessing passes
    // rewrite the document in place. `getDocument()` is null only for an empty instance and
    // the check above has ruled that out, so the `null` arm below is unreachable — it is
    // written out rather than asserted away, which costs one test and states the invariant.
    const orig: Document | null = this.cleanup
      ? mapPresent(this.mei.getDocument(), (document) => document.copy())
      : null;

    this.mei.resolveCopyofsAndSameas();
    this.mei.removeRendElements();
    if (!this.ignoreExpansions) this.mei.resolveExpansions();

    // Re-read rather than reusing `music`: `resolveExpansions` replaces the whole `music`
    // element with a regularized copy, so the element tested at the top of this method may no
    // longer be in the tree. Java dereferences the fresh lookup unguarded and would NPE if
    // preprocessing had destroyed it, which is what the `!` here used to mean; a
    // `MissingNodeError` is the same control flow with the cause named.
    const preprocessedMusic = this.mei.getMusic();
    if (preprocessedMusic === null)
      throw new MissingNodeError('preprocessing left the MEI without a music element');
    const bodies = preprocessedMusic.getChildElements('body', preprocessedMusic.getNamespaceURI());
    // A `body` holds `mdiv`s and each of those opens its own movement, so the walk starts
    // outside every cursor — see {@link NOTHING_OPEN}.
    for (let b = 0; b < bodies.size(); ++b) this.convertElement(bodies.get(b), NOTHING_OPEN);

    const msms: Msm[] = [...this.movements];
    const mpms: Mpm[] = [...this.performances];

    Mei2MsmMpmConverter.mpmPostprocessing(mpms);

    this.ppq = originalPPQ;

    if (this.cleanup) {
      if (orig !== null) this.mei.setDocument(orig);
      Mei2MsmMpmConverter.msmCleanup(msms);
    }

    const meiFile = this.mei.getFile();
    if (meiFile !== null) {
      // Java writes this as four loops: a lone export is named after the source file, a
      // series after the source file plus its index, once for MSM and once for MPM. It is
      // one rule with two suffixes, so it is stated once here and applied by iteration —
      // which also lets `getFile()` be read a single time rather than asserted non-null on
      // each of the four passes.
      const stem = getFilenameWithoutExtension(meiFile);
      const exportName = (index: number, count: number, extension: string): string =>
        count === 1 ? `${stem}.${extension}` : `${stem}-${index}.${extension}`;

      msms.forEach((msm, i) => msm.setFile(exportName(i, msms.length, 'msm')));
      mpms.forEach((mpm, i) => mpm.setFile(exportName(i, mpms.length, 'mpm')));

      // A lone performance additionally carries a back-reference to the movement it
      // renders. `makeMovement` appends to `movements` and `performances` together, so one
      // performance means one movement, and `firstPair` is that fact stated rather than
      // asserted: a pairing that somehow failed to hold yields no related resource instead
      // of dereferencing an absent movement.
      if (mpms.length === 1 && isNonEmpty(msms) && isNonEmpty(mpms)) {
        const onlyMsm = head(msms);
        const onlyMpm = head(mpms);
        const msmFile = onlyMsm.getFile();
        if (msmFile !== null) {
          // `RelatedResource.fromUri` returns its reason now instead of printing it; there is
          // no reason to have here, since both arguments are non-null strings, but the
          // check is what says so rather than an `!`.
          const msmRelatedResource = RelatedResource.fromUri(msmFile, 'msm');
          if (isOk(msmRelatedResource))
            onlyMpm.getMetadata()?.addRelatedResource(msmRelatedResource.value);
        }
      }
    }

    return new KeyValue<Msm[], Mpm[]>(msms, mpms);
  }

  /**
   * The element dispatch: MEI element name → what {@link convertElement} does with it.
   *
   * **The {@link Traversal} each handler returns is the real content of this table**, and it
   * splits the 118 known elements four ways:
   * - {@link IGNORE} (53) — no effect on the sounding result: `clef`, `barline`, `annot`, …;
   * - {@link DESCEND} (17) — structural wrappers with no meaning of their own, whose children
   *   are the music: `score`, `staffGrp`, `beam`, `parts`, …;
   * - handler then `'done'` (36) — the handler took over the descent itself, so nothing below
   *   the element is visited by *this* loop: `processMeasure`, `processLayer`, `processNote`, …;
   * - handler then `'descend'` (10) — the handler annotates the element but still wants its
   *   children walked: `processKeySig`, `processScoreDef`, `processOctave`, …. (Not
   *   `processStaffDef`, which the pre-T15 comment cited here: `staffDef` is `'done'`,
   *   because it drives its own descent.)
   *
   * **Absence from this table is meaningful**: an unknown element is skipped whole, not
   * descended into. That is what the cascade's `default: continue` said.
   *
   * The set of `'descend'` elements is exactly the set whose children reach the converter
   * through the generic path, so moving an element between the groups silently changes what
   * gets converted. This table is frozen against the Java reference in that sense; T15
   * converted it from a `switch` whose `continue`/`break` carried the same meaning, under a
   * mechanical census that required every entry to keep its calls, its arguments and its
   * terminator.
   *
   * Two entries carry a condition rather than a fixed traversal: `chord` skips grace chords
   * entirely (`grace` attribute present), and `tuplet` descends only when
   * {@link processTuplet} reports it could not handle the tuplet itself. `bTrem`/`fTrem` are
   * routed to {@link processChord} because MEI models them as chord-like containers.
   *
   * The editorial-markup elements split along the same line: `add`, `corr`, `expan`, `orig`,
   * `reg`, `sic`, `subst`, `supplied` and `unclear` are descended into (their content is
   * music), while `abbr`, `damage` and `gap` are skipped.
   *
   * `trill`, `mordent` and `turn` route to {@link processOrnamentSign}, which expands them
   * into MPM v3 ornaments — but only when {@link expandOrnaments} is on, and it is off by
   * default. Upstream meico ignores all three (its Java carries a TODO saying so), so with the
   * flag off this dispatch behaves exactly as `IGNORE` did and the MEI equivalence suites keep
   * comparing against their Java references. See {@link expandOrnaments} for why the default
   * lives here rather than at the facade. `arpeg` is untouched by any of this: it keeps its own
   * v2 path through {@link processArpeg} (DESIGN.md D6).
   *
   * **The null prototype is load-bearing, not a style choice.** On a plain object literal the
   * lookup below inherits from `Object.prototype`, so an element named `valueOf`,
   * `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString` or
   * `__proto__` would resolve to a *defined* member, fail the `undefined` test and be invoked
   * — throwing, where `default: continue` skipped it. `getLocalName()` strips namespaces, so
   * that is reachable from foreign-namespace or malformed content. `Object.create(null)` makes
   * the lookup miss for every name that is not one of the 118 own keys, which is what the
   * cascade's `default:` meant. The `satisfies` is load-bearing too: without it `Object.assign`
   * drops the contextual typing and all 96 arrow parameters become implicit `any`.
   */
  private static readonly ELEMENT_HANDLERS: Readonly<Record<string, ElementHandler | undefined>> =
    Object.assign(Object.create(null) as Record<string, ElementHandler | undefined>, {
      // T15-TABLE-START
      abbr: IGNORE,
      accid: (c, e, ctx) => {
        c.processAccid(e, ctx);
        return 'done';
      },
      add: DESCEND,
      anchorText: IGNORE,
      annot: IGNORE,
      app: (c, e, ctx) => {
        c.processApp(e, ctx);
        return 'done';
      },
      arpeg: (c, e, ctx) => {
        c.processArpeg(e, ctx);
        return 'done';
      },
      artic: (c, e, ctx) => {
        c.processArtic(e, ctx);
        return 'done';
      },
      barline: IGNORE,
      beam: DESCEND,
      beamSpan: IGNORE,
      beatRpt: (c, e, ctx) => {
        c.processBeatRpt(e, ctx);
        return 'done';
      },
      bend: IGNORE,
      breath: (c, e, ctx) => {
        c.processBreath(e, ctx);
        return 'done';
      },
      bTrem: (c, e, ctx) => {
        c.processChord(e, ctx);
        return 'done';
      },
      caesura: IGNORE,
      choice: (c, e, ctx) => {
        c.processChoice(e, ctx);
        return 'done';
      },
      chord: (c, e, ctx) => {
        if (e.getAttribute('grace') !== null) return 'done';
        c.processChord(e, ctx);
        return 'done';
      },
      chordTable: IGNORE,
      clef: IGNORE,
      clefGrp: IGNORE,
      corr: DESCEND,
      curve: IGNORE,
      custos: IGNORE,
      damage: IGNORE,
      del: (c, e, ctx) => {
        c.processDel(e, ctx);
        return 'done';
      },
      dir: IGNORE,
      div: IGNORE,
      dot: (c, e) => {
        c.processDot(e);
        return 'done';
      },
      dynam: (c, e, ctx) => {
        c.processDynam(e, ctx);
        return 'done';
      },
      ending: (c, e, ctx) => {
        c.processEnding(e, ctx);
        return 'done';
      },
      expan: DESCEND,
      expansion: IGNORE,
      fermata: IGNORE,
      fTrem: (c, e, ctx) => {
        c.processChord(e, ctx);
        return 'done';
      },
      gap: IGNORE,
      gliss: IGNORE,
      grpSym: IGNORE,
      hairpin: (c, e, ctx) => {
        c.processDynam(e, ctx);
        return 'done';
      },
      halfmRpt: (c, e, ctx) => {
        c.processHalfmRpt(e, ctx);
        return 'descend';
      },
      handShift: IGNORE,
      harm: IGNORE,
      harpPedal: IGNORE,
      incip: IGNORE,
      ineume: IGNORE,
      instrDef: IGNORE,
      instrGrp: IGNORE,
      keyAccid: IGNORE,
      keySig: (c, e, ctx) => {
        c.processKeySig(e, ctx);
        return 'descend';
      },
      label: IGNORE,
      layer: (c, e, ctx) => {
        c.processLayer(e, ctx);
        return 'done';
      },
      layerDef: (c, e, ctx) => {
        c.processLayerDef(e, ctx);
        return 'descend';
      },
      lb: IGNORE,
      lem: IGNORE,
      line: IGNORE,
      lyrics: DESCEND,
      // the one handler that takes no context: a movement starts from `NOTHING_OPEN`, so
      // whatever enclosed the `mdiv` is deliberately not carried into it
      mdiv: (c, e) => {
        c.makeMovement(e);
        return 'done';
      },
      measure: (c, e, ctx) => {
        c.processMeasure(e, ctx);
        return 'done';
      },
      mensur: IGNORE,
      meterSig: (c, e, ctx) => {
        c.processMeterSig(e, ctx);
        return 'descend';
      },
      meterSigGrp: DESCEND,
      midi: IGNORE,
      mordent: (c, e, ctx) => {
        c.processOrnamentSign(e, ctx);
        return 'done';
      },
      mRest: (c, e, ctx) => {
        c.processMeasureRest(e, ctx);
        return 'done';
      },
      mRpt: (c, e, ctx) => {
        c.processMRpt(e, ctx);
        return 'descend';
      },
      mRpt2: (c, e, ctx) => {
        c.processMRpt2(e, ctx);
        return 'descend';
      },
      mSpace: (c, e, ctx) => {
        c.processMeasureRest(e, ctx);
        return 'done';
      },
      multiRest: (c, e, ctx) => {
        c.processMultiRest(e, ctx);
        return 'done';
      },
      multiRpt: (c, e, ctx) => {
        c.processMultiRpt(e, ctx);
        return 'descend';
      },
      note: (c, e, ctx) => {
        c.processNote(e, ctx);
        return 'done';
      },
      octave: (c, e, ctx) => {
        c.processOctave(e, ctx);
        return 'descend';
      },
      oLayer: (c, e, ctx) => {
        c.processLayer(e, ctx);
        return 'done';
      },
      orig: DESCEND,
      ossia: IGNORE,
      oStaff: (c, e, ctx) => {
        c.processStaff(e, ctx);
        return 'done';
      },
      parts: DESCEND,
      part: DESCEND,
      pb: IGNORE,
      pedal: (c, e, ctx) => {
        c.processPedal(e, ctx);
        return 'done';
      },
      pgFoot: IGNORE,
      pgFoot2: IGNORE,
      pgHead: IGNORE,
      pgHead2: IGNORE,
      phrase: (c, e, ctx) => {
        c.processPhrase(e, ctx);
        return 'done';
      },
      proport: IGNORE,
      rdg: IGNORE,
      reg: DESCEND,
      reh: (c, e, ctx) => {
        c.processReh(e, ctx);
        return 'done';
      },
      rend: IGNORE,
      rest: (c, e, ctx) => {
        c.processRest(e, ctx);
        return 'done';
      },
      restore: (c, e) => {
        c.processRestore(e);
        return 'descend';
      },
      sb: IGNORE,
      scoreDef: (c, e, ctx) => {
        c.processScoreDef(e, ctx);
        return 'descend';
      },
      score: DESCEND,
      section: (c, e, ctx) => {
        c.processSection(e, ctx);
        return 'done';
      },
      sic: DESCEND,
      space: (c, e, ctx) => {
        c.processSpace(e, ctx);
        return 'done';
      },
      slur: (c, e, ctx) => {
        c.processSlur(e, ctx);
        return 'done';
      },
      stack: IGNORE,
      staff: (c, e, ctx) => {
        c.processStaff(e, ctx);
        return 'done';
      },
      staffDef: (c, e, ctx) => {
        c.processStaffDef(e, ctx);
        return 'done';
      },
      staffGrp: DESCEND,
      subst: DESCEND,
      supplied: DESCEND,
      syl: (c, e) => {
        c.processSyl(e);
        return 'done';
      },
      syllable: IGNORE,
      symbol: IGNORE,
      symbolTable: IGNORE,
      tempo: (c, e, ctx) => {
        c.processTempo(e, ctx);
        return 'done';
      },
      tie: (c, e, ctx) => {
        c.processTie(e, ctx);
        return 'done';
      },
      timeline: IGNORE,
      trill: (c, e, ctx) => {
        c.processOrnamentSign(e, ctx);
        return 'done';
      },
      tuplet: (c, e, ctx) => {
        if (c.processTuplet(e, ctx)) return 'done';
        return 'descend';
      },
      tupletSpan: (c, e, ctx) => {
        c.processTupletSpan(e, ctx);
        return 'done';
      },
      turn: (c, e, ctx) => {
        c.processOrnamentSign(e, ctx);
        return 'done';
      },
      unclear: DESCEND,
      uneume: IGNORE,
      verse: DESCEND,
      // T15-TABLE-END
    } satisfies Record<string, ElementHandler>);

  /**
   * The recursive heart: walks `root`'s children and hands each to its handler from
   * {@link ELEMENT_HANDLERS}, recursing only where the handler asks to descend.
   *
   * {@link checkEndid} runs *before* the dispatch and for *every* element, including the
   * ones with no handler at all, because any element may be the one a previously parked
   * `endid` was waiting for.
   */
  private convertElement(root: Element, ctx: WalkContext): void {
    const es = root.getChildElements();

    for (let i = 0; i < es.size(); ++i) {
      const e = es.get(i);

      this.checkEndid(e, ctx);

      const handler = Mei2MsmMpmConverter.ELEMENT_HANDLERS[e.getLocalName()];
      if (handler === undefined) continue;
      if (handler(this, e, ctx) === 'descend') this.convertElement(e, ctx);
    }

    return;
  }

  /**
   * this function gets an mdiv and creates an instance of Msm
   */
  /**
   * Start a new movement: build the MSM and the MPM for one `mdiv`, install them as the
   * current output, convert the mdiv's content, then finish the two things that could not
   * be done during the walk.
   *
   * The title is the work title plus the mdiv's `n` and `label`, appended in that order.
   * The movement id is the mdiv's own id, or a fresh `meico_<uuid>` which is **written back
   * onto the mdiv** so the MSM and the MEI agree.
   *
   * Then it locates this mdiv's `work` element in `meiHead`, which is where a global tempo
   * may live: by `decls` reference if the mdiv has one, else by matching `n`, and trivially
   * if there is exactly one `work`. That lookup only matters for the last step.
   *
   * After the walk, two postponed jobs run:
   * - **arpeggios** parked on {@link arpeggiosToSort} are ordered by the pitches that are
   *   only now known, ascending or descending per the stored flag, and written back as a
   *   space-separated `#id` list;
   * - **the tempo map** gets a fallback: if no tempo was found anywhere in the movement, the
   *   `work`'s `tempo` element is used as an initial tempo at date 0. This is why the
   *   `work` lookup above exists.
   */
  private makeMovement(mdiv: Element): void {
    let titleString = this.requireMei().getTitle();
    const mdivN = mdiv.getAttribute('n');
    if (mdivN !== null) titleString += ` - ${mdivN.getValue()}`;
    const mdivLabel = mdiv.getAttribute('label');
    if (mdivLabel !== null) titleString += ` - ${mdivLabel.getValue()}`;

    let movementId: string;
    const id = attribute('id', mdiv);
    if (id !== null) {
      movementId = id.getValue();
    } else {
      movementId = `meico_${uuidv4()}`;
      mdiv.addAttribute(new Attribute('id', movementId));
    }

    const msm = Msm.createMsm(titleString, movementId, this.ppq);
    this.movements.push(msm);

    const mpm = Mpm.createMpm();

    // The three metadata factories return their reason now rather than printing it. None of
    // the three calls below can produce one — every argument is a non-null string — so the
    // reasons are flattened back to null with `unwrapOr` and the array keeps its nullable
    // element type. That is not laziness: `Mpm.addMetadata` passes the array to
    // `Metadata.fromParts`, which treats a null element as a caller error and refuses to
    // build the metadata at all (T16 closed T10's DISCOVERED note by widening the consumer,
    // which is what retired this file's `any`). Skipping a null here instead would produce a
    // metadata block that the incumbent would not have produced, and that is a document
    // difference, not a plumbing one.
    const relatedResources: (RelatedResource | null)[] = [];
    const meiFile = this.requireMei().getFile();
    const meicoAuthor = (): Author | null => unwrapOr(Author.fromName('meico', null, null), null);
    if (meiFile !== null) {
      relatedResources.push(unwrapOr(RelatedResource.fromUri(meiFile, 'mei'), null));
      const comment = Comment.fromText(
        `This MPM has been generated from '${meiFile}' using the meico MEI converter v${VERSION}.`,
        null,
      );
      mpm.addMetadata(meicoAuthor(), unwrapOr(comment, null), relatedResources);
    } else {
      const comment = Comment.fromText(
        `This MPM has been generated from MEI code using the meico MEI converter v${VERSION}.`,
        null,
      );
      mpm.addMetadata(meicoAuthor(), unwrapOr(comment, null), null);
    }

    // Still printed, and that is the point of the change rather than an omission: the
    // converter is the code that knows a human asked for this conversion, so it is the code
    // entitled to say something. What it can say is new — `createPerformance` used to print
    // its exception itself and hand back a bare null, so this message could only report
    // *that* the performance failed.
    const created = Performance.fromName('MEI export performance');
    if (isErr(created)) {
      console.error(
        `Failed to generate an instance of Performance. Skipping mdiv ${titleString}. ${describeMpmParseError(created.error)}`,
      );
      return;
    }
    const performance = created.value;
    performance.setPulsesPerQuarter(this.ppq);
    mpm.addPerformance(performance);
    this.performances.push(mpm);

    this.reset();
    this.indexNotesAndChords(mdiv);

    // find the corresponding work element in meiHead
    //
    // `work` is a local rather than a field until the movement record is built, which is the
    // whole difference this makes: as `this.currentWork` it was assigned *conditionally* — the
    // three branches below all have a "no match" path — and only `reset()` standing between
    // two movements stopped the previous movement's work from serving this one.
    let work: Element | null = null;
    // Both ternaries said "null when the attribute is absent", which is what
    // `getAttributeValue` already answers — the `n` one collapses to the read itself, and
    // `decls` only needs the value held long enough to be split.
    const n = mdiv.getAttributeValue('n');
    const declsValue = mdiv.getAttributeValue('decls');
    const decls = declsValue === null ? null : declsValue.split(/\s+/);
    // `getMeiHead()` is null for an empty MEI, which `convertMei` has already ruled out —
    // but `firstChildElement`'s typed overload does not accept the null, and the two `!`
    // that answered that also hid the fact that the head was being looked up twice.
    const meiHead = this.requireMei().getMeiHead();
    let workList = mapPresent(meiHead, (head) => firstChildElement('workList', head));
    if (workList === null && meiHead !== null) workList = firstChildElement('workDesc', meiHead);
    if (workList !== null) {
      const works = allChildElements(workList, 'work');
      switch (works.length) {
        case 0:
          break;
        case 1:
          // The `switch` has just established the length; `elementAt` is how that is said
          // to a compiler which does not read `switch` bounds, and it names the sequence if
          // the two ever disagree.
          work = elementAt(works, 0, 'the work list of this MEI');
          break;
        default: {
          if (decls !== null) {
            for (const candidate of works) {
              const workId = getAttributeValue('id', candidate);
              let found = false;
              for (const decl of decls) {
                if (decl.substring(1) === workId) {
                  work = candidate;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
          }
          if (work === null && n !== null) {
            for (const candidate of works) {
              if (n === getAttributeValue('n', candidate)) {
                work = candidate;
                break;
              }
            }
          }
        }
      }
    }

    if (msm.isEmpty()) {
      console.error('Skipping mdiv. Failed to initialize required data objects.');
      return;
    }
    // `isEmpty` is `data === null`, so a non-empty MSM has a document — but `getRootElement`
    // is typed for the general case, and this names the gap rather than asserting it away.
    // The old `this.currentMsmMovement = msm.getRootElement()` stored the null and let
    // `requireMsmMovement()` raise this same error at the first read instead.
    const msmRoot = msm.getRootElement();
    if (msmRoot === null)
      throw new MissingNodeError('no MSM movement is currently being converted');

    // Everything below the mdiv reads these three and none of them may change one, which is
    // what makes them a Reader rather than a cursor. `mdiv` is deliberately not among them:
    // it is used twice, both times above, and is a local.
    const movement: MovementContext = { msm: msmRoot, work, performance };

    // A movement begins with nothing else open. `reset()` said this with eight
    // `this.currentX = null` lines; the record says it by being the one the mdiv's subtree
    // is walked under, and by no other subtree ever seeing it.
    const inMovement: WalkContext = { ...NOTHING_OPEN, movement };
    this.convertElement(mdiv, inMovement);

    // postprocess arpeggios
    for (const arpeggioNoteOrder of this.arpeggiosToSort) {
      const notePitchList: KeyValue<string, number>[] = [];
      for (const noteId of arpeggioNoteOrder.getKey().getValue().replace(/#/g, '').split(/\s+/)) {
        const note = this.allNotesAndChords.get(noteId);
        if (note === undefined) continue;
        const pitchAtt = attribute('pnum', note);
        if (pitchAtt === null) continue;
        const pitch = parseFloat(pitchAtt.getValue());
        notePitchList.push(new KeyValue<string, number>(noteId, pitch));
      }

      notePitchList.sort((n1, n2) => {
        return arpeggioNoteOrder.getValue()
          ? Math.sign(n1.getValue() - n2.getValue())
          : Math.sign(n2.getValue() - n1.getValue());
      });

      let noteIdsString = '';
      for (const noteId of notePitchList)
        noteIdsString += ` #${noteId.getKey().trim().replace(/#/g, '')}`;
      arpeggioNoteOrder.getKey().setValue(noteIdsString.trim());
    }

    // finalize the tempoMap
    let globalTempoMap = performance.getGlobal()?.getDated()?.getMap(Mpm.TEMPO_MAP) as
      TempoMap | null | undefined;
    if (
      (globalTempoMap === null ||
        globalTempoMap === undefined ||
        globalTempoMap.getElementBeforeAt(0.0) === null) &&
      work !== null
    ) {
      const tempo = firstChildElement('tempo', work);
      if (tempo !== null) {
        const tempoData = this.parseTempo(tempo, null, inMovement);
        if (tempoData !== null) {
          if (globalTempoMap === null || globalTempoMap === undefined) {
            globalTempoMap = performance
              .getGlobal()
              ?.getDated()
              ?.addMap(TempoMap.createTempoMap()) as TempoMap | null | undefined;

            // **A divergence from Java, pinned rather than fixed.** Java guards this with
            // `if (…getAllStyleTypes().get(Mpm.TEMPO_STYLE) != null)` — switch to the
            // MEI-export tempo style only if one was actually defined. Transcribed literally,
            // the `!= null` landed on a `Map.get` that answers **`undefined`** for an absent
            // key, so the test was true whatever the header held and the switch was written
            // unconditionally. It is written unconditionally here too, because that is what
            // the code has always done; the condition is gone rather than corrected. The same
            // Java line in `parseTempo` is transcribed `!== undefined` and is correct, which
            // is what identifies this one as a slip rather than a decision.
            //
            // Reachable, and what it produces is a dangling reference: an MEI whose
            // `workList/work/tempo` is a purely directional descriptor ("ritardando",
            // "accelerando", "calando") never reaches the arm of `parseTempo` that defines the
            // style, so the MPM gets `<style … name.ref="MEI export"/>` in a document with no
            // `<tempoStyles>` element at all. No fixture carries a work-level tempo of that
            // shape, which is why aligning the condition with Java leaves all 6208 tests
            // green — measured. See PARITY.md, and the test in
            // `tests/mei/Mei2MsmMpmConverter.test.ts` that reds if someone aligns it.
            globalTempoMap?.addStyleSwitch(0.0, 'MEI export');
          }
          tempoData.startDate = 0.0;
          globalTempoMap?.addTempo(tempoData);
        }
      }
    }
  }

  /**
   * process an mei scoreDef element
   */
  private processScoreDef(scoreDef: Element, ctx: WalkContext): void {
    if (ctx.part !== null) {
      this.processStaffDef(scoreDef, ctx);
      return;
    }

    scoreDef.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));

    let s: Element | null;

    // time signature
    s = this.makeTimeSignature(scoreDef, ctx);
    if (s !== null) {
      addToMap(s, globalDatedMap(ctx, 'timeSignatureMap'));
    }

    // key signature
    s = this.makeKeySignature(scoreDef, ctx);
    if (s !== null) {
      addToMap(s, globalDatedMap(ctx, 'keySignatureMap'));
    }

    // store default values in miscMap
    //
    // Each of the three blocks below tested an attribute for presence and then read it
    // again, asserting the presence it had just established. Reading it once into a local
    // says the same thing, halves the attribute lookups, and leaves nothing to assert.
    const durDefault = scoreDef.getAttributeValue('dur.default');
    if (durDefault !== null) {
      const d = new Element('dur.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
      d.addAttribute(new Attribute('dur', durDefault));
      copyId(scoreDef, d);
      addToMap(d, globalDatedMap(ctx, 'miscMap'));
    }

    const octaveDefault = scoreDef.getAttributeValue('octave.default');
    if (octaveDefault !== null) {
      const d = new Element('oct.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
      d.addAttribute(new Attribute('oct', octaveDefault));
      copyId(scoreDef, d);
      addToMap(d, globalDatedMap(ctx, 'miscMap'));
    }

    {
      const transSemi = scoreDef.getAttributeValue('trans.semi');
      let trans = 0;
      trans = transSemi === null ? 0.0 : parseFloat(transSemi);
      trans += Mei2MsmMpmConverter.processClefDis();
      const d = new Element('transposition');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
      d.addAttribute(new Attribute('semi', String(trans)));
      copyId(scoreDef, d);
      addToMap(d, globalDatedMap(ctx, 'miscMap'));
    }

    addToMap(cloneElement(scoreDef), globalDatedMap(ctx, 'miscMap'));
  }

  /**
   * Open the MSM part a `staffDef` describes, fill its defaults, and walk the `staffDef`'s
   * own children inside it.
   *
   * The part is in force for this subtree and no longer. That used to be
   * `const parentPart = this.currentPart; this.currentPart = …; …; this.currentPart =
   * parentPart` — dynamic scoping by hand, and the reason no reader of `getMidiTimeAsString`
   * or `partDatedMap` could tell which part they meant. `inPart` is the same thing said once:
   * every line below reads from it, and the parent context is never overwritten, so there is
   * nothing to put back.
   *
   * Note that `makePart` is called with the *outer* `ctx` — it does not read the part it is
   * about to create, and passing `inPart` would be circular.
   */
  private processStaffDef(staffDef: Element, ctx: WalkContext): void {
    const inPart: WalkContext = { ...ctx, part: this.makePart(staffDef, ctx) };

    staffDef.addAttribute(new Attribute('date', this.getMidiTimeAsString(inPart)));

    let t = this.makeTimeSignature(staffDef, inPart);
    if (t !== null) {
      addToMap(t, partDatedMap(inPart, 'timeSignatureMap'));
    }

    t = this.makeKeySignature(staffDef, inPart);
    if (t !== null) {
      addToMap(t, partDatedMap(inPart, 'keySignatureMap'));
    }

    // the same three defaults as {@link processScoreDef}, per part rather than global
    const durDefault = staffDef.getAttributeValue('dur.default');
    if (durDefault !== null) {
      const d = new Element('dur.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(inPart)));
      d.addAttribute(new Attribute('dur', durDefault));
      copyId(staffDef, d);
      addToMap(d, partDatedMap(inPart, 'miscMap'));
    }

    const octaveDefault = staffDef.getAttributeValue('octave.default');
    if (octaveDefault !== null) {
      const d = new Element('oct.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(inPart)));
      d.addAttribute(new Attribute('oct', octaveDefault));
      copyId(staffDef, d);
      addToMap(d, partDatedMap(inPart, 'miscMap'));
    }

    {
      const transSemi = staffDef.getAttributeValue('trans.semi');
      let trans = 0;
      trans = transSemi === null ? 0.0 : parseFloat(transSemi);
      trans += Mei2MsmMpmConverter.processClefDis();
      const d = new Element('transposition');
      d.addAttribute(new Attribute('semi', String(trans)));
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString(inPart)));
      copyId(staffDef, d);
      addToMap(d, partDatedMap(inPart, 'miscMap'));
    }

    addToMap(cloneElement(staffDef), partDatedMap(inPart, 'miscMap'));

    this.convertElement(staffDef, inPart);
    this.accid = [];
  }

  /**
   * Enter the MSM part a `staff` refers to — by `@def`, else by `@n` — and walk it there.
   *
   * A `staff` with no matching `staffDef` gets a part invented for it, which is the `else`
   * below; either way the part is this subtree's, exactly as in {@link processStaffDef}.
   *
   * {@link accid} is cleared on the way out and is *not* part of the context: accidentals are
   * a running list the movement accumulates, not a position in the tree, so they stay a field.
   */
  private processStaff(staff: Element, ctx: WalkContext): void {
    let ref = staff.getAttribute('def');
    if (ref === null) ref = staff.getAttribute('n');
    const s = this.getPart(ref === null ? '' : ref.getValue(), ctx);

    let part: Element;
    if (s !== null) {
      s.addAttribute(new Attribute('currentDate', this.getMidiTimeAsString(ctx)));
      part = s;
    } else {
      console.error(
        `There is an undefined staff element in the score with no corresponding staffDef.\n${staff.toXML()}\nGenerating a new part for it.`,
      );
      part = this.makePart(staff, ctx);
    }

    this.convertElement(staff, { ...ctx, part });
    this.accid = [];
  }

  private processLayerDef(layerDef: Element, ctx: WalkContext): void {
    layerDef.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));

    const durDefault = layerDef.getAttributeValue('dur.default');
    if (durDefault !== null) {
      const d = new Element('dur.default');
      requirePartDatedMap(ctx, 'miscMap').appendChild(d);
      d.addAttribute(new Attribute('dur', durDefault));
      copyId(layerDef, d);
      this.addLayerAttribute(d, ctx);
    }

    const octaveDefault = layerDef.getAttributeValue('octave.default');
    if (octaveDefault !== null) {
      const d = new Element('oct.default');
      requirePartDatedMap(ctx, 'miscMap').appendChild(d);
      d.addAttribute(new Attribute('oct', octaveDefault));
      copyId(layerDef, d);
      this.addLayerAttribute(d, ctx);
    }

    if (ctx.part === null) {
      addToMap(cloneElement(layerDef), globalDatedMap(ctx, 'miscMap'));
      return;
    }

    addToMap(cloneElement(layerDef), partDatedMap(ctx, 'miscMap'));
  }

  /**
   * Convert one voice. The interesting part is the clock discipline around it, because
   * layers are *parallel*: each must start where the previous one started, not where it
   * ended.
   *
   * So the part's `currentDate` is saved, the layer is walked, and then either restored —
   * if another `layer` sibling follows — or set to the latest `currentDate` reached by any
   * sibling layer, which is where the next music begins. Each layer records its own end in a
   * `currentDate` attribute on the MEI element for exactly that comparison.
   *
   * {@link accid} is cleared per layer as well as per measure: an accidental in one voice
   * does not carry into another.
   *
   * The layer itself only reaches its own subtree — `{ ...ctx, layer }` is what the recursive
   * call gets, and the clock bookkeeping afterwards runs under the *enclosing* context, which
   * is what `this.currentLayer = parentLayer` placed exactly here used to arrange. That
   * restore was the one cursor discipline the byte corpus could not see: the `layer` attribute
   * it feeds is stripped by `msmCleanup` before any reference comparison, so deleting it left
   * all 6071 tests green. `tests/mei/Mei2MsmMpmConverter.test.ts` closes it.
   */
  private processLayer(layer: Element, ctx: WalkContext): void {
    const oldDate = partClock(requirePart(ctx)).getValue();

    this.convertElement(layer, { ...ctx, layer });

    layer.addAttribute(new Attribute('currentDate', partClock(requirePart(ctx)).getValue()));
    this.accid = [];
    if (getNextSiblingElement('layer', layer) !== null)
      partClock(requirePart(ctx)).setValue(oldDate);
    else {
      // `query("child::*[local-name()='layer']")` serialised and re-parsed the entire staff
      // — every note in it — to find the layer's own siblings, once per last layer of every
      // staff of every measure. `allChildElements` is the child axis walked directly, and
      // `tests/xml/navigationEquivalence.test.ts` already asserts the two agree over the
      // fixture corpus. The fold is a maximum, so the backwards loop Java writes is kept
      // only because it was there — which is to say it is a `foldl`, and now says so.
      const layers = allChildElements(requireParentElement(layer), 'layer');
      //
      // A layer the walk has not reached yet carries no `currentDate`, and `parseFloat` of
      // that is NaN, which loses every `<` comparison and is therefore skipped. That was
      // already the behaviour when this read `getAttributeValue(…)!`: the assertion is
      // erased at runtime, so `parseFloat` received the null and answered NaN just the same.
      const latestDate = foldl(
        layers,
        parseFloat(partClock(requirePart(ctx)).getValue()),
        (latest, sibling) => {
          const date = parseFloat(sibling.getAttributeValue('currentDate') ?? '');
          return latest < date ? date : latest;
        },
      );
      partClock(requirePart(ctx)).setValue(String(latestDate));
    }
  }

  private processApp(app: Element, ctx: WalkContext): void {
    let takeThisReading = firstChildElementOf(app, 'lem');
    if (takeThisReading === null) {
      takeThisReading = firstChildElementOf(app, 'rdg');
      if (takeThisReading === null) {
        return;
      }
    }
    this.convertElement(takeThisReading, ctx);
  }

  private processChoice(choice: Element, ctx: WalkContext): void {
    const prefOrder = ['corr', 'reg', 'expan', 'subst', 'choice', 'orig', 'unclear', 'sic', 'abbr'];

    // The first child in preference order, which is a search rather than an index walk: the
    // loop stops at the first hit, so the names after it are never looked up.
    let c: Element | null = null;
    for (const preferred of prefOrder) {
      c = firstChildElementOf(choice, preferred);
      if (c !== null) break;
    }

    if (c !== null) {
      if (c.getLocalName() === 'choice') this.processChoice(c, ctx);
      else this.convertElement(c, ctx);
      return;
    }

    // No preferred child: fall back to the first child of any name. `Elements.get` returns a
    // non-nullable `Element` and the size test above has already established there is one, so
    // Java's second null check had nothing left to test.
    const children = choice.getChildElements();
    if (children.size() > 0) this.convertElement(children.get(0), ctx);
  }

  private processRestore(restore: Element): void {
    const dels = restore.query("descendant::*[local-name()='del']");
    for (let i = 0; i < dels.size(); ++i) {
      const d = dels.get(i) as unknown as Element;
      d.addAttribute(new Attribute('restored-meico', 'true'));
    }
  }

  private processDel(del: Element, ctx: WalkContext): void {
    const restored = del.getAttribute('restored-meico');
    if (restored !== null && restored.getValue() === 'true') this.convertElement(del, ctx);
  }

  /**
   * Turn an MEI `ending` (a volta bracket) into MSM sequencing: a `marker` at its start and
   * a `goto` that decides, on each pass, whether this ending is the one to play.
   *
   * The ending's *number* comes from `n`, else from `label`, and is reduced to an integer
   * by {@link extractAllIntegersFromString} — so `"1."`, `"1, 2"` and `"1-2"` all
   * yield 1, the first integer found. An ending whose text contains "fine" is given
   * `MAX_SAFE_INTEGER` so it sorts last, and one with no recognisable number gets
   * `MIN_SAFE_INTEGER` and is simply appended in encounter order. Those two sentinels are
   * how the ordering of gotos at one date is decided further down.
   *
   * The marker id is `endingMarker_<the ending's xml:id, or a fresh uuid>` — never
   * `#`-prefixed, which is what makes {@link Goto}'s truncating parameter constructor
   * harmless at this call site (see the note there).
   */
  private processEnding(ending: Element, ctx: WalkContext): void {
    const startDate = this.getMidiTime(ctx);
    const endingCount = this.endingCounter++;
    const sequencingMap = requireGlobalDatedMap(ctx, 'sequencingMap');

    const activity = '1';
    let n = Number.MIN_SAFE_INTEGER;
    // `@n` before `@label`, both optional — {@link firstPresent} is that preference written
    // once, and {@link orDefault} is the `''` the two `if`s left standing when neither is set.
    const endingText = orDefault(
      firstPresent(ending.getAttributeValue('n'), ending.getAttributeValue('label')),
      '',
    );
    if (endingText.toLowerCase().includes('fine')) n = Number.MAX_SAFE_INTEGER;
    else {
      // The first integer in the label, if there is one — `isNonEmpty` carries that "if"
      // into the type, so `head` needs no index and no assertion.
      const endingNumbers = extractAllIntegersFromString(endingText);
      if (isNonEmpty(endingNumbers)) n = head(endingNumbers);
    }

    const endingLabel = ending.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    const markerId = `endingMarker_${endingLabel === null ? uuidv4() : endingLabel.getValue()}`;

    const marker = new Element('marker');
    marker.addAttribute(new Attribute('date', String(startDate)));
    marker.addAttribute(
      new Attribute(
        'message',
        `ending${ending.getAttribute('n') === null ? (ending.getAttribute('label') === null ? `: ${ending.getAttributeValue('label')}` : String(endingCount)) : ` ${ending.getAttributeValue('n')}`}`,
      ),
    );
    const idAttr = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', markerId);
    marker.addAttribute(idAttr);
    addToMap(marker, sequencingMap);

    // find the last repetition start marker before or at the date of this
    const ns = sequencingMap.query(
      "descendant::*[local-name()='marker' and attribute::message='repetition start']",
    );
    let repetitionStartMarker: Element | null = null;
    for (let i = ns.size() - 1; i >= 0; --i) {
      const e = ns.get(i) as unknown as Element;
      const date = e.getAttributeValue('date');
      if (date !== null && parseFloat(date) <= startDate) {
        repetitionStartMarker = e;
        break;
      }
    }

    let noPreviousEndings = false;
    const find1stEndingMarkerAfterThisDate =
      repetitionStartMarker === null
        ? 0.0
        : parseFloat(requireAttributeValue('date', repetitionStartMarker));
    const ends = sequencingMap.query(
      "descendant::*[local-name()='marker' and contains(attribute::message, 'ending')]",
    );
    let dateOfGoto = Number.MAX_VALUE;
    for (let i = 0; i < ends.size(); ++i) {
      const end = ends.get(i) as unknown as Element;
      if (
        (repetitionStartMarker !== null &&
          requireParentElement(end).indexOf(end) <
            requireParentElement(end).indexOf(repetitionStartMarker)) ||
        end.getAttribute('date') === null
      ) {
        continue;
      }
      if (end === marker) {
        noPreviousEndings = true;
        dateOfGoto = startDate;
        break;
      }
      const firstEndingMarkerDate = parseFloat(requireAttributeValue('date', end));
      if (firstEndingMarkerDate >= find1stEndingMarkerAfterThisDate) {
        dateOfGoto = firstEndingMarkerDate;
        break;
      }
    }

    // `source` is the MEI element a Goto was read from; there is none here because this
    // goto is synthesised, and Goto only ever stores the field, never reads it — so null is
    // safe. Typed away rather than declared nullable because Goto's signature is T9's file.
    const gotoObj = new Goto(
      dateOfGoto,
      startDate,
      markerId,
      `0${activity}`,
      null as unknown as Element,
    );
    const gt = gotoObj.toElement();
    gt.addAttribute(new Attribute('n', String(n)));

    if (n === Number.MIN_SAFE_INTEGER) addToMap(gt, sequencingMap);
    else {
      const gotosAtSameDate = sequencingMap.query(
        `descendant::*[local-name()='goto' and attribute::date='${gotoObj.date}']`,
      );
      if (gotosAtSameDate.size() === 0) {
        gt.addAttribute(new Attribute('first', 'true'));
        requireAttribute('target.id', gt).setValue('');
        addToMap(gt, sequencingMap);
      } else {
        let index: number;
        for (index = 0; index < gotosAtSameDate.size(); ++index) {
          const gtast = gotosAtSameDate.get(index) as unknown as Element;
          const gtastN = gtast.getAttributeValue('n');
          if (gtastN === null) continue;
          if (parseInt(gtastN) > n) break;
        }
        if (index === 0) requireAttribute('activity', gt).setValue(activity);
        const firstGoto = gotosAtSameDate.get(0) as unknown as Element;
        if (index >= gotosAtSameDate.size()) addToMap(gt, sequencingMap);
        else
          sequencingMap.insertChild(
            gt,
            sequencingMap.indexOf(
              gotosAtSameDate.size() === 0 ? marker : gotosAtSameDate.get(index),
            ),
          );
        if (firstGoto.getAttribute('first') !== null) {
          sequencingMap.removeChild(firstGoto);
        }
      }
    }

    this.convertElement(ending, ctx);

    if (noPreviousEndings)
      requireAttribute('target.date', gt).setValue(this.getMidiTimeAsString(ctx));
  }

  private processPhrase(phrase: Element, ctx: WalkContext): void {
    const timingData = this.computeControlEventTiming(phrase, ctx.part, ctx);
    if (timingData === null) return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    let att = phrase.getAttribute('part');
    if (att === null) att = phrase.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      const phraseMapEntry = new Element('phrase');
      phraseMapEntry.addAttribute(new Attribute('date', String(date)));
      const phraseLabel = labelOrN(phrase);
      if (phraseLabel !== null) phraseMapEntry.addAttribute(new Attribute('label', phraseLabel));
      copyId(phrase, phraseMapEntry);

      if (endDate !== null) {
        phraseMapEntry.addAttribute(new Attribute('date.end', String(endDate)));
      } else if (tstamp2 !== null) {
        phraseMapEntry.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(phraseMapEntry);
      } else if (endid !== null) {
        phraseMapEntry.addAttribute(new Attribute('endid', endid.getValue()));
        this.endids.push(phraseMapEntry);
      }

      const phraseMap = requireGlobalDatedMap(ctx, 'phraseMap');
      addToMap(phraseMapEntry, phraseMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      const parts = requireMovement(ctx).msm.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const phraseMapEntry = new Element('phrase');
          phraseMapEntry.addAttribute(new Attribute('date', String(date)));
          const phraseLabel = labelOrN(phrase);
          if (phraseLabel !== null)
            phraseMapEntry.addAttribute(new Attribute('label', phraseLabel));
          copyId(phrase, phraseMapEntry);
          const phId = phraseMapEntry.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (phId !== null) phId.setValue(`meico_copyId_${staff}_${phId.getValue()}`);

          if (endDate !== null) {
            phraseMapEntry.addAttribute(new Attribute('date.end', String(endDate)));
          } else if (tstamp2 !== null) {
            phraseMapEntry.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
            this.tstamp2s.push(phraseMapEntry);
          } else if (endid !== null) {
            phraseMapEntry.addAttribute(new Attribute('endid', endid.getValue()));
            this.endids.push(phraseMapEntry);
          }

          const phraseMap = requireDatedMap(parts.get(p), 'phraseMap');
          addToMap(phraseMapEntry, phraseMap);
          this.addLayerAttribute(phraseMapEntry, ctx);
        }
      }
    }
  }

  private processSection(section: Element, ctx: WalkContext): void {
    const sectionMapEntry = new Element('section');
    sectionMapEntry.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
    const sectionLabel = labelOrN(section);
    if (sectionLabel !== null) sectionMapEntry.addAttribute(new Attribute('label', sectionLabel));
    copyId(section, sectionMapEntry);
    const sectionMap = requireGlobalDatedMap(ctx, 'sectionMap');
    sectionMap.appendChild(sectionMapEntry);
    this.convertElement(section, ctx);
    sectionMapEntry.addAttribute(new Attribute('date.end', this.getMidiTimeAsString(ctx)));
  }

  /**
   * Convert one measure, and then reconcile the parts' clocks.
   *
   * Three things happen around the recursive descent:
   * - **before**: parked {@link tstamp2s} are counted down one measure. `tstamp2` is
   *   written `<measures>m+<beat>`, so each measure boundary decrements the count and only
   *   the entry that reaches zero resolves to a `date.end` here. Java splices the resolved
   *   entries out in place and steps its index backwards to survive the mutation; here the
   *   two outcomes are a partition, so the list is rebuilt by a filter instead;
   * - **before**: {@link reorderMeasureContent} hoists control events ahead of the staves;
   * - **after**: {@link accid} is cleared, because MEI accidentals last exactly one measure.
   *
   * The tail then decides how long the measure actually was. `metcon="false"` marks a
   * measure that deliberately does not fill its time signature (a pickup, a cadenza), and
   * the parts are advanced by what they really contain; otherwise every part is advanced to
   * the same measure end, so a part that under- or over-fills does not desynchronise the
   * score.
   */
  private processMeasure(measure: Element, ctx: WalkContext): void {
    const startDate = this.getMidiTime(ctx);
    measure.addAttribute(new Attribute('date', String(startDate)));
    // The measure is open from here to the end of the descent — including the `tstamp2`
    // countdown below, which resolves a parked span against *this* measure's `date`.
    //
    // The field version wrote `this.currentMeasure = null` after the descent rather than
    // restoring the value it found, which is only right because **measures do not nest**: the
    // saved value was always null anyway. The record makes the distinction moot — the tail
    // below runs under `ctx`, whatever that was — and if a malformed document ever did nest
    // two measures, this restores the enclosing one instead of clearing it, which is the
    // behaviour the tail's date arithmetic wants.
    const inMeasure: WalkContext = { ...ctx, measure };

    // Process pending tstamp2 elements. A measure boundary counts every parked entry down by
    // one; the entries that reach zero resolve to a `date.end` here and leave the list, and
    // the rest are rewritten with the smaller count. That is a partition, so this is a filter
    // that rebuilds the list once rather than the index loop that used to `splice` in place
    // and step `i` backwards to survive its own mutation.
    //
    // Both halves of the split are read through `elementAt` because both are in range by
    // construction: an entry is only parked when `computeControlEventTiming` saw at least two
    // parts (a one-part `tstamp2` resolves there and is never parked), and the rewrite below
    // puts the separator back.
    this.tstamp2s = this.tstamp2s.filter((e) => {
      const att = requireAttribute('tstamp2', e);
      const tstamp2Parts = att.getValue().split('m+');
      const beat = elementAt(tstamp2Parts, 1, "a parked tstamp2 split on 'm+'");
      const measures = parseInt(elementAt(tstamp2Parts, 0, "a parked tstamp2 split on 'm+'")) - 1;
      if (measures > 0) {
        att.setValue(`${measures}m+${beat}`);
        return true;
      }
      const endDate = this.tstampToTicks(beat, null, inMeasure);
      e.addAttribute(new Attribute('date.end', String(endDate)));
      e.removeAttribute(att);
      return false;
    });

    Mei2MsmMpmConverter.reorderMeasureContent(measure);

    this.convertElement(measure, inMeasure);
    this.accid = [];

    const metconAtt = measure.getAttribute('metcon');
    const metcon = metconAtt === null || metconAtt.getValue() !== 'false';

    let defaultGlobalMeasureDuration = 0.0;
    let globalTimeSignature: Element | null = null;
    const globalTsMap = requireGlobalDatedMap(ctx, 'timeSignatureMap');
    if (globalTsMap.getChildCount() > 0) {
      const tss = globalTsMap.getChildElements('timeSignature');
      globalTimeSignature = tss.get(tss.size() - 1);
      defaultGlobalMeasureDuration = this.computeMeasureLength(
        parseFloat(requireAttributeValue('numerator', globalTimeSignature)),
        parseFloat(requireAttributeValue('denominator', globalTimeSignature)),
      );
    }

    let longestDuration = 0.0;
    const partsDefaultDurations = new Map<Element, number>();
    const partsTsMapAndTs = new Map<Element, KeyValue<Element, Element>>();
    const parts = requireMovement(ctx).msm.getChildElements('part');
    for (let pi = 0; pi < parts.size(); ++pi) {
      const part = parts.get(pi);
      const tsMap = requireDatedMap(part, 'timeSignatureMap');
      let ts: Element | null = null;
      if (tsMap.getChildCount() > 0) {
        const tss = tsMap.getChildElements('timeSignature');
        ts = tss.get(tss.size() - 1);
        partsTsMapAndTs.set(part, new KeyValue(tsMap, ts));
      }

      const defaultLocalMeasureDuration =
        ts === null
          ? defaultGlobalMeasureDuration
          : this.computeMeasureLength(
              parseFloat(requireAttributeValue('numerator', ts)),
              parseFloat(requireAttributeValue('denominator', ts)),
            );
      partsDefaultDurations.set(part, defaultLocalMeasureDuration);
      const actualPartMeasureDuration = parseFloat(partClock(part).getValue()) - startDate;

      const d =
        actualPartMeasureDuration === defaultLocalMeasureDuration ||
        (actualPartMeasureDuration < defaultLocalMeasureDuration && metcon)
          ? defaultLocalMeasureDuration
          : actualPartMeasureDuration;
      partClock(part).setValue(String(d + startDate));
      if (d > longestDuration) longestDuration = d;
    }
    measure.addAttribute(new Attribute('midi.dur', String(longestDuration)));
    const endDate = startDate + longestDuration;

    if (globalTimeSignature !== null && longestDuration !== defaultGlobalMeasureDuration) {
      while (globalTsMap.getChildElements().size() > 0) {
        const last = globalTsMap.getChildElements().get(globalTsMap.getChildCount() - 1);
        if (parseFloat(requireAttributeValue('date', last)) >= startDate) {
          globalTsMap.removeChild(last);
        } else break;
      }
      // A two-element array read back as `[0]` and `[1]` is a pair with the names left off.
      // Putting them back is the whole fix here.
      const numerator = parseFloat(requireAttributeValue('numerator', globalTimeSignature));
      const denominator = parseFloat(requireAttributeValue('denominator', globalTimeSignature));
      const num = (longestDuration * denominator) / (this.ppq * 4.0);
      const newTs = Msm.makeTimeSignature(startDate, num, denominator, null);
      globalTsMap.appendChild(newTs);
      const switchBackTs = Msm.makeTimeSignature(endDate, numerator, denominator, null);
      globalTsMap.appendChild(switchBackTs);
    }

    for (let pi = 0; pi < parts.size(); ++pi) {
      const part = parts.get(pi);
      const tsData = partsTsMapAndTs.get(part);
      if (tsData === undefined || partsDefaultDurations.get(part) === longestDuration) continue;
      const tsMap = tsData.getKey();
      // The entry exists only where a `timeSignature` was actually found (see the loop that
      // fills `partsTsMapAndTs` above), and `Elements.get` throws rather than answering null,
      // so the pair's value is an element whenever the `undefined` test above lets us through.
      // Java's extra null check on it tested the same thing the map lookup already had.
      const ts = tsData.getValue();

      while (tsMap.getChildElements().size() > 0) {
        const last = tsMap.getChildElements().get(tsMap.getChildCount() - 1);
        if (parseFloat(requireAttributeValue('date', last)) >= startDate) {
          tsMap.removeChild(last);
        } else break;
      }
      const numerator2 = parseFloat(requireAttributeValue('numerator', ts));
      const denominator2 = parseFloat(requireAttributeValue('denominator', ts));
      const num2 = (longestDuration * denominator2) / (this.ppq * 4.0);
      const newTs2 = Msm.makeTimeSignature(startDate, num2, denominator2, null);
      tsMap.appendChild(newTs2);
      const switchBackTs2 = Msm.makeTimeSignature(endDate, numerator2, denominator2, null);
      tsMap.appendChild(switchBackTs2);
    }

    // process barlines
    //
    // Left before right, and neither call moved: `barline2SequencingCommand` draws UUIDs, so
    // the order the two guards run in is part of the compared output.
    const leftBarline = measure.getAttributeValue('left');
    if (leftBarline !== null)
      Mei2MsmMpmConverter.barline2SequencingCommand(
        leftBarline,
        startDate,
        requireGlobalDatedMap(ctx, 'sequencingMap'),
      );
    const rightBarline = measure.getAttributeValue('right');
    if (rightBarline !== null)
      Mei2MsmMpmConverter.barline2SequencingCommand(
        rightBarline,
        endDate,
        requireGlobalDatedMap(ctx, 'sequencingMap'),
      );
  }

  private processMeterSig(meterSig: Element, ctx: WalkContext): void {
    const s = this.makeTimeSignature(meterSig, ctx);
    if (s === null) return;
    if (ctx.part !== null) {
      addToMap(s, partDatedMap(ctx, 'timeSignatureMap'));
    } else {
      addToMap(s, globalDatedMap(ctx, 'timeSignatureMap'));
    }
  }

  private processKeySig(keySig: Element, ctx: WalkContext): void {
    const s = this.makeKeySignature(keySig, ctx);
    if (s === null) return;
    if (ctx.part !== null) {
      addToMap(s, partDatedMap(ctx, 'keySignatureMap'));
    } else {
      addToMap(s, globalDatedMap(ctx, 'keySignatureMap'));
    }
  }

  /**
   * Handle a standalone or note-attached `accid`.
   *
   * First it looks for an enclosing `note`, stopping the search at a `layer` boundary — an
   * `accid` that is not inside a note is a free-standing editorial accidental and belongs
   * to no note in particular. When a parent note is found, the accidental is copied onto it
   * (without overwriting one already there), so {@link computePitch} finds it in the usual
   * place.
   *
   * Either way the element is also pushed onto {@link accid}, the per-measure list that
   * {@link computePitch} consults for later notes of the same pitch and octave.
   */
  private processAccid(accid: Element, ctx: WalkContext): void {
    let parentNote: Element | null = accid.getParent();
    for (; parentNote !== null; parentNote = parentNote.getParent()) {
      if (parentNote.getLocalName() === 'note') break;
      if (parentNote.getLocalName() === 'layer') {
        parentNote = null;
        break;
      }
    }

    const accidGesAtt = accid.getAttribute('accid.ges');
    if (
      accidGesAtt !== null &&
      parentNote !== null &&
      parentNote.getAttribute('accid.ges') === null
    )
      parentNote.addAttribute(new Attribute('accid.ges', accidGesAtt.getValue()));

    const accidAtt = accid.getAttribute('accid');
    if (accidAtt === null) return;
    if (parentNote !== null && parentNote.getAttribute('accid') === null)
      parentNote.addAttribute(new Attribute('accid', accidAtt.getValue()));

    // `@ploc`, else the parent note's `@pname`, else its `@pname.ges` unless that says
    // "none"; anything else and the accidental has no pitch to attach to and is dropped.
    // Every arm below either assigns a value read from the tree or returns, which is what
    // the closing `pname!` claimed — writing the reads as `string | null` locals lets the
    // compiler follow the same argument instead of being told the answer.
    const ploc = accid.getAttribute('ploc');
    let pname: string;
    if (ploc !== null) {
      pname = ploc.getValue();
    } else {
      if (parentNote === null) return;
      const notePname = parentNote.getAttributeValue('pname');
      if (notePname !== null) {
        pname = notePname;
      } else {
        const notePnameGes = parentNote.getAttributeValue('pname.ges');
        if (notePnameGes === null || notePnameGes === 'none') return;
        pname = notePnameGes;
      }
    }
    accid.addAttribute(new Attribute('pname', pname));

    // The same cascade for the octave, one step longer: `@oloc`, the parent note's `@oct`,
    // its `@oct.ges`, and finally the innermost `oct.default` in scope for this layer.
    const oloc = accid.getAttribute('oloc');
    let oct: string | null = null;
    if (oloc !== null) {
      oct = oloc.getValue();
    } else {
      if (parentNote === null) return;
      const noteOct = firstPresent(
        parentNote.getAttributeValue('oct'),
        parentNote.getAttributeValue('oct.ges'),
      );
      if (noteOct !== null) {
        oct = noteOct;
      } else {
        if (ctx.part === null) return;
        let octs = requirePartDatedMap(ctx, 'miscMap').getChildElements('oct.default');
        if (octs.size() === 0) {
          octs = requireGlobalDatedMap(ctx, 'miscMap').getChildElements('oct.default');
        }
        for (let i2 = octs.size() - 1; i2 >= 0; --i2) {
          const octDefault = octs.get(i2);
          const defaultLayer = octDefault.getAttributeValue('layer');
          if (defaultLayer === null || defaultLayer === Mei.getLayerId(Mei.getLayer(accid))) {
            oct = octDefault.getAttributeValue('oct.default');
            break;
          }
        }
        if (oct === null) return;
      }
    }
    accid.addAttribute(new Attribute('oct', oct));

    this.addLayerAttribute(accid, ctx);
    this.accid.push(accid);
  }

  private processDot(dot: Element): void {
    let parentNote: Element | null = null;
    for (
      let e: Element | null = dot.getParent();
      e !== null && !(e.getLocalName() === 'layer');
      e = e.getParent()
    ) {
      if (e.getLocalName() === 'note' || e.getLocalName() === 'rest') {
        parentNote = e;
        break;
      }
    }
    if (parentNote === null) return;

    const d = parentNote.getAttribute('childDots');
    if (d !== null) {
      d.setValue(String(1 + parseInt(d.getValue())));
    } else parentNote.addAttribute(new Attribute('childDots', '1'));
  }

  private processSyl(syl: Element): void {
    const lyricsElem = new Element('lyrics');

    for (
      let parent: Element | null = syl.getParent();
      parent !== null;
      parent = parent.getParent()
    ) {
      if (parent.getLocalName() === 'verse') {
        const n = parent.getAttribute('n');
        if (n !== null) lyricsElem.addAttribute(new Attribute('verse', n.getValue()));
        continue;
      }
      if (parent.getLocalName() === 'note') {
        let text = syl.getValue();
        const con = syl.getAttribute('con');
        if (con !== null) {
          switch (con.getValue()) {
            case 's':
              text += ' ';
              break;
            case 'd':
              text += '-';
              break;
            case 'u':
              text += '_';
              break;
            case 't':
              text += '~';
              break;
            case 'c':
              text += '\u02C6';
              break;
            case 'v':
              text += '\u02C7';
              break;
            case 'i':
              text += '\u0351';
              break;
            case 'b':
              text += '\u02D8';
              break;
            default:
              break;
          }
        }
        lyricsElem.appendChild(text);
        this.lyrics.push(lyricsElem);
        return;
      }
      if (
        parent.getLocalName() === 'measure' ||
        parent.getLocalName() === 'section' ||
        parent.getLocalName() === 'score' ||
        parent.getLocalName() === 'mdiv' ||
        parent.getLocalName() === 'body'
      )
        return;
    }
  }

  /**
   * Find or create the MSM `part` for a `staffDef`. Idempotent by `n`, so repeated
   * `staffDef`s for the same staff — MEI restates them at every `scoreDef` — update rather
   * than duplicate.
   *
   * The part's name is the enclosing `staffGrp`'s label followed by the staff's own label
   * (attribute, else `label` child), space-joined. That name is what
   * `Msm.processPartName`/`InstrumentsDictionary` later matches against to pick a MIDI
   * program, so its exact spelling reaches the MIDI output.
   *
   * A `staffDef` without `n` gets a **negative** number derived from the current part count
   * (and it is written back onto the MEI), so synthetic numbers can never collide with real
   * staff numbers.
   *
   * MIDI channel and port are derived from the *last* part added, not from a counter: the
   * channel is its channel + 1 modulo 16, skipping 9 — zero-based for MIDI channel 10 — when
   * {@link dontUseChannel10} is set, and the port advances only when the channel wraps back
   * to 0, modulo 256. Both are decided here rather than at MIDI export so that the MSM and
   * the eventual MIDI file agree.
   *
   * The MPM gets a matching part with the same label, number, channel and port; the two
   * stay index-aligned because both are appended here in the same call.
   */
  private makePart(staffDef: Element, ctx: WalkContext): Element {
    const existingPart = this.getPart(staffDef.getAttributeValue('n') ?? '', ctx);
    if (existingPart !== null) return existingPart;

    let label = '';
    const parentElem = staffDef.getParent();
    if (parentElem !== null && parentElem.getLocalName() === 'staffGrp') {
      const groupLabel = parentElem.getAttributeValue('label');
      if (groupLabel !== null) label = groupLabel;
    }
    const staffLabel = staffDef.getAttributeValue('label');
    if (staffLabel !== null) label += label === '' ? staffLabel : ` ${staffLabel}`;
    else {
      const labelElement = firstChildElement('label', staffDef);
      if (labelElement !== null) {
        label += label === '' ? labelElement.getValue() : ` ${labelElement.getValue()}`;
      }
    }

    let number: string;
    const staffNumber = staffDef.getAttributeValue('n');
    if (staffNumber !== null) {
      number = staffNumber;
    } else {
      number = String(-1 * requireMovement(ctx).msm.getChildElements('part').size());
      staffDef.addAttribute(new Attribute('n', number));
    }

    let midiChannel = 0;
    let midiPort = 0;
    const ps = requireMovement(ctx).msm.getChildElements('part');
    if (ps.size() > 0) {
      // The previous part's channel and port. Both are written by
      // `Msm.makePartFromString` on every part this converter creates, so a part without
      // them is a broken MSM rather than an encoding this method should tolerate — hence
      // `requireAttributeValue` and not a default.
      const p = ps.get(ps.size() - 1);
      midiChannel = (parseInt(requireAttributeValue('midi.channel', p)) + 1) % 16;
      if (midiChannel === 9 && this.dontUseChannel10) ++midiChannel;
      const previousPort = parseInt(requireAttributeValue('midi.port', p));
      midiPort = midiChannel === 0 ? (previousPort + 1) % 256 : previousPort;
    }

    const part = Msm.makePartFromString(label, number, midiChannel, midiPort);

    const xmlId = staffDef.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (xmlId !== null) {
      const partId = new Attribute(
        'xml:id',
        'http://www.w3.org/XML/1998/namespace',
        xmlId.getValue(),
      );
      part.addAttribute(partId);
    }

    part.addAttribute(
      new Attribute(
        'currentDate',
        ctx.measure !== null ? requireAttributeValue('date', ctx.measure) : '0.0',
      ),
    );

    requireMovement(ctx).msm.appendChild(part);

    // MPM part creation.
    //
    // This used to be guarded by `if (this.currentPerformance)`, a branch that could not be
    // false: the line above has already gone through `requireMovement`, and a movement is only
    // built once its performance exists (`makeMovement` returns early otherwise). The record
    // carries the performance beside the MSM, so the pairing is now in the type.
    const performancePart = MpmPart.fromValues(label, parseInt(number), midiChannel, midiPort);
    if (isOk(performancePart)) {
      requirePerformance(ctx).addPart(performancePart.value);
      if (xmlId !== null) performancePart.value.setId(xmlId.getValue());
    }

    return part;
  }

  /**
   * Build an MSM `timeSignature` from a `scoreDef`/`staffDef`/`meterSig`, reading `count`
   * and `unit` or their `meter.`-prefixed forms.
   *
   * The character loop over `count` is not decoration: MEI allows additive meters such as
   * `"3+2+2"`, and this **sums** every numeric run it finds, so `3+2+2` becomes 7. Any
   * non-numeric separator works, and a `count` with no digits at all sums to 0.
   */
  protected makeTimeSignature(meiSource: Element, ctx: WalkContext): Element | null {
    const s = new Element('timeSignature');
    copyId(meiSource, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));

    let count = meiSource.getAttribute('count');
    if (count === null) count = meiSource.getAttribute('meter.count');
    let unit = meiSource.getAttribute('unit');
    if (unit === null) unit = meiSource.getAttribute('meter.unit');
    if (count !== null && unit !== null) {
      const str = count.getValue();
      let result = 0.0;
      let num = '';
      for (let i = 0; i < str.length; ++i) {
        if ((str.charAt(i) >= '0' && str.charAt(i) <= '9') || str.charAt(i) === '.') {
          num += str.charAt(i);
          continue;
        }
        result += num === '' ? 0.0 : parseFloat(num);
        num = '';
      }
      result += num === '' ? 0.0 : parseFloat(num);
      s.addAttribute(new Attribute('numerator', String(result)));
      s.addAttribute(new Attribute('denominator', unit.getValue()));
      this.addLayerAttribute(s, ctx);
      return s;
    }

    let sym = meiSource.getAttribute('sym');
    if (sym === null) sym = meiSource.getAttribute('meter.sym');
    if (sym !== null) {
      // `str` stays nullable on purpose, and the `!`s that used to stand here were a lie
      // rather than a shortcut: `sym` above accepts *either* spelling, so a `meterSig`
      // carrying only `@meter.sym` reaches this line and `getAttributeValue('sym')` returns
      // null. Both comparisons below then simply fail and the method returns null, which is
      // what happened before — a `requireAttributeValue` here would throw instead.
      const str =
        meiSource.getLocalName() === 'meterSig'
          ? meiSource.getAttributeValue('sym')
          : meiSource.getAttributeValue('meter.sym');
      if (str === 'common') {
        s.addAttribute(new Attribute('numerator', '4'));
        s.addAttribute(new Attribute('denominator', '4'));
        this.addLayerAttribute(s, ctx);
        return s;
      } else if (str === 'cut') {
        s.addAttribute(new Attribute('numerator', '2'));
        s.addAttribute(new Attribute('denominator', '2'));
        this.addLayerAttribute(s, ctx);
        return s;
      }
    }

    return null;
  }

  private makeKeySignature(meiSource: Element, ctx: WalkContext): Element | null {
    const s = new Element('keySignature');
    copyId(meiSource, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));

    const accidentals: Element[] = [];
    let sig = '';
    let mixed = '';

    if (meiSource.getLocalName() === 'scoreDef' || meiSource.getLocalName() === 'staffDef') {
      // `key.sig` decides whether there is a key signature at all; the rest default to the
      // empty string the two locals were initialised with, which is what the `if`s said.
      const keySig = meiSource.getAttributeValue('key.sig');
      if (keySig === null) return null;
      sig = keySig;
      mixed = orDefault(meiSource.getAttributeValue('key.sig.mixed'), '');
    } else if (meiSource.getLocalName() === 'keySig') {
      sig = orDefault(meiSource.getAttributeValue('sig'), '');
      mixed = orDefault(meiSource.getAttributeValue('sig.mixed'), '');

      const accids = meiSource.getChildElements('keyAccid');
      for (let i = 0; i < accids.size(); ++i) {
        // The element, its `@pname` and its `@accid` read once each. The guard below is the
        // same "both attributes or skip this keyAccid" test as before — but it now narrows
        // the two values for the rest of the iteration, where each was previously fetched
        // again and asserted (five lookups per accidental became two).
        const keyAccid = accids.get(i);
        const pname = keyAccid.getAttributeValue('pname');
        const accid = keyAccid.getAttributeValue('accid');
        if (pname === null || accid === null) {
          console.error(
            `The following keyAccid element requires a pname and accid attribute for processing in meico: ${keyAccid.toXML()}`,
          );
          continue;
        }
        const pitch = pname2midi(pname);
        if (pitch < 0.0) {
          console.error(`No valid value in attribute pname: ${keyAccid.toXML()}`);
          continue;
        }
        const accidental = new Element('accidental');
        accidental.addAttribute(new Attribute('midi.pitch', String(pitch)));
        accidental.addAttribute(new Attribute('pitchname', pname));
        accidental.addAttribute(new Attribute('value', String(accidString2decimal(accid))));
        accidentals.push(accidental);
      }
    }

    if (accidentals.length === 0 && sig !== '') {
      if (sig === 'mixed') {
        if (mixed !== '') {
          const acs = mixed.split(' ');
          for (const ac of acs) {
            const pitch = pname2midi(ac.substring(0, 1));
            if (pitch < 0.0) continue;
            if (ac.charAt(ac.length - 1) >= '0' && ac.charAt(ac.length - 1) <= '9') continue;
            const secondLastIsDigit =
              ac.charAt(ac.length - 2) >= '0' && ac.charAt(ac.length - 2) <= '9';
            const accidVal = accidString2decimal(
              ac.substring(ac.length - (secondLastIsDigit ? 1 : 2)),
            );
            const accidental = new Element('accidental');
            accidental.addAttribute(new Attribute('midi.pitch', String(pitch)));
            accidental.addAttribute(new Attribute('pitchname', ac.substring(0, 1)));
            accidental.addAttribute(new Attribute('value', String(accidVal)));
            accidentals.push(accidental);
          }
        }
      } else {
        let accidCount: number;
        switch (sig.charAt(sig.length - 1)) {
          case 'f':
            accidCount = parseInt(sig.substring(0, sig.length - 1));
            accidCount *= -1;
            break;
          case 's':
            accidCount = parseInt(sig.substring(0, sig.length - 1));
            break;
          case '0':
            accidCount = 0;
            break;
          default:
            accidCount = 0;
            console.error(
              `Unknown sig or key.sig attribute value in ${meiSource.toXML()}. Assume 0 in the further processing.`,
            );
        }
        // Java keeps two index-aligned arrays here and walks them with one counter; they are
        // one sequence of (pitch, name) pairs, and as pairs the loop takes elements instead
        // of indices. The order within each is the circle of fifths in the corresponding
        // direction, so the first `|accidCount|` of them are exactly the key's accidentals.
        const circleOfFifths =
          accidCount > 0 ? CIRCLE_OF_FIFTHS_SHARPWARD : CIRCLE_OF_FIFTHS_FLATWARD;
        for (const [midiPitch, pitchName] of circleOfFifths.slice(0, Math.abs(accidCount))) {
          const accidental = new Element('accidental');
          accidental.addAttribute(new Attribute('midi.pitch', midiPitch));
          accidental.addAttribute(new Attribute('pitchname', pitchName));
          accidental.addAttribute(new Attribute('value', accidCount > 0 ? '1.0' : '-1.0'));
          accidentals.push(accidental);
        }
      }
    }

    for (const accidental of accidentals) {
      s.appendChild(accidental);
    }

    this.addLayerAttribute(s, ctx);
    return s;
  }

  /**
   * Convert one chord: give it a duration, mark it if it carries articulations, and walk its
   * notes with the chord in force.
   *
   * Chords nest — MEI's `bTrem`/`fTrem` route here too, and both may wrap a chord — which is
   * why `ctx.chord` is consulted twice: an inner chord inherits the outer's `dur`/`dots` when
   * it states neither, and only the *outermost* chord advances the part's clock.
   */
  private processChord(chord: Element, ctx: WalkContext): void {
    if (ctx.part === null) return;

    if (ctx.chord !== null) {
      // an inner chord inherits the enclosing chord's duration for whichever of the two
      // attributes it does not carry itself
      const outerDur = ctx.chord.getAttributeValue('dur');
      if (chord.getAttribute('dur') === null && outerDur !== null) {
        chord.addAttribute(new Attribute('dur', outerDur));
      }
      const outerDots = ctx.chord.getAttributeValue('dots');
      if (chord.getAttribute('dots') === null && outerDots !== null) {
        chord.addAttribute(new Attribute('dots', outerDots));
      }
    }

    let dur = 0.0;
    if (chord.getAttribute('dur') !== null) {
      dur = this.computeDuration(chord, ctx);
    } else {
      const durs = chord.query('descendant::*[attribute::dur]');
      let idur = 0.0;
      for (let i = 0; i < durs.size(); ++i) {
        idur = this.computeDuration(durs.get(i) as unknown as Element, ctx);
        if (idur > dur) dur = idur;
      }
    }

    // Everything from here down is *inside* the chord — the duration above deliberately is
    // not, since it reads the enclosing chord's `dur` when this one has none.
    const inChord: WalkContext = { ...ctx, chord };

    this.checkSlurs(chord, inChord);

    if (chord.query("descendant::*[local-name()='artic']").size() > 0)
      chord.addAttribute(new Attribute('hasArticulations', 'true'));
    this.processArtic(chord, inChord);

    this.convertElement(chord, inChord);
    // The clock advances once, for the outermost chord only: an inner chord's notes sound
    // within their parent's span, so they must not move it a second time. As a field this
    // read `this.currentChord === null` *after* the restore, which said the same thing about
    // the value that had just been put back — i.e. about `ctx`.
    if (ctx.chord === null) {
      advancePartClock(ctx.part, dur);
    }
  }

  /**
   * Handle a `tuplet` that carries its own `dur`, i.e. one that states its total length
   * rather than leaving it to be derived from its contents.
   *
   * @return true if it was handled here — the caller then does **not** descend again, since
   *   this method already walked the children; false to let {@link convertElement}'s
   *   generic descent take over, which is the normal case. The tuplet ratio itself is
   *   applied per note inside {@link computeDuration}, not here.
   */
  private processTuplet(tuplet: Element, ctx: WalkContext): boolean {
    if (tuplet.getAttribute('dur') !== null) {
      // The clock is read *before* the descent and written after, so this is deliberately
      // not `advancePartClock`: the tuplet's own duration replaces whatever its contents
      // advanced the clock to, rather than adding to it.
      const clock = partClock(requirePart(ctx));
      const cd = parseFloat(clock.getValue());
      this.convertElement(tuplet, ctx);
      const dur = this.computeDuration(tuplet, ctx);
      partClock(requirePart(ctx)).setValue(String(cd + dur));
      return true;
    }
    return false;
  }

  private processTupletSpan(tupletSpan: Element, ctx: WalkContext): void {
    if (tupletSpan.getAttribute('num') === null || tupletSpan.getAttribute('numbase') === null) {
      console.error(
        `Cannot process MEI element ${tupletSpan.toXML()}. Attributes 'num' and 'numbase' both need to be specified.`,
      );
      return;
    }

    const timingData = this.computeControlEventTiming(tupletSpan, ctx.part, ctx);
    if (timingData === null) return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    let att = tupletSpan.getAttribute('part');
    if (att === null) att = tupletSpan.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      const clone = cloneElement(tupletSpan);
      clone.addAttribute(new Attribute('date', String(date)));
      if (endDate !== null) {
        clone.addAttribute(new Attribute('date.end', String(endDate)));
      } else if (tstamp2 !== null) {
        clone.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(clone);
      } else if (endid !== null) {
        this.endids.push(clone);
      }

      const tsMap = requireFirstChildElement(
        requireGlobalDatedMap(ctx, 'miscMap'),
        'tupletSpanMap',
      );
      addToMap(clone, tsMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      const parts = requireMovement(ctx).msm.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const clone = cloneElement(tupletSpan);
          clone.addAttribute(new Attribute('date', String(date)));
          const cloneId = clone.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (cloneId !== null) cloneId.setValue(`meico_copyId_${staff}_${cloneId.getValue()}`);
          if (endDate !== null) {
            clone.addAttribute(new Attribute('date.end', String(endDate)));
          } else if (tstamp2 !== null) {
            clone.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
            this.tstamp2s.push(clone);
          } else if (endid !== null) {
            this.endids.push(clone);
          }

          const tsMap = requireFirstChildElement(
            requireDatedMap(parts.get(p), 'miscMap'),
            'tupletSpanMap',
          );
          addToMap(clone, tsMap);
          this.addLayerAttribute(clone, ctx);
        }
      }
    }
  }

  /**
   * Convert an MEI `arpeg` into an MPM ornament referencing the `arpeggio` ornament
   * definition.
   *
   * `order="nonarp"` means "explicitly not arpeggiated" and is rejected up front. The note
   * order is then determined one of two ways:
   * - **no `plist`**: the order is symbolic — `'ascending pitch'`, or `'descending pitch'`
   *   for `order="down"`. MPM resolves it at rendering time and nothing more is needed;
   * - **with a `plist`**: the order is the listed notes, in listed order. A `plist` entry
   *   naming a *chord* is expanded into its notes, minting ids for any that lack one.
   *
   * The `plist` case cannot be finished here, because a note's pitch is only known after
   * {@link processNote} has run on it. So the ornament's `note.order` attribute is parked
   * on {@link arpeggiosToSort} together with a direction flag and sorted at the end of
   * {@link makeMovement}, once every `pnum` exists.
   */
  private processArpeg(arpeg: Element, ctx: WalkContext): void {
    // check if this is really an arpeggio
    const order = attribute('order', arpeg);
    if (order !== null && order.getValue().trim() === 'nonarp') return;

    // compute the timing
    const timingData = this.computeControlEventTiming(arpeg, ctx.part, ctx);
    if (timingData === null) return;

    // create ornament data
    const od = new OrnamentData();
    od.date = timingData[0];
    od.ornamentDefName = 'arpeggio';
    od.scale = 0.0;

    // read the xml:id
    const id = attribute('id', arpeg);
    od.xmlId = id === null ? null : id.getValue();

    // determine the note order
    let needsPostprocessing = 0;
    const plist = attribute('plist', arpeg);
    if (plist === null) {
      if (order !== null) {
        od.noteOrder = [];
        if (order.getValue().trim() === 'down') od.noteOrder.push('descending pitch');
        else od.noteOrder.push('ascending pitch');
      }
    } else {
      od.noteOrder = [];
      for (const ref of plist.getValue().trim().split(/\s+/)) {
        const e = this.allNotesAndChords.get(ref.replace(/#/g, ''));
        if (e === undefined) continue;
        if (e.getLocalName() === 'note') {
          od.noteOrder.push(ref);
          continue;
        }
        if (e.getLocalName() === 'chord') {
          const notes = e.query("descendant::*[local-name()='note']");
          for (let n = 0; n < notes.size(); ++n) {
            const note = notes.get(n) as unknown as Element;
            let noteId = attribute('id', note);
            if (noteId === null) {
              noteId = new Attribute(
                'xml:id',
                'http://www.w3.org/XML/1998/namespace',
                `meico_${uuidv4()}`,
              );
              this.allNotesAndChords.set(noteId.getValue(), note);
              note.addAttribute(noteId);
            }
            od.noteOrder.push(`#${noteId.getValue()}`);
          }
        }
      }

      if (order !== null) {
        if (order.getValue().trim() === 'down') needsPostprocessing = -1;
        else if (order.getValue().trim() === 'up') needsPostprocessing = 1;
      }
    }

    // Make sure that the arpeggio is defined in a global ornamentation style.
    //
    // The `| null` on the *second* cast was wrong, and it cost fifteen assertions across the
    // six blocks shaped like this one: `Header.addStyleDef(type, name)` returns the style it
    // just created, so only the `getStyleDef` lookup can come back null. With the created
    // style typed as present, the two arms join to a non-null value and every downstream
    // `ornamentationStyle!` / `articulationStyle!` reads plainly — and the two
    // `!== null` guards that had grown around the same value (`dynamicsStyle`, `tempoStyle`)
    // went with them, since the compiler now sees they can never fail.
    let ornamentationStyle = globalHeader(ctx).getStyleDef(
      Mpm.ORNAMENTATION_STYLE,
      'MEI export',
    ) as OrnamentationStyle | null;
    if (ornamentationStyle === null)
      ornamentationStyle = globalHeader(ctx).addStyleDef(
        Mpm.ORNAMENTATION_STYLE,
        'MEI export',
      ) as OrnamentationStyle;
    if (ornamentationStyle.getDef(od.ornamentDefName) === undefined) {
      const def = OrnamentDef.createDefaultOrnamentDef(od.ornamentDefName);
      if (isOk(def)) ornamentationStyle.addDef(def.value);
    }

    // parse the staff attribute
    let ornamentationMap: OrnamentationMap | null;
    let att = arpeg.getAttribute('part');
    if (att === null) att = arpeg.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      ornamentationMap = globalDated(ctx).getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = globalDated(ctx).addMap(
          OrnamentationMap.createOrnamentationMap(),
        ) as OrnamentationMap;
        ornamentationMap.addStyleSwitch(0.0, 'MEI export');
      }
      const index = ornamentationMap.addOrnamentFromData(od);
      if (needsPostprocessing !== 0)
        this.arpeggiosToSort.push(
          new KeyValue<Attribute, boolean>(
            requireAttribute('note.order', mapElement(ornamentationMap, index)),
            needsPostprocessing > 0,
          ),
        );
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = requirePerformance(ctx).getPart(parseInt(staff));
        if (part === null) continue;

        ornamentationMap = mpmDated(part).getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
        if (ornamentationMap === null) {
          ornamentationMap = mpmDated(part).addMap(
            OrnamentationMap.createOrnamentationMap(),
          ) as OrnamentationMap;
          ornamentationMap.addStyleSwitch(0.0, 'MEI export');
        }

        const odd = od.clone();
        if (od.xmlId !== null && multiIDs) odd.xmlId = `${od.xmlId}_meico_${uuidv4()}`;

        const index = ornamentationMap.addOrnamentFromData(odd);
        if (needsPostprocessing !== 0)
          this.arpeggiosToSort.push(
            new KeyValue<Attribute, boolean>(
              requireAttribute('note.order', mapElement(ornamentationMap, index)),
              needsPostprocessing > 0,
            ),
          );

        multiIDs = true;
      }
    }
  }

  /**
   * Expand one `<trill>`, `<mordent>` or `<turn>` into an MPM v3 ornament (DESIGN.md D17).
   *
   * A no-op unless {@link expandOrnaments} is on — see that field for why it is off by default.
   *
   * The shape of this method is {@link processArpeg}'s, deliberately: an ornament sign and an
   * arpeggio need the same three things — a date from {@link computeControlEventTiming}, an
   * `ornamentDef` in a global `"MEI export"` style, and an `ornamentationMap` on each part the
   * event applies to, created on demand with a style switch at date 0. Following the existing
   * method keeps one idiom for authoring MPM out of MEI. What differs is *what* is authored:
   * {@link buildOrnamentData} produces a v3 ornament with a note pool and a `note.order`, where
   * an arpeggio produces a v2 one with neither.
   *
   * `processArpeg`'s multi-staff handling is reproduced, including the `_meico_<uuid>` suffix
   * that keeps ids unique when one sign applies to several staves; its arpeggio-specific
   * pitch-sorting postprocessing has no counterpart here, because a dictionary sequence already
   * fixes the playing order.
   */
  private processOrnamentSign(sign: Element, ctx: WalkContext): void {
    if (!this.expandOrnaments) return;

    const resolved = resolveOrnamentSign(sign);
    if (resolved === null) return;

    // The principal must be a note of this movement. `computeControlEventTiming` below would
    // also fail to find it, but silently and by a different route (it would fall through to a
    // tstamp of null and date the ornament at the part's current position), so the reference is
    // checked explicitly and the ornament dropped with a message that names the missing id.
    if (!this.allNotesAndChords.has(resolved.principalId)) {
      console.error(
        `Warning: ${sign.toXML()} names no note of this movement in its startid; the ornament is skipped.`,
      );
      return;
    }

    // Null means the event carried a startid but no tstamp and has just been moved next to its
    // principal note; the walk will reach it again there, where the date resolves. Same contract
    // as processArpeg.
    const timingData = this.computeControlEventTiming(sign, ctx.part, ctx);
    if (timingData === null) return;

    const idAtt = attribute('id', sign);
    const idBase = idAtt === null ? `meico_${uuidv4()}` : idAtt.getValue();
    const date = timingData[0];

    // make sure that the ornament is defined in a global ornamentation style
    let ornamentationStyle = globalHeader(ctx).getStyleDef(
      Mpm.ORNAMENTATION_STYLE,
      'MEI export',
    ) as OrnamentationStyle | null;
    if (ornamentationStyle === null)
      ornamentationStyle = globalHeader(ctx).addStyleDef(
        Mpm.ORNAMENTATION_STYLE,
        'MEI export',
      ) as OrnamentationStyle;
    if (ornamentationStyle.getDef(resolved.defName) === undefined) {
      const def = createMeiOrnamentDef(resolved.defName);
      if (isOk(def)) ornamentationStyle.addDef(def.value);
    }

    // parse the staff attribute
    let ornamentationMap: OrnamentationMap | null;
    let att = sign.getAttribute('part');
    if (att === null) att = sign.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      ornamentationMap = globalDated(ctx).getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = globalDated(ctx).addMap(
          OrnamentationMap.createOrnamentationMap(),
        ) as OrnamentationMap;
        ornamentationMap.addStyleSwitch(0.0, 'MEI export');
      }
      ornamentationMap.addOrnamentFromData(
        buildOrnamentData(resolved.shape, resolved.defName, resolved.principalId, date, idBase),
      );
      return;
    }

    let multiIDs = false;
    for (const staff of att.getValue().split(/\s+/)) {
      const part = requirePerformance(ctx).getPart(parseInt(staff));
      if (part === null) continue;

      ornamentationMap = mpmDated(part).getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = mpmDated(part).addMap(
          OrnamentationMap.createOrnamentationMap(),
        ) as OrnamentationMap;
        ornamentationMap.addStyleSwitch(0.0, 'MEI export');
      }

      // Built per part rather than cloned from one shared object. Cloning would carry the pool
      // notes' `xml:id`s along with it, so a sign naming two staves would emit `<note
      // xml:id="tr1_n0">` twice in one MPM. Deriving the whole ornament from a per-part id stem
      // keeps every generated id unique. The stem itself follows processArpeg's `_meico_<uuid>`
      // convention for the second and later staves, so the first staff keeps the readable id.
      const stem = multiIDs ? `${idBase}_meico_${uuidv4()}` : idBase;
      ornamentationMap.addOrnamentFromData(
        buildOrnamentData(resolved.shape, resolved.defName, resolved.principalId, date, stem),
      );

      multiIDs = true;
    }
  }

  private processDynam(dynam: Element, ctx: WalkContext): void {
    const dd = new DynamicsData();

    switch (dynam.getLocalName()) {
      case 'dynam':
        dd.volumeString = dynam.getValue();
        if (dd.volumeString === '') {
          const label = dynam.getAttribute('label');
          if (label !== null) dd.volumeString = label.getValue();
        }
        if (dd.volumeString === '') {
          console.error(
            `Cannot process MEI element ${dynam.toXML()}. No value or label specified.`,
          );
          return;
        }
        if (dd.volumeString.includes('dim') || dd.volumeString.includes('decresc')) {
          dd.volumeString = '?';
          dd.transitionToString = '-';
        } else if (dd.volumeString.includes('cresc')) {
          dd.volumeString = '?';
          dd.transitionToString = '+';
        } else {
          let dynamicsStyle = globalHeader(ctx).getStyleDef(
            Mpm.DYNAMICS_STYLE,
            'MEI export',
          ) as DynamicsStyle | null;
          if (dynamicsStyle === null)
            dynamicsStyle = globalHeader(ctx).addStyleDef(
              Mpm.DYNAMICS_STYLE,
              'MEI export',
            ) as DynamicsStyle;

          if (dynamicsStyle.getDef(dd.volumeString) === undefined) {
            const def = DynamicsDef.createDefaultDynamicsDef(dd.volumeString);
            if (isOk(def)) dynamicsStyle.addDef(def.value);
          }
        }
        break;
      case 'hairpin': {
        dd.volumeString = '?';
        const form = dynam.getAttribute('form');
        if (form === null) {
          console.error(
            `Cannot process MEI element ${dynam.toXML()}. Attribute 'form' is missing.`,
          );
          return;
        }
        if (form.getValue() === 'cres') dd.transitionToString = '+';
        else if (form.getValue() === 'dim') dd.transitionToString = '-';
        else {
          console.error(
            `Cannot process MEI element ${dynam.toXML()}. Value of attribute 'form' is neither 'cres' nor 'dim'.`,
          );
          return;
        }
        break;
      }
      default:
        console.error(`Unknown MEI dynamics instruction ${dynam.toXML()}.`);
        return;
    }

    if (dd.transitionToString !== null) {
      dd.curvature = 0.0;
      dd.protraction = 0.0;
    }

    // compute the timing
    const timingData = this.computeControlEventTiming(dynam, ctx.part, ctx);
    if (timingData === null) return;
    dd.startDate = timingData[0];
    dd.endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    // read the xml:id
    const id = attribute('id', dynam);
    dd.xmlId = id === null ? null : id.getValue();

    // parse the staff attribute
    let dynamicsMap: DynamicsMap | null;
    let att = dynam.getAttribute('part');
    if (att === null) att = dynam.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      dynamicsMap = globalDated(ctx).getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
      if (dynamicsMap === null) {
        dynamicsMap = globalDated(ctx).addMap(DynamicsMap.createDynamicsMap()) as DynamicsMap;
        dynamicsMap.addStyleSwitch(0.0, 'MEI export');
      }

      this.addDynamicsToMpm(dd, dynamicsMap, endid, tstamp2);
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = requirePerformance(ctx).getPart(parseInt(staff));
        if (part === null) continue;

        dynamicsMap = mpmDated(part).getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
        if (dynamicsMap === null) {
          dynamicsMap = mpmDated(part).addMap(DynamicsMap.createDynamicsMap()) as DynamicsMap;
          dynamicsMap.addStyleSwitch(0.0, 'MEI export');
        }

        const ddd = dd.clone();
        if (dd.xmlId !== null && multiIDs) ddd.xmlId = `${dd.xmlId}_meico_${uuidv4()}`;

        this.addDynamicsToMpm(ddd, dynamicsMap, endid, tstamp2);

        multiIDs = true;
      }
    }
  }

  private addDynamicsToMpm(
    dynamicsData: DynamicsData,
    dynamicsMap: DynamicsMap,
    endid: Attribute | null,
    tstamp2: Attribute | null,
  ): number {
    // The instruction this one continues from: the last entry that starts at or before it.
    // Java counts an index down, skips the later entries and `break`s on the first hit —
    // which is a backwards search, and as one the body reads the entry it found instead of
    // indexing back into the array three more times.
    const previousDynamics = dynamicsMap.getAllElements();
    const predecessor = findLast(
      previousDynamics,
      (entry) => entry.getKey() <= dynamicsData.startDate,
    );
    if (predecessor !== null) {
      const trans = predecessor.getValue().getAttribute('transition.to');
      if (dynamicsData.transitionToString === null) {
        if (trans !== null) {
          // Java passes `volumeString` straight to `Attribute.setValue`, which rejects null
          // with an NPE. The `!` here did something worse than throw: it wrote the null *into*
          // the attribute, where it would serialise as the text `null`. Naming the case is the
          // faithful reading — and it is not reachable from the corpus, which a probe
          // confirmed by counting zero arrivals here with a null `volumeString` over all 6066
          // tests, so no fixture byte can move.
          if (dynamicsData.volumeString === null)
            throw new MissingNodeError(
              'a continuous dynamics instruction has no volume for its predecessor to transition to',
            );
          trans.setValue(dynamicsData.volumeString);
        }
      } else if (trans !== null) {
        dynamicsData.volumeString = trans.getValue();
      } else {
        dynamicsData.volumeString = predecessor.getValue().getAttributeValue('volume');
      }
    }
    if (dynamicsData.volumeString === null) dynamicsData.volumeString = '?';

    const index = dynamicsMap.addDynamicsFromData(dynamicsData);
    if (index < 0) return index;
    const dynamics = mapElement(dynamicsMap, index);
    if (dynamicsData.endDate !== null) {
      dynamics.addAttribute(new Attribute('date.end', String(dynamicsData.endDate)));
    } else if (tstamp2 !== null) {
      dynamics.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
      this.tstamp2s.push(dynamics);
    } else if (endid !== null) {
      dynamics.addAttribute(new Attribute('endid', endid.getValue()));
      this.endids.push(dynamics);
    }

    return index;
  }

  private processTempo(tempo: Element, ctx: WalkContext): void {
    const tempoData = this.parseTempo(tempo, ctx.part, ctx);
    if (tempoData === null) return;

    // compute the timing or get the necessary data to compute the end date later on
    const timingData = this.computeControlEventTiming(tempo, ctx.part, ctx);
    if (timingData === null) return;
    tempoData.startDate = timingData[0];
    tempoData.endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    // parse the staff attribute (space separated staff numbers)
    let tempoMap: TempoMap | null;
    let att = tempo.getAttribute('part');
    if (att === null) att = tempo.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      tempoMap = globalDated(ctx).getMap(Mpm.TEMPO_MAP) as TempoMap | null;
      if (tempoMap === null) {
        tempoMap = globalDated(ctx).addMap(TempoMap.createTempoMap()) as TempoMap;

        if (globalHeader(ctx).getAllStyleTypes().get(Mpm.TEMPO_STYLE) !== undefined)
          tempoMap.addStyleSwitch(0.0, 'MEI export');
      }

      this.addTempoToMpm(tempoData, tempoMap, endid, tstamp2);
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = requirePerformance(ctx).getPart(parseInt(staff));
        if (part === null) continue;

        tempoMap = mpmDated(part).getMap(Mpm.TEMPO_MAP) as TempoMap | null;
        if (tempoMap === null) {
          tempoMap = mpmDated(part).addMap(TempoMap.createTempoMap()) as TempoMap;
          tempoMap.addStyleSwitch(0.0, 'MEI export');
        }

        const td = tempoData.clone();
        if (tempoData.xmlId !== null && multiIDs) td.xmlId = `${tempoData.xmlId}_meico_${uuidv4()}`;

        this.addTempoToMpm(td, tempoMap, endid, tstamp2);
        multiIDs = true;
      }
    }
  }

  private addTempoToMpm(
    tempoData: TempoData,
    tempoMap: TempoMap,
    endid: Attribute | null,
    tstamp2: Attribute | null,
  ): number {
    // The same backwards search as {@link addDynamicsToMpm}, over `bpm` instead of `volume`.
    const previousTempo = tempoMap.getAllElements();
    const predecessor = findLast(previousTempo, (entry) => entry.getKey() <= tempoData.startDate);
    if (predecessor !== null) {
      const trans = predecessor.getValue().getAttribute('transition.to');
      if (tempoData.transitionToString === null) {
        if (trans !== null) {
          // the tempo twin of the `volumeString` case in {@link addDynamicsToMpm}; same
          // reasoning, same probe result
          if (tempoData.bpmString === null)
            throw new MissingNodeError(
              'a continuous tempo instruction has no bpm for its predecessor to transition to',
            );
          trans.setValue(tempoData.bpmString);
        }
      } else if (trans !== null) {
        tempoData.bpmString = trans.getValue();
      } else {
        tempoData.bpmString = predecessor.getValue().getAttributeValue('bpm');
      }
    }

    const index = tempoMap.addTempo(tempoData);
    if (index < 0) return index;
    const tempoElement = mapElement(tempoMap, index);
    if (tempoData.endDate !== null) {
      tempoElement.addAttribute(new Attribute('date.end', String(tempoData.endDate)));
    } else if (tstamp2 !== null) {
      tempoElement.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
      this.tstamp2s.push(tempoElement);
    } else if (endid !== null) {
      tempoElement.addAttribute(new Attribute('endid', endid.getValue()));
      this.endids.push(tempoElement);
    }

    return index;
  }

  private processArtic(artic: Element, ctx: WalkContext): void {
    if (ctx.part === null) return;

    let att = artic.getAttribute('artic.ges');
    const slur = artic.getAttribute('slur');
    if (att === null) {
      att = artic.getAttribute('artic');
      if (att === null && slur === null) return;
    }

    // get the xmlid
    let xmlid: string | null = null;
    const articId = attribute('id', artic);
    if (articId !== null) xmlid = articId.getValue();

    // make sure there is a styleDef in MPM for articulation definitions
    let articulationStyle = globalHeader(ctx).getStyleDef(
      Mpm.ARTICULATION_STYLE,
      'MEI export',
    ) as ArticulationStyle | null;
    if (articulationStyle === null) {
      articulationStyle = globalHeader(ctx).addStyleDef(
        Mpm.ARTICULATION_STYLE,
        'MEI export',
      ) as ArticulationStyle;
      const nonlegatoDef = ArticulationDef.createDefaultArticulationDef('nonlegato');
      if (isOk(nonlegatoDef)) articulationStyle.addDef(nonlegatoDef.value);
    }

    // find the local articulationMap
    const date = this.getMidiTime(ctx);
    // Unlike the `staff`-list loops elsewhere in this class, which skip a part they cannot
    // find, Java dereferences this one straight away and would NPE — the current MSM part
    // always has an MPM twin, because `makePart` appends to both in the same call.
    const partNumber = parseInt(requireAttributeValue('number', ctx.part));
    const part = requirePerformance(ctx).getPart(partNumber);
    if (part === null)
      throw new MissingNodeError(`the MPM performance has no part numbered ${partNumber}`);
    let map = mpmDated(part).getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
    if (map === null) {
      map = mpmDated(part).addMap(ArticulationMap.createArticulationMap()) as ArticulationMap;
      map.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
    }

    for (
      let parent: Element | null = artic;
      parent !== null && parent !== this.requireMei().getRootElement();
      parent = parent.getParent()
    ) {
      if (parent.getLocalName() === 'note') {
        let noteId = getAttributeValue('id', parent);
        if (noteId === '') {
          noteId = `meico_${uuidv4()}`;
          parent.addAttribute(
            new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', noteId),
          );
        }
        if (att !== null)
          this.addArticulationToMap(date, att.getValue(), xmlid, noteId, map, articulationStyle);
        if (slur !== null) {
          // the ternary this replaces asked whether the attribute was there and then read it,
          // which is what `getAttributeValue` answers in one call
          const slurid = artic.getAttributeValue('slurid');
          if (slur.getValue().includes('t'))
            this.addArticulationToMap(date, 'legatoStop', slurid, noteId, map, articulationStyle);
          else if (slur.getValue().includes('i') || slur.getValue().includes('m'))
            this.addArticulationToMap(date, 'legato', slurid, noteId, map, articulationStyle);
        }
        return;
      }
      if (parent.getLocalName() === 'chord') {
        let multiIDs = false;
        let multiSlurIDs = false;
        const notes = parent.query("descendant::*[local-name()='note']");
        for (let i = 0; i < notes.size(); ++i) {
          const note = notes.get(i) as unknown as Element;
          const subArtics = note.query("descendant::*[local-name()='artic']");
          if (
            note.getAttribute('artic') !== null ||
            note.getAttribute('artic.ges') !== null ||
            subArtics.size() > 0
          )
            continue;

          if (note.getAttribute('date') !== null) {
            const noteId = getAttributeValue('id', note);
            if (att !== null) {
              this.addArticulationToMap(
                date,
                att.getValue(),
                xmlid === null ? null : xmlid + (multiIDs ? `_meico_${uuidv4()}` : ''),
                noteId,
                map,
                articulationStyle,
              );
              multiIDs = true;
            }
            if (slur !== null) {
              const slurid = artic.getAttributeValue('slurid');
              if (slurid !== null) {
                note.addAttribute(
                  new Attribute('slurid', multiSlurIDs ? `${slurid}_meico_${uuidv4()}` : slurid),
                );
                multiSlurIDs = true;
              }
              if (slur.getValue().includes('t'))
                this.addArticulationToMap(
                  date,
                  'legatoStop',
                  slurid,
                  noteId,
                  map,
                  articulationStyle,
                );
              else if (slur.getValue().includes('i') || slur.getValue().includes('m'))
                this.addArticulationToMap(date, 'legato', slurid, noteId, map, articulationStyle);
            }
          } else {
            if (att !== null) {
              const newArtic = new Element('artic');
              newArtic.addAttribute(new Attribute(att.getLocalName(), att.getValue()));
              if (xmlid !== null)
                newArtic.addAttribute(
                  new Attribute(
                    'xml:id',
                    'http://www.w3.org/XML/1998/namespace',
                    xmlid + (multiIDs ? `_meico_${uuidv4()}` : ''),
                  ),
                );
              note.appendChild(newArtic);
              multiIDs = true;
            }
            if (slur !== null) {
              note.addAttribute(new Attribute('slur', slur.getValue()));
              const slurid = artic.getAttributeValue('slurid');
              if (slurid !== null) {
                note.addAttribute(
                  new Attribute('slurid', multiSlurIDs ? `${slurid}_meico_${uuidv4()}` : slurid),
                );
                multiSlurIDs = true;
              }
            }
          }
        }
        return;
      }
      if (
        (parent === ctx.layer || parent.getLocalName() === 'staff' || parent === ctx.measure) &&
        att !== null
      ) {
        this.addArticulationToMap(date, att.getValue(), xmlid, null, map, articulationStyle);
        return;
      }
    }
  }

  private addArticulationToMap(
    date: number,
    articulation: string,
    id: string | null,
    noteid: string | null,
    articulationMap: ArticulationMap,
    articulationStyle: ArticulationStyle,
  ): void {
    const articulations = articulation.trim().split(/\s+/);

    for (const artic of articulations) {
      if (articulationStyle.getDef(artic) === undefined) {
        const def = ArticulationDef.createDefaultArticulationDef(artic);
        if (isErr(def)) {
          // Still printed, and now with the reason in it: the def factory used to print its
          // own exception and hand back a bare null, so this line could only say "it failed".
          console.error(
            `Failed to generate articulationDef for "${artic}". ${describeMpmParseError(def.error)}`,
          );
          continue;
        }
        articulationStyle.addDef(def.value);
      }
      articulationMap.addArticulation(date, artic, noteid === null ? null : `#${noteid}`, id);
    }
  }

  private processBreath(breath: Element, ctx: WalkContext): void {
    if (ctx.measure === null) return;

    // get the xmlid
    let xmlid: string | null = null;
    const id = attribute('id', breath);
    if (id !== null) xmlid = id.getValue();

    // the breath must specify the notes/chords that precede it
    let prevs: string[] | null = null;
    let att = breath.getAttribute('prev');
    if (att === null) {
      att = breath.getAttribute('follows');
      if (att === null) {
        att = breath.getAttribute('startid');
        if (att === null) {
          att = breath.getAttribute('tstamp.ges');
          if (att === null) {
            att = breath.getAttribute('tstamp');
            if (att === null) {
              console.error(
                `Cannot process MEI element ${breath.toXML()}. At least one of the attributes 'prev', 'follows' or 'startid' should be specified to indicate the preceding notes or chords affected by the breath. Alternatively, but not recommended(!), attribute 'tstamp.ges' or 'tstamp' may be defined at the risk that the breath does not coincide with a note's date and will, thus, have no effect on the music.`,
              );
              return;
            }
          }

          // create the articulation from tstamp/tstamp.ges
          console.error(
            `MEI element ${breath.toXML()} is not associated with a note or chord. If its 'tstamp.ges' or 'tstamp' does not coincide with a note it will have no effect on the music!`,
          );
          const tstamp = att.getValue();

          // make sure there is a styleDef in MPM for articulation definitions
          let articulationStyle = globalHeader(ctx).getStyleDef(
            Mpm.ARTICULATION_STYLE,
            'MEI export',
          ) as ArticulationStyle | null;
          if (articulationStyle === null) {
            articulationStyle = globalHeader(ctx).addStyleDef(
              Mpm.ARTICULATION_STYLE,
              'MEI export',
            ) as ArticulationStyle;
            articulationStyle.getDef('defaultArticulation');
          }

          // find or generate the required articulationMaps
          let articulationMap: ArticulationMap | null;
          att = breath.getAttribute('part');
          if (att === null) att = breath.getAttribute('staff');
          if (att === null || att.getValue() === '' || att.getValue() === '%all') {
            articulationMap = globalDated(ctx).getMap(
              Mpm.ARTICULATION_MAP,
            ) as ArticulationMap | null;
            if (articulationMap === null) {
              articulationMap = globalDated(ctx).addMap(
                ArticulationMap.createArticulationMap(),
              ) as ArticulationMap;
              articulationMap.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
            }
            const date = this.tstampToTicks(tstamp, ctx.part, ctx);
            this.addArticulationToMap(
              date,
              'breath',
              xmlid,
              null,
              articulationMap,
              articulationStyle,
            );
          } else {
            const staffs = att.getValue().split(/\s+/);
            let multiIds = false;

            for (const staff of staffs) {
              const mpmPart = requirePerformance(ctx).getPart(parseInt(staff));
              if (mpmPart === null) continue;

              articulationMap = mpmDated(mpmPart).getMap(
                Mpm.ARTICULATION_MAP,
              ) as ArticulationMap | null;
              if (articulationMap === null) {
                articulationMap = mpmDated(mpmPart).addMap(
                  ArticulationMap.createArticulationMap(),
                ) as ArticulationMap;
                articulationMap.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
              }

              // find corresponding MSM part
              let msmPart: Element | null = null;
              const parts = requireMovement(ctx).msm.getChildElements('part');
              for (let p = 0; p < parts.size(); ++p) {
                if (parts.get(p).getAttributeValue('number') === staff) {
                  msmPart = parts.get(p);
                  break;
                }
              }

              const date = this.tstampToTicks(tstamp, msmPart, ctx);
              this.addArticulationToMap(
                date,
                'breath',
                xmlid === null ? null : multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
                null,
                articulationMap,
                articulationStyle,
              );
              multiIds = true;
            }
          }
          return;
        }
      }
    }
    prevs = att.getValue().trim().replace(/#/g, '').split(/\s+/);

    // create breath articulations in MEI and add them to the notes/chords indicated by their ids
    let multiIds = false;
    for (const prev of prevs) {
      const note = this.allNotesAndChords.get(prev);
      if (note !== undefined) {
        const articElem = new Element('artic');
        articElem.addAttribute(new Attribute('artic.ges', 'breath'));
        if (xmlid !== null) {
          articElem.addAttribute(
            new Attribute(
              'xml:id',
              'http://www.w3.org/XML/1998/namespace',
              multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
            ),
          );
          multiIds = true;
        }
        note.appendChild(articElem);
      }
    }
  }

  private processTie(tie: Element, ctx: WalkContext): void {
    const startid = tie.getAttributeValue('startid');
    if (ctx.measure === null || startid === null || tie.getAttribute('endid') === null) return;

    let note = this.allNotesAndChords.get(startid.trim().replace(/#/g, ''));
    if (note !== undefined) {
      const a = note.getAttribute('tie');
      if (a !== null) {
        if (a.getValue() === 't') a.setValue('m');
        else if (a.getValue() === 'n') a.setValue('i');
      } else {
        note.addAttribute(new Attribute('tie', 'i'));
      }
    }

    note = this.allNotesAndChords.get(requireAttributeValue('endid', tie).trim().replace(/#/g, ''));
    if (note !== undefined) {
      const a = note.getAttribute('tie');
      if (a !== null) {
        if (a.getValue() === 'i') a.setValue('m');
        else if (a.getValue() === 'n') a.setValue('t');
      } else {
        note.addAttribute(new Attribute('tie', 't'));
      }
    }
  }

  /**
   * Convert a `slur` into the `slur` entries the articulation pass later reads.
   *
   * Three routes, in Java's order:
   *
   * 1. **`plist`** — the slur names its notes explicitly. They are marked directly, `im`
   *    ("in the middle") on all but the last, `t` (terminal) on the last, and no miscMap
   *    entry is produced at all. The bow's final note is deliberately excluded from the
   *    `im` run: it ends the legato rather than continuing it.
   * 2. **local** — the slur carries `part` or `staff`, so it belongs to specific staffs.
   *    One entry per named staff, in that staff's part `miscMap`. A staff number matching
   *    no MSM part contributes nothing, which is how a dangling reference is dropped.
   * 3. **global** — no association, or `%all`: one entry in the global `miscMap`.
   *
   * Before routing, a slur with both `startid` and `endid` gets its `staff` and then its
   * `layer` filled in from those endpoints when both sit in the same one — so a slur
   * written without an explicit association still stays inside its voice.
   *
   * The `xml:id` is copied to the first entry only; every further one gets
   * `<id>_meico_<uuid>`, since ids must stay unique across the document. That draws a UUID
   * per extra entry and is therefore on the order-sensitive path ({@link addUUID}).
   */
  private processSlur(slur: Element, ctx: WalkContext): void {
    if (ctx.measure === null)
      // we process slurs only when they are in a measure environment
      return;

    const id = attribute('id', slur);
    const xmlid = id !== null ? id.getValue() : null;

    // if a plist attribute names all affected notes/chords, mark them directly
    const plistAtt = slur.getAttribute('plist');
    if (plistAtt !== null) {
      const startidAtt = slur.getAttribute('startid');
      if (startidAtt !== null) {
        const startid = startidAtt.getValue();
        if (!plistAtt.getValue().includes(startid))
          plistAtt.setValue(`${startid} ${plistAtt.getValue()}`);
      }

      const endidAtt = slur.getAttribute('endid');
      if (endidAtt !== null) {
        const endid = endidAtt.getValue();
        if (!plistAtt.getValue().includes(endid))
          plistAtt.setValue(`${plistAtt.getValue()} ${endid}`);
      }

      const plist = plistAtt.getValue().trim().replace(/#/g, '').split(/\s+/);
      let multiIds = false;

      // All but the last: the end of the legato bow is not played legato. Java counts down
      // from `length - 2`, and the direction is load-bearing — the ids drawn below are
      // canonicalised by first occurrence, so a forwards walk would move fixture bytes.
      // Hence the copy is reversed rather than the walk; `slice(0, -1)` of a one- or
      // zero-element list is empty, which is the loop that did not run.
      for (const ref of plist.slice(0, -1).reverse()) {
        const note = this.allNotesAndChords.get(ref);
        if (note !== undefined) {
          note.addAttribute(new Attribute('slur', 'im'));
          if (xmlid !== null) {
            note.addAttribute(
              new Attribute(
                'xml:id',
                'http://www.w3.org/XML/1998/namespace',
                multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
              ),
            );
            multiIds = true;
          }
        }
      }

      if (plist.length > 2) {
        const note = this.allNotesAndChords.get(
          elementAt(plist, plist.length - 1, "a slur's plist"),
        );
        if (note !== undefined) {
          note.addAttribute(new Attribute('slur', 't'));
          if (xmlid !== null) {
            note.addAttribute(
              new Attribute(
                'xml:id',
                'http://www.w3.org/XML/1998/namespace',
                multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
              ),
            );
          }
        }
      }
      return;
    }

    const timingData = this.computeControlEventTiming(slur, ctx.part, ctx);
    if (timingData === null)
      // the event has been repositioned in accordance to a startid attribute
      return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];
    const startid = slur.getAttribute('startid');

    // check whether startid and endid are in the same staff and layer
    let layerId = '';
    if (startid !== null && endid !== null) {
      if (slur.getAttribute('staff') === null) {
        const staffId = this.isSameStaff(startid.getValue(), endid.getValue());
        if (staffId !== '') slur.addAttribute(new Attribute('staff', staffId));
      }
      // looking for the layer makes only sense if we are in a specific staff
      if (slur.getAttribute('staff') !== null && slur.getAttribute('layer') === null) {
        layerId = this.isSameLayerInstance(startid.getValue(), endid.getValue());
        if (layerId !== '') slur.addAttribute(new Attribute('layer', layerId));
      }
    }

    // MEI 4.0's part attribute wins over staff
    // (https://github.com/music-encoding/music-encoding/issues/435)
    let att = slur.getAttribute('part');
    if (att === null) att = slur.getAttribute('staff');

    // Both branches below append attributes in Java's order. The serialized attribute
    // sequence is the fixture bytes, so it is a contract, not a detail.
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      // no part or staff association: a global instruction
      const slurMisc = new Element('slur');
      slurMisc.addAttribute(new Attribute('date', String(date)));
      copyId(slur, slurMisc);

      if (endid !== null) {
        slurMisc.addAttribute(new Attribute('endid', endid.getValue()));
        this.endids.push(slurMisc);
      }

      if (endDate !== null) slurMisc.addAttribute(new Attribute('date.end', String(endDate)));

      if (tstamp2 !== null) {
        slurMisc.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(slurMisc);
      }

      addToMap(slurMisc, requireGlobalDatedMap(ctx, 'miscMap'));
      return;
    }

    // there are staffs, hence a local slur
    const staffs = att.getValue().split(/\s+/);
    const parts = requireMovement(ctx).msm.getChildElements('part');
    let multiIds = false;

    for (const staff of staffs) {
      for (let p = 0; p < parts.size(); ++p) {
        const part = parts.get(p);
        if (part.getAttributeValue('number') !== staff) continue;

        const slurMisc = new Element('slur');
        slurMisc.addAttribute(new Attribute('date', String(date)));

        if (xmlid !== null) {
          slurMisc.addAttribute(
            new Attribute(
              'xml:id',
              'http://www.w3.org/XML/1998/namespace',
              multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
            ),
          );
          multiIds = true;
        }

        slurMisc.addAttribute(new Attribute('staff', staff));

        if (layerId !== '') slurMisc.addAttribute(new Attribute('layer', layerId));

        if (endid !== null) {
          slurMisc.addAttribute(new Attribute('endid', endid.getValue()));
          this.endids.push(slurMisc);
        }

        if (endDate !== null) slurMisc.addAttribute(new Attribute('date.end', String(endDate)));

        if (tstamp2 !== null) {
          slurMisc.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
          this.tstamp2s.push(slurMisc);
        }

        addToMap(slurMisc, requireDatedMap(part, 'miscMap'));
      }
    }
  }

  private processReh(reh: Element, ctx: WalkContext): void {
    let markerMap =
      ctx.part === null
        ? null
        : (ctx.part.getFirstChildElement('dated')?.getFirstChildElement('markerMap') ?? null);
    if (markerMap === null)
      markerMap =
        ctx.movement === null
          ? null
          : (ctx.movement.msm
              .getFirstChildElement('global')
              ?.getFirstChildElement('dated')
              ?.getFirstChildElement('markerMap') ?? null);
    if (markerMap === null) return;

    const marker = new Element('marker');
    copyId(reh, marker);
    marker.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
    marker.addAttribute(new Attribute('message', reh.getValue()));
    this.addLayerAttribute(marker, ctx);
    addToMap(marker, markerMap);
  }

  private processBeatRpt(_beatRpt: Element, ctx: WalkContext): void {
    let es = requirePartDatedMap(ctx, 'timeSignatureMap').getChildElements('timeSignature');
    if (es.size() === 0) {
      es = requireGlobalDatedMap(ctx, 'timeSignatureMap').getChildElements('timeSignature');
    }
    let beatLength =
      es.size() === 0 ? 4 : parseFloat(requireAttributeValue('denominator', es.get(es.size() - 1)));
    beatLength = (4.0 * this.ppq) / beatLength;
    this.processRepeat(beatLength, ctx);
  }

  private processMRpt(_mRpt: Element, ctx: WalkContext): void {
    this.processRepeat(this.getOneMeasureLength(ctx.part, ctx), ctx);
  }

  private processMRpt2(_mRpt2: Element, ctx: WalkContext): void {
    const timeframe = this.getOneMeasureLength(ctx.part, ctx);
    // Simplified -- full implementation handles time signature changes across measures
    this.processRepeat(timeframe, ctx);
  }

  private processMultiRpt(multiRpt: Element, ctx: WalkContext): void {
    // Simplified -- full implementation handles time signature changes
    const num = multiRpt.getAttributeValue('num');
    const numMeasures = num === null ? 1 : parseInt(num);
    const measureLength = this.getOneMeasureLength(ctx.part, ctx);
    this.processRepeat(measureLength * numMeasures, ctx);
  }

  private processHalfmRpt(_halfmRpt: Element, ctx: WalkContext): void {
    this.processRepeat(0.5 * this.getOneMeasureLength(ctx.part, ctx), ctx);
  }

  /**
   * Replay the last `timeframe` ticks of the current part by copying its score entries
   * forward. This is what `mRpt`, `mRpt2`, `multiRpt`, `beatRpt` and `halfmRpt` all reduce
   * to — MEI's "repeat what just happened" shorthands, expanded eagerly rather than
   * expressed as sequencing.
   *
   * The backwards scan stops at the first entry older than `startDate`, which relies on the
   * score map being date-ordered ({@link addToMap}'s invariant). Copies are built
   * with `unshift`, so `els` ends up in forward order and the re-insertion preserves the
   * original sequence. Each copy's id is rewritten to `meico_repeats_<old>_<uuid>` — one
   * UUID per copied element, on the order-sensitive path.
   *
   * Layer filtering here is *inverted* relative to {@link isSameLayer}: an empty current
   * layer copies everything, otherwise only entries whose `layer` matches exactly.
   */
  private processRepeat(timeframe: number, ctx: WalkContext): void {
    if (ctx.part === null || requirePartDatedMap(ctx, 'score').getChildElements().size() === 0) {
      return;
    }

    const currentDate = parseFloat(partClock(ctx.part).getValue());
    const startDate = currentDate - timeframe;
    const layer = Mei.getLayerId(ctx.layer);
    const els: Element[] = [];

    const scoreChildren = requirePartDatedMap(ctx, 'score').getChildElements();
    for (let idx = scoreChildren.size() - 1; idx >= 0; --idx) {
      const e = scoreChildren.get(idx);
      const date = parseFloat(requireAttributeValue('date', e));
      if (date < startDate) break;
      if (
        layer === '' ||
        (e.getAttribute('layer') !== null && e.getAttributeValue('layer') === layer)
      ) {
        const copy = cloneElement(e);
        requireAttribute('date', copy).setValue(String(date + timeframe));
        const idCopy = attribute('id', copy);
        if (idCopy !== null) idCopy.setValue(`meico_repeats_${idCopy.getValue()}_${uuidv4()}`);
        els.unshift(copy);
      }
    }

    for (const el of els) {
      addToMap(el, partDatedMap(ctx, 'score'));
    }

    partClock(ctx.part).setValue(String(currentDate + timeframe));
  }

  private processMeasureRest(mRest: Element, ctx: WalkContext): void {
    if (ctx.part === null) return;
    const rest = this.makeMeasureRest(mRest, ctx);
    if (rest === null) return;
    addToMap(rest, partDatedMap(ctx, 'score'));
    advancePartClock(ctx.part, parseFloat(requireAttributeValue('duration', rest)));
  }

  private makeMeasureRest(meiMRest: Element, ctx: WalkContext): Element | null {
    const rest = new Element('rest');
    copyId(meiMRest, rest);
    let dur = 0.0;

    if (
      ctx.part !== null &&
      requirePartDatedMap(ctx, 'timeSignatureMap').getFirstChildElement('timeSignature') !== null
    ) {
      const es = requirePartDatedMap(ctx, 'timeSignatureMap').getChildElements('timeSignature');
      dur =
        (4.0 * this.ppq * parseFloat(requireAttributeValue('numerator', es.get(es.size() - 1)))) /
        parseFloat(requireAttributeValue('denominator', es.get(es.size() - 1)));
    } else if (
      requireGlobalDatedMap(ctx, 'timeSignatureMap').getFirstChildElement('timeSignature') !== null
    ) {
      const es = requireGlobalDatedMap(ctx, 'timeSignatureMap').getChildElements('timeSignature');
      dur =
        (4.0 * this.ppq * parseFloat(requireAttributeValue('numerator', es.get(es.size() - 1)))) /
        parseFloat(requireAttributeValue('denominator', es.get(es.size() - 1)));
    }
    if (dur === 0.0) return null;

    rest.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
    rest.addAttribute(new Attribute('duration', String(dur)));
    this.addLayerAttribute(rest, ctx);
    return rest;
  }

  private processMultiRest(multiRest: Element, ctx: WalkContext): void {
    if (ctx.part === null) return;
    const rest = this.makeMeasureRest(multiRest, ctx);
    if (rest === null) return;
    rest.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
    addToMap(rest, partDatedMap(ctx, 'score'));
    const numValue = multiRest.getAttributeValue('num');
    const num = numValue === null ? 1 : parseInt(numValue);
    // The rest's own `duration`, read through one handle: `makeMeasureRest` always writes it,
    // and it is both multiplied in place here and added to the part's clock below.
    const duration = requireAttribute('duration', rest);
    if (num > 1) duration.setValue(String(parseFloat(duration.getValue()) * num));
    advancePartClock(ctx.part, parseFloat(duration.getValue()));
  }

  private processRest(rest: Element, ctx: WalkContext): void {
    const s = new Element('rest');
    copyId(rest, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));
    const dur = this.computeDuration(rest, ctx);
    if (dur === 0.0) return;
    s.addAttribute(new Attribute('duration', String(dur)));
    this.addLayerAttribute(s, ctx);
    advancePartClock(requirePart(ctx), dur);
    addToMap(s, partDatedMap(ctx, 'score'));
    rest.addAttribute(new Attribute('date', requireAttributeValue('date', s)));
    rest.addAttribute(new Attribute('midi.dur', requireAttributeValue('duration', s)));
  }

  private processSpace(space: Element, ctx: WalkContext): void {
    for (
      let parent: Element | null = space.getParent();
      parent !== null;
      parent = parent.getParent()
    ) {
      switch (parent.getLocalName()) {
        case 'refrain':
        case 'syllable':
        case 'verse':
        case 'volta':
          return;
      }
      if (
        parent.getLocalName() === 'layer' ||
        parent.getLocalName() === 'measure' ||
        parent.getLocalName() === 'section' ||
        parent.getLocalName() === 'score' ||
        parent.getLocalName() === 'mdiv' ||
        parent.getLocalName() === 'body'
      )
        break;
    }
    this.processRest(space, ctx);
  }

  private processOctave(octave: Element, ctx: WalkContext): void {
    if (octave.getAttribute('dis') === null || octave.getAttribute('dis.place') === null) {
      console.error(
        `Cannot process MEI element ${octave.toXML()}. Missing attribute 'dis' or 'dis.place'.`,
      );
      return;
    }

    let result: number;
    switch (octave.getAttributeValue('dis')) {
      case '8':
        result = 12.0;
        break;
      case '15':
        result = 24.0;
        break;
      case '22':
        result = 36.0;
        break;
      // `getAttributeValue` is `string | null`, and the guard above has already returned for a
      // missing `@dis` — so null is unreachable here. Named alongside the default rather than
      // folded into it, because the reason it cannot happen lives eight lines up and this is
      // where a reader asks.
      case null:
      default:
        console.error(
          `An invalid octave transposition occured (dis=${octave.getAttributeValue('dis')}).`,
        );
        return;
    }

    if (octave.getAttributeValue('dis.place') === 'below') {
      result = -result;
    } else if (octave.getAttributeValue('dis.place') !== 'above') {
      console.error(
        `An invalid octave transposition occured (dis.place=${octave.getAttributeValue('dis.place')}).`,
      );
      return;
    }

    const timingData = this.computeControlEventTiming(octave, ctx.part, ctx);
    if (timingData === null) return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    let att = octave.getAttribute('part');
    if (att === null) att = octave.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      const trans = new Element('addTransposition');
      trans.addAttribute(new Attribute('date', String(date)));
      trans.addAttribute(new Attribute('semi', String(result)));
      copyId(octave, trans);
      if (endDate !== null) {
        trans.addAttribute(new Attribute('date.end', String(endDate)));
      } else if (tstamp2 !== null) {
        trans.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(trans);
      } else if (endid !== null) {
        trans.addAttribute(new Attribute('endid', endid.getValue()));
        this.endids.push(trans);
      }
      const miscMap = requireGlobalDatedMap(ctx, 'miscMap');
      addToMap(trans, miscMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      let multiIDs = false;
      const parts = requireMovement(ctx).msm.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const trans = new Element('addTransposition');
          trans.addAttribute(new Attribute('date', String(date)));
          trans.addAttribute(new Attribute('semi', String(result)));
          copyId(octave, trans);
          const transId = trans.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (transId !== null)
            transId.setValue(transId.getValue() + (multiIDs ? `_meico_${uuidv4()}` : ''));
          if (endDate !== null) {
            trans.addAttribute(new Attribute('date.end', String(endDate)));
          } else if (tstamp2 !== null) {
            trans.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
            this.tstamp2s.push(trans);
          } else if (endid !== null) {
            trans.addAttribute(new Attribute('endid', endid.getValue()));
            this.endids.push(trans);
          }
          const miscMap = requireDatedMap(parts.get(p), 'miscMap');
          addToMap(trans, miscMap);
          this.addLayerAttribute(trans, ctx);
          multiIDs = true;
        }
      }
    }
  }

  private processPedal(pedal: Element, ctx: WalkContext): void {
    if (pedal.getAttribute('dir') === null) {
      console.error(`Cannot process MEI element ${pedal.toXML()}. Missing attribute 'dir'.`);
      return;
    }
    const timingData = this.computeControlEventTiming(pedal, ctx.part, ctx);
    if (timingData === null) return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    let att = pedal.getAttribute('part');
    if (att === null) att = pedal.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      const pedalMapEntry = new Element('pedal');
      pedalMapEntry.addAttribute(new Attribute('date', String(date)));
      pedalMapEntry.addAttribute(new Attribute('state', requireAttributeValue('dir', pedal)));
      copyId(pedal, pedalMapEntry);
      if (endDate !== null) {
        pedalMapEntry.addAttribute(new Attribute('date.end', String(endDate)));
      } else if (tstamp2 !== null) {
        pedalMapEntry.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(pedalMapEntry);
      } else if (endid !== null) {
        pedalMapEntry.addAttribute(new Attribute('endid', endid.getValue()));
        this.endids.push(pedalMapEntry);
      }
      const pedalMap = requireGlobalDatedMap(ctx, 'pedalMap');
      addToMap(pedalMapEntry, pedalMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      let multiIDs = false;
      const parts = requireMovement(ctx).msm.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const pedalMapEntry = new Element('pedal');
          pedalMapEntry.addAttribute(new Attribute('date', String(date)));
          pedalMapEntry.addAttribute(new Attribute('state', requireAttributeValue('dir', pedal)));
          copyId(pedal, pedalMapEntry);
          const pId = pedalMapEntry.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (pId !== null) pId.setValue(pId.getValue() + (multiIDs ? `_meico_${uuidv4()}` : ''));
          if (endDate !== null) {
            pedalMapEntry.addAttribute(new Attribute('date.end', String(endDate)));
          } else if (tstamp2 !== null) {
            pedalMapEntry.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
            this.tstamp2s.push(pedalMapEntry);
          } else if (endid !== null) {
            pedalMapEntry.addAttribute(new Attribute('endid', endid.getValue()));
            this.endids.push(pedalMapEntry);
          }
          const pedalMap = requireDatedMap(parts.get(p), 'pedalMap');
          addToMap(pedalMapEntry, pedalMap);
          this.addLayerAttribute(pedalMapEntry, ctx);
          multiIDs = true;
        }
      }
    }
  }

  /**
   * Convert one MEI `note` into an MSM `note`, the innermost step of the whole conversion.
   *
   * Order of operations, all of which matter:
   * 1. give the note an id if its chord has articulations, since those reference notes by
   *    id and an anonymous note could not be addressed;
   * 2. descend into the note first ({@link convertElement}) — an `accid` or `artic` child
   *    must be seen *before* the pitch and articulation are computed;
   * 3. {@link checkSlurs} then {@link processArtic}, in that order, so articulation can see
   *    the slur state;
   * 4. compute pitch, bail out at -1 (unpitched: the MSM note is discarded), then duration;
   * 5. advance the part clock **only when not inside a chord** — chord members all start
   *    together, and the chord itself moves the clock once;
   * 6. write `pnum`, `date` and `midi.dur` back onto the *MEI* element as well, because
   *    later references (arpeggio ordering, `startid` lookups) read them from there.
   *
   * Ties are resolved by first character of `tie` (`i`nitial / `m`edial / `t`erminal),
   * inherited from the chord when the note has none: an initial tie marks the MSM note,
   * while medial and terminal ties reach back into the part's score map to extend the note
   * that was tied from, rather than emitting a second note.
   */
  private processNote(note: Element, ctx: WalkContext): void {
    if (ctx.part === null) return;

    if (
      ctx.chord !== null &&
      ctx.chord.getAttribute('hasArticulations') !== null &&
      attribute('id', note) === null
    ) {
      note.addAttribute(
        new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', `meico_${uuidv4()}`),
      );
    }

    this.convertElement(note, ctx);
    this.checkSlurs(note, ctx);
    this.processArtic(note, ctx);

    const date = this.getMidiTime(ctx);
    const s = new Element('note');
    copyId(note, s);
    s.addAttribute(new Attribute('date', String(date)));

    const pitchdata: string[] = [];
    const pitch = this.computePitch(note, pitchdata, ctx);
    if (pitch === -1) return;
    s.addAttribute(new Attribute('midi.pitch', String(pitch)));
    // `computePitch` reports the pitch through its return value and the *spelling* — name,
    // accidental, octave — by appending three strings to `pitchdata`. It appends all three or
    // none: the only early return is the `-1` handled on the line above. The three reads are
    // therefore in range by construction, and `elementAt` is what says so — a spelling that
    // silently defaulted to `''` would become a note with an empty pitch name that no
    // downstream stage could tell from a real one.
    const what = "computePitch's [pitchname, accidental, octave]";
    s.addAttribute(new Attribute('pitchname', elementAt(pitchdata, 0, what)));
    s.addAttribute(new Attribute('accidentals', elementAt(pitchdata, 1, what)));
    s.addAttribute(new Attribute('octave', elementAt(pitchdata, 2, what)));

    if (note.getAttribute('accid') !== null) {
      this.accid.push(note);
    }

    const dur = this.computeDuration(note, ctx);
    s.addAttribute(new Attribute('duration', String(dur)));

    if (ctx.chord === null) partClock(ctx.part).setValue(String(date + dur));

    note.addAttribute(new Attribute('pnum', String(pitch)));
    note.addAttribute(new Attribute('date', String(date)));
    note.addAttribute(new Attribute('midi.dur', String(dur)));

    // handle ties
    let tie = 'n';
    // the note's own `@tie`, else the enclosing chord's — {@link firstPresent} is that
    // preference, and `charAt(0)` of a present value is what both branches did
    const tieValue = firstPresent(
      note.getAttributeValue('tie'),
      mapPresent(ctx.chord, (chord) => chord.getAttributeValue('tie')),
    );
    if (tieValue !== null) tie = tieValue.charAt(0);
    switch (tie) {
      case 'n':
        break;
      case 'i':
        s.addAttribute(new Attribute('tie', 'true'));
        break;
      case 'm':
      case 't': {
        // The note this tie continues, looked for from the end of the part's score
        // backwards — the first one at the same pitch that ends exactly where this one
        // starts. This was `query("descendant::*[local-name()='note' and @tie]")` over the
        // whole accumulated score, evaluated once per tied note: a serialise, re-parse and
        // document-order sort of everything converted so far, per tie. The synthetic
        // benchmark scores have no ties, so it never showed in a profile, but on a
        // tie-heavy piece it is the same quadratic the whole-document queries were.
        // {@link reverseDescendantElements} yields the same elements in the same
        // back-to-front order this loop already read them in, and stops when the loop does
        // — which for a tie whose partner is the note just before it is immediately.
        // `.find` on the generator, not a `for..of` with a `break`. The iterator helpers
        // (ES2025) are what make that legal: before them, every array method meant
        // materialising the sequence first, which is the exact cost the generator above
        // exists to avoid — so a lazy walk had to be consumed by a hand-written loop. `find`
        // pulls one element at a time and stops pulling at the first hit, so the walk is as
        // short as the `break` made it, and "which note is the tie partner" is now separate
        // from "what to do with it".
        const partner = reverseDescendantElements(
          requirePartDatedMap(ctx, 'score'),
          (element) => element.getLocalName() === 'note' && element.getAttribute('tie') !== null,
        ).find(
          (p) =>
            p.getAttributeValue('midi.pitch') === s.getAttributeValue('midi.pitch') &&
            parseFloat(requireAttributeValue('date', p)) +
              parseFloat(requireAttributeValue('duration', p)) ===
              date,
        );
        if (partner !== undefined) {
          partner.addAttribute(
            new Attribute(
              'duration',
              String(parseFloat(requireAttributeValue('duration', partner)) + dur),
            ),
          );
          if (tie === 't') partner.removeAttribute(requireAttribute('tie', partner));
          return;
        }
      }
    }

    // handle lyrics
    for (const lyricsElem of this.lyrics) {
      s.appendChild(lyricsElem);
    }
    this.lyrics = [];

    this.addLayerAttribute(s, ctx);
    addToMap(s, partDatedMap(ctx, 'score'));
  }

  /**
   * Clear the per-movement state. Called by {@link makeMovement} *before* it installs the
   * new cursor, so a movement never inherits the previous one's accidentals, open spans or
   * note index. {@link ppq}, {@link dontUseChannel10}, {@link movements} and
   * {@link performances} deliberately survive — they belong to the conversion, not to a
   * movement.
   *
   * **{@link arpeggiosToSort} was missing from this list, and that was a bug.** The field is
   * drained at the end of {@link makeMovement} but was never emptied, so the second `mdiv` of
   * a document re-ran the first one's arpeggios: the parked `note.order` attributes still
   * pointed at the *previous* movement's MPM ornaments, while the note ids they name were
   * looked up in an {@link allNotesAndChords} that `reset` had just cleared and refilled from
   * the new mdiv. Every lookup missed, the sort produced an empty list, and the empty string
   * was written over a finished movement's note order. No fixture could see it — all sixteen
   * hold exactly one `mdiv` — so the proof is
   * `tests/mei/Mei2MsmMpmConverter.test.ts`'s "clears the parked arpeggios", which fails
   * without the line below.
   *
   * **Eight lines are also gone from here**, and none of them had to be replaced: the four
   * walk cursors and the four movement fields are {@link WalkContext} and
   * {@link MovementContext} now, both built per movement from {@link NOTHING_OPEN}. What is
   * left is exactly the accumulators — the deferred lists, the note index and
   * {@link endingCounter} — which is a much easier list to keep honest than "everything the
   * previous movement might have touched".
   *
   * Two of the remaining lines are belt-and-braces, and it is worth saying which, because a
   * later reader running the same controls will find them green:
   * - `allNotesAndChords.clear()` is redundant — {@link indexNotesAndChords}, which
   *   `makeMovement` calls immediately after this, clears the map before filling it;
   * - `accid = []` cannot matter across movements — {@link processMeasure},
   *   {@link processLayer}, {@link processStaff} and {@link processStaffDef} each clear it on
   *   the way out, and all music is inside a measure, so it is always empty here.
   *
   * The other five are load-bearing and each has a test: `endingCounter`, `endids`,
   * `tstamp2s`, `arpeggiosToSort` in `tests/mei/Mei2MsmMpmConverter.test.ts`, and `lyrics`
   * — the exception, still unpinned: the queue is filled and drained inside a single
   * {@link processNote}, so a leak needs the tie-merge path that returns before the drain,
   * and no test constructs one.
   */
  protected reset(): void {
    this.endingCounter = 0;
    this.accid = [];
    this.endids = [];
    this.tstamp2s = [];
    this.lyrics = [];
    this.arpeggiosToSort = [];
    this.allNotesAndChords.clear();
  }

  /**
   * Build the id → element index that `startid`, `endid` and `plist` references resolve
   * against. Only `note` and `chord` elements *with an `xml:id`* are indexed: an element
   * without one cannot be referenced, so it cannot be a target.
   *
   * Run once per movement, before the walk, because MEI references point forward as
   * readily as backward — {@link computeControlEventTiming} depends on being able to find
   * a note that the traversal has not reached yet.
   *
   * The `descendant::` expression this used to hand to {@link Element.query} matches once
   * per note, so the node set is the size of the movement, and XPath sorts a node set into
   * document order with an AVL insert per hit under xmldom's `compareDocumentPosition`,
   * which walks both ancestor chains every time. That sort alone was 21% of a conversion
   * of a 2000-note score. The walk below is the same axis and the same pre-order, which
   * has to stay that way: the index is last-one-wins, so two elements sharing an `xml:id`
   * resolve to whichever comes later in the document, exactly as before.
   */
  public indexNotesAndChords(mdiv: Element): void {
    this.allNotesAndChords.clear();
    const nodes = descendantElements(mdiv, (element) => {
      const name = element.getLocalName();
      return (
        (name === 'note' || name === 'chord') &&
        element.getAttribute('id', 'http://www.w3.org/XML/1998/namespace') !== null
      );
    });
    for (const node of nodes) {
      this.allNotesAndChords.set(getAttributeValue('id', node), node);
    }
  }

  /**
   * "What tick are we at?" — the clock the whole conversion writes dates from.
   *
   * There is no single counter. The answer is taken from the innermost context that has
   * one, in this order: the MSM part being filled (its `currentDate`, which
   * {@link processNote} and friends advance), else the current measure's start date, else
   * the latest `currentDate` across all parts of the movement, else 0. The fallback chain
   * is what lets global events (a `scoreDef`, a `tempo` outside any staff) get a sensible
   * date without a part context.
   *
   * {@link getMidiTimeAsString} is the same decision returning the attribute's *string*.
   * It is not `String(getMidiTime())`: for the first two cases it hands back the stored
   * text verbatim, so `"0.0"` stays `"0.0"` instead of becoming `"0"`. MSM attribute text
   * is byte-compared against the Java reference, so the two must stay separate.
   */
  protected getMidiTime(ctx: WalkContext): number {
    if (ctx.part !== null) return parseFloat(partClock(ctx.part).getValue());
    if (ctx.measure !== null) return parseFloat(requireAttributeValue('date', ctx.measure));
    if (ctx.movement === null) return 0.0;

    const parts = ctx.movement.msm.getChildElements('part');
    let latestDate = 0.0;
    for (let i = parts.size() - 1; i >= 0; --i) {
      const date = parseFloat(partClock(parts.get(i)).getValue());
      if (latestDate < date) latestDate = date;
    }
    return latestDate;
  }

  protected getMidiTimeAsString(ctx: WalkContext): string {
    if (ctx.part !== null) return partClock(ctx.part).getValue();
    if (ctx.measure !== null) return requireAttributeValue('date', ctx.measure);
    if (ctx.movement === null) return '0.0';

    const parts = ctx.movement.msm.getChildElements('part');
    let latestDate = 0.0;
    for (let i = parts.size() - 1; i >= 0; --i) {
      const date = parseFloat(partClock(parts.get(i)).getValue());
      if (latestDate < date) latestDate = date;
    }
    return String(latestDate);
  }

  /** one measure in ticks under the time signature in force; `4 * ppq` is a whole note */
  protected getOneMeasureLength(msmPartContext: Element | null, ctx: WalkContext): number {
    const [numerator, denominator] = this.getCurrentTimeSignature(msmPartContext, ctx);
    return (4.0 * this.ppq * numerator) / denominator;
  }

  /**
   * The time signature in force, as `[numerator, denominator]`, resolved in this order:
   * the part's own `timeSignatureMap`, else the global one, else a `meter` element on the
   * `work` in `meiHead`, else 4/4.
   *
   * "In force" means the **last** entry of the map, not the last one at or before the
   * current date — the maps are built in document order as the walk proceeds, so their
   * final entry is the most recent one seen. That holds only while the conversion is
   * running forward through the score, which is why this is not a general lookup.
   *
   * The return type is a **pair**, not a `number[]`. Every one of the three paths below
   * returns exactly two numbers and every caller reads exactly `[0]` and `[1]`, so saying so
   * in the type is what lets those callers destructure by name instead of indexing into a
   * length the type had forgotten.
   */
  protected getCurrentTimeSignature(
    msmPartContext: Element | null,
    ctx: WalkContext,
  ): readonly [number, number] {
    let es: Elements | null = null;
    if (msmPartContext !== null)
      es = requireDatedMap(msmPartContext, 'timeSignatureMap').getChildElements();
    if (es === null || es.size() === 0)
      es = requireGlobalDatedMap(ctx, 'timeSignatureMap').getChildElements();
    const work = ctx.movement === null ? null : ctx.movement.work;
    if (es.size() === 0 && work !== null) {
      const meter = work.getFirstChildElement('meter');
      if (meter !== null) {
        const count = meter.getAttribute('count');
        const unit = meter.getAttribute('unit');
        return [
          count === null ? 4.0 : parseFloat(count.getValue()),
          unit === null ? 4.0 : parseFloat(unit.getValue()),
        ];
      }
    }

    const denom =
      es.size() === 0
        ? 4.0
        : parseFloat(requireAttributeValue('denominator', es.get(es.size() - 1)));
    const num =
      es.size() === 0 ? 4.0 : parseFloat(requireAttributeValue('numerator', es.get(es.size() - 1)));

    return [num, denom];
  }

  protected computeMeasureLength(numerator: number, denominator: number): number {
    return (4.0 * this.ppq * numerator) / denominator;
  }

  protected getPart(id: string, ctx: WalkContext): Element | null {
    // The empty string is the miss this really screens for: `getAttributeValue` hands back
    // `''` for an absent attribute, and every caller here reads the id that way. Java's
    // `id == null` half had no counterpart once the parameter became a `string`.
    if (id === '') return null;
    const parts = requireMovement(ctx).msm.getChildElements('part');
    for (let i = parts.size() - 1; i >= 0; --i) {
      if (
        parts.get(i).getAttributeValue('number') === id ||
        getAttributeValue('id', parts.get(i)) === id
      )
        return parts.get(i);
    }
    return null;
  }

  protected addLayerAttribute(toThis: Element, ctx: WalkContext): void {
    const layer = ctx.layer;
    if (layer === null) return;
    // `@def` before `@n`, the same identity {@link Mei.getLayerId} builds
    const layerId = firstPresent(layer.getAttributeValue('def'), layer.getAttributeValue('n'));
    if (layerId !== null) toThis.addAttribute(new Attribute('layer', layerId));
  }

  public parseTempo(
    tempo: Element,
    msmPartContext: Element | null,
    ctx: WalkContext,
  ): TempoData | null {
    const tempoData = new TempoData();

    // determine numeric tempo if such a value is specified
    const mm = tempo.getAttribute('mm');
    if (mm !== null) tempoData.bpmString = mm.getValue();
    else {
      const midiBpm = tempo.getAttribute('midi.bpm');
      if (midiBpm !== null) tempoData.bpmString = midiBpm.getValue();
      else {
        const midiMspb = tempo.getAttribute('midi.mspb');
        if (midiMspb !== null)
          tempoData.bpmString = String(60000000.0 / parseFloat(midiMspb.getValue()));
      }
    }

    // compute beatLength
    const mmUnit = tempo.getAttribute('mm.unit');
    tempoData.beatLength =
      mmUnit !== null
        ? duration2decimal(mmUnit.getValue())
        : 1.0 / this.getCurrentTimeSignature(msmPartContext, ctx)[1];
    const mmDots = tempo.getAttribute('mm.dots');
    if (mmDots !== null) {
      let dots = parseInt(mmDots.getValue());
      for (let d = tempoData.beatLength; dots > 0; --dots) {
        d /= 2;
        tempoData.beatLength += d;
      }
    }

    // process tempo descriptor
    let descriptor = tempo.getValue();
    if (descriptor === '') {
      const label = tempo.getAttribute('label');
      if (label !== null) descriptor = label.getValue();
    }
    if (descriptor !== '') {
      if (
        descriptor.includes('rit') ||
        descriptor.includes('rall') ||
        descriptor.includes('largando') ||
        descriptor.includes('calando')
      ) {
        if (tempoData.bpmString === null) tempoData.bpmString = '?';
        tempoData.transitionToString = '-';
      } else if (descriptor.includes('accel') || descriptor.includes('string')) {
        if (tempoData.bpmString === null) tempoData.bpmString = '?';
        tempoData.transitionToString = '+';
      } else {
        // this instruction might be added to the global styleDef
        let tempoStyle = globalHeader(ctx).getStyleDef(
          Mpm.TEMPO_STYLE,
          'MEI export',
        ) as TempoStyle | null;
        if (tempoStyle === null)
          tempoStyle = globalHeader(ctx).addStyleDef(Mpm.TEMPO_STYLE, 'MEI export') as TempoStyle;

        if (tempoStyle.getDef(descriptor) === undefined) {
          const tempoDef =
            tempoData.bpmString === null
              ? TempoDef.createDefaultTempoDef(descriptor)
              : TempoDef.fromNameValue(descriptor, parseFloat(tempoData.bpmString));
          if (isOk(tempoDef)) tempoStyle.addDef(tempoDef.value);
        }
        tempoData.bpmString = descriptor;
      }
    }
    if (tempoData.bpmString === null) {
      console.error(
        `Cannot process MEI element ${tempo.toXML()}. No text or any of the attributes 'mm', 'midi.bpm', 'midi.mspb', or 'label' is specified.`,
      );
      return null;
    }

    if (tempoData.transitionToString !== null) tempoData.meanTempoAt = 0.5;

    const id = attribute('id', tempo);
    tempoData.xmlId = id === null ? null : id.getValue();

    return tempoData;
  }

  /**
   * The position of the first parked span whose `endid` is `id`, or `-1` — Java's contract.
   *
   * An index walk rather than the `findIndex` this obviously is, and measured: {@link checkEndid}
   * calls it for **every element of the score**, so the predicate closure would be one
   * allocation per element on the hottest path the converter has. `elementAt` is what keeps
   * the walk honest — `i` comes from the list's own length, so a miss is a defect here.
   */
  private getEndid(id: string): number {
    for (let i = 0; i < this.endids.length; ++i) {
      const parked = elementAt(this.endids, i, 'the parked endid worklist');
      if (parked.getAttributeValue('endid') === id) return i;
    }
    return -1;
  }

  /**
   * Close any parked span whose `endid` names `e`, called for every element the walk meets.
   *
   * The loop re-queries {@link getEndid} rather than iterating, because several parked
   * entries may name the same element and each is removed from {@link endids} as it is
   * resolved. Note the asymmetry in the end date: a `slur` ends *at* the onset of the
   * element it points to, everything else ends after that element has sounded — hence the
   * `+ computeDuration(e)` for all but slurs. That is what makes a slur's `date.end` line
   * up with the last note's start, which is what {@link checkSlurs} then compares against.
   */
  protected checkEndid(e: Element, ctx: WalkContext): void {
    const id = `#${getAttributeValue('id', e)}`;
    // `removeAt` takes the entry out of the worklist and hands it back, which is what lets
    // this stop indexing into a list it is mutating — and it is also why the `-1` from
    // `getEndid` is safe to pass straight in: `splice(-1, 1)` would remove the *last* entry,
    // so the bounds test lives inside the helper and answers null instead.
    for (
      let parked = removeAt(this.endids, this.getEndid(id));
      parked !== null;
      parked = removeAt(this.endids, this.getEndid(id))
    ) {
      parked.addAttribute(
        new Attribute(
          'date.end',
          String(
            this.getMidiTime(ctx) +
              (parked.getLocalName() === 'slur' ? 0.0 : this.computeDuration(e, ctx)),
          ),
        ),
      );
    }
  }

  /**
   * Mark note `e` with its slur state, reading the `slur` entries parked in the global and
   * part-local `miscMap`s.
   *
   * The value written is `'im'` — "inside my slur", i.e. legato continues past this note —
   * unless the note falls exactly on the slur's `date.end`, in which case it is `'t'` for
   * terminal and the method **returns immediately**, so a terminating slur wins over any
   * further slur that might also cover this note. Downstream, MPM's articulation rendering
   * reads these to decide where legato stops.
   *
   * Global slurs are checked first and part-local ones second, and the part-local pass
   * additionally filters by layer ({@link isSameLayer}) so a slur in one voice does not
   * bind notes in another. Both passes walk backwards, so the most recently opened slur is
   * considered first.
   */
  protected checkSlurs(e: Element, ctx: WalkContext): void {
    let slurs = requireGlobalDatedMap(ctx, 'miscMap').getChildElements('slur');

    for (let i = slurs.size() - 1; i >= 0; --i) {
      if (
        slurs.get(i).getAttributeValue('date') !== null &&
        parseFloat(requireAttributeValue('date', slurs.get(i))) > this.getMidiTime(ctx)
      )
        continue;
      if (slurs.get(i).getAttribute('date.end') !== null) {
        const endDate = parseFloat(requireAttributeValue('date.end', slurs.get(i)));
        if (endDate < this.getMidiTime(ctx)) continue;
        if (endDate === this.getMidiTime(ctx)) {
          e.addAttribute(new Attribute('slur', 't'));
          Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
          return;
        }
      }
      e.addAttribute(new Attribute('slur', 'im'));
      Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
    }

    if (ctx.part !== null) {
      const layerId = Mei.getLayerId(Mei.getLayer(e));
      slurs = requirePartDatedMap(ctx, 'miscMap').getChildElements('slur');

      for (let i = slurs.size() - 1; i >= 0; --i) {
        if (!Mei2MsmMpmConverter.isSameLayer(slurs.get(i), layerId)) continue;
        if (
          slurs.get(i).getAttributeValue('date') !== null &&
          parseFloat(requireAttributeValue('date', slurs.get(i))) > this.getMidiTime(ctx)
        )
          continue;
        if (slurs.get(i).getAttribute('date.end') !== null) {
          const endDate = parseFloat(requireAttributeValue('date.end', slurs.get(i)));
          if (endDate < this.getMidiTime(ctx)) continue;
          if (endDate === this.getMidiTime(ctx)) {
            e.addAttribute(new Attribute('slur', 't'));
            Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
            return;
          }
        }
        e.addAttribute(new Attribute('slur', 'im'));
        Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
      }
    }
  }

  /**
   * Convert an MEI `tstamp` — a beat number within the current measure, **1-based**, where
   * the beat unit is the time signature's denominator — into an absolute MSM tick.
   *
   * Hence the `- 1.0`, and hence the clamp: a `tstamp` below 1 is out of range and is
   * treated as the downbeat rather than as a negative offset. With no `tstamp` or no
   * current measure there is nothing to convert and the current clock is returned instead.
   */
  protected tstampToTicks(
    tstamp: string | null,
    msmPartContext: Element | null,
    ctx: WalkContext,
  ): number {
    if (tstamp === null || tstamp === '' || ctx.measure === null) return this.getMidiTime(ctx);

    let date = parseFloat(tstamp);
    date = date < 1.0 ? 0.0 : date - 1.0;

    const denom = this.getCurrentTimeSignature(msmPartContext, ctx)[1];
    const tstampToTicksConversionFactor = (4.0 * this.ppq) / denom;

    return (
      date * tstampToTicksConversionFactor + parseFloat(requireAttributeValue('date', ctx.measure))
    );
  }

  /**
   * Works out *when* a control event (dynamics, tempo, slur, arpeggio, pedal, …) starts and
   * ends, in MSM ticks. The one routine every control-event handler funnels through, which
   * is why they all begin with the same four-line destructuring.
   *
   * The start date comes from `tstamp.ges` if present, else `tstamp`. If neither exists the
   * event has no timing of its own and must borrow it from the note it points at: the
   * event is **moved in the MEI tree** to sit immediately before that note (`startid`, or
   * the first entry of `plist`), marked `dontRepositionMeAgain`, and null is returned so
   * the caller gives up for now — the walk will reach the event again in its new position,
   * where `getMidiTime()` yields the right date. That marker attribute is what stops the
   * move from repeating forever, and {@link msmCleanupSingle} strips it afterwards.
   *
   * The end date is whichever of these exists, in this order: `dur`, `tstamp2.ges`,
   * `tstamp2`, `endid`. A `tstamp2` of the form `<measures>m+<beat>` only resolves here
   * when `<measures>` is 0 or absent, i.e. the span ends in the same measure; otherwise the
   * attribute is handed back unresolved and the caller parks the entry on
   * {@link tstamp2s} until that later measure is walked. Likewise an unresolved `endid` is
   * parked on {@link endids} for {@link checkEndid}.
   *
   * @return `[date, endDate, tstamp2, endid]`, or null if the event was repositioned and
   *   should be processed on the next encounter
   */
  protected computeControlEventTiming(
    event: Element,
    msmPartContext: Element | null,
    ctx: WalkContext,
  ): [number, number | null, Attribute | null, Attribute | null] | null {
    let att = event.getAttribute('tstamp.ges');
    if (att === null) {
      att = event.getAttribute('tstamp');
      if (att === null && event.getAttribute('dontRepositionMeAgain') === null) {
        let startidAtt = event.getAttribute('startid');
        if (startidAtt === null) {
          startidAtt = event.getAttribute('plist');
        }
        if (startidAtt !== null) {
          // `plist` may name several elements; only the first decides where the event goes.
          // A `split` always yields at least one part, so index 0 is in range for any string.
          const references = startidAtt.getValue().trim().replace(/#/g, '').split(/\s+/);
          const startid = elementAt(references, 0, 'a startid/plist reference list').trim();
          const node = this.allNotesAndChords.get(startid);
          if (node !== undefined) {
            const parent = requireParentElement(node);
            event.detach();
            parent.insertChild(event, parent.indexOf(node));
            event.addAttribute(new Attribute('dontRepositionMeAgain', 'true'));
            return null;
          }
        }
      }
    }
    const tstamp = att === null ? null : att.getValue();
    const date: number = this.tstampToTicks(tstamp, msmPartContext, ctx);

    let tstamp2: Attribute | null = null;
    let endid: Attribute | null = null;
    let endDate: number | null = null;
    if (event.getAttribute('dur') !== null) {
      endDate = date + this.computeDuration(event, ctx);
    } else {
      tstamp2 = event.getAttribute('tstamp2.ges');
      if (tstamp2 === null) tstamp2 = event.getAttribute('tstamp2');
      if (tstamp2 !== null) {
        // `<measures>m+<beat>`. The length tests below are the bounds proof for the two
        // reads: the one-part form has a part 0, and reaching the `'0'` test means there are
        // at least two, so both indices are in range and `elementAt` names the sequence if
        // that ever stops being true.
        const ts2 = tstamp2.getValue().split('m+');
        const what = "a tstamp2 split on 'm+'";
        if (ts2.length === 0) tstamp2 = null;
        else if (ts2.length === 1) {
          endDate = this.tstampToTicks(elementAt(ts2, 0, what), msmPartContext, ctx);
          tstamp2 = null;
        } else if (elementAt(ts2, 0, what) === '0') {
          endDate = this.tstampToTicks(elementAt(ts2, 1, what), msmPartContext, ctx);
          tstamp2 = null;
        }
      }
      endid = event.getAttribute('endid');
    }

    return [date, endDate, tstamp2, endid];
  }

  /**
   * The duration of `ofThis` in MSM ticks — the single most parity-critical computation in
   * the file. Four stages, in this order, and the order is the arithmetic:
   *
   * 1. **Base value.** From `dur` on the element; failing that, from the enclosing `chord`'s
   *    `dur`; failing that, from the nearest applicable `dur.default` recorded in the
   *    part's `miscMap` (falling back to the global one), matched by layer. `breve` and
   *    `long` are special-cased to 8 and 16 quarters because they are words, not divisors;
   *    everything else is `4 * ppq / parseInt(dur)`. **`focus` is set alongside the base
   *    value and the later stages read dots from `focus`, not from `ofThis`** — so a note
   *    inheriting its `dur` from its chord inherits the chord's dots too.
   * 2. **Dots.** Each dot adds half of what the previous step added, accumulated in a
   *    running `d` — not recomputed as `dur * (2 - 2^-n)`. `childDots` is honoured as well;
   *    it is how a chord records dots that live on its children.
   * 3. **Tuplets by nesting.** Walk the MEI ancestors up to the `mdiv` and, for every
   *    `tuplet` on the way, scale by `numbase / num`. Nested tuplets therefore multiply.
   *    A `tuplet` missing either attribute makes the whole duration 0 rather than being
   *    skipped — Java does the same.
   * 4. **Tuplets by span.** `tupletSpan` elements apply to elements that are not inside a
   *    `tuplet`, so they are kept in a `tupletSpanMap` and matched by date and layer here.
   *    Expired spans (`date.end` already passed) are deleted from the map as a side effect
   *    of this walk — which is why it runs backwards, and why this method is not free of
   *    effects despite its name.
   *
   * Elements whose name is not in the regex at the top have no duration by definition and
   * return 0, as do grace notes: they sound, but they take no time from the measure.
   *
   * Every literal, every division and the `parseFloat`/`parseInt` split above are compared
   * against the Java reference through the MSM tick values. Do not simplify the expressions.
   */
  protected computeDuration(ofThis: Element, ctx: WalkContext): number {
    if (
      !ofThis
        .getLocalName()
        .match(/^(bTrem|chord|dynam|fTrem|halfmRpt|mRest|mSpace|note|octave|rest|tuplet|space)$/)
    ) {
      return 0.0;
    }

    if (ofThis.getAttribute('grace') !== null) return 0.0;

    let dur: number;
    // The chord the walk is inside, read into a local: it is what `chordEnvironment` tested
    // and then asserted back at each of its three uses. Nothing between here and the last of
    // them moves the cursor, so one read serves all three.
    const chord = ctx.chord;
    let focus = ofThis;

    {
      let sdur = '';
      const ownDur = ofThis.getAttributeValue('dur');
      const chordDur = chord === null ? null : chord.getAttributeValue('dur');
      if (ownDur !== null) {
        sdur = ownDur;
      } else {
        if (chord !== null && chordDur !== null) {
          focus = chord;
          sdur = chordDur;
        } else {
          if (ctx.part === null) return 0.0;
          const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
          let durdefaults = requirePartDatedMap(ctx, 'miscMap').getChildElements('dur.default');
          if (durdefaults.size() === 0) {
            durdefaults = requireGlobalDatedMap(ctx, 'miscMap').getChildElements('dur.default');
          }
          for (let i = durdefaults.size() - 1; i >= 0; --i) {
            const durdefault = durdefaults.get(i);
            const defaultLayer = durdefault.getAttributeValue('layer');
            if (defaultLayer === null || defaultLayer === layerId) {
              sdur = requireAttributeValue('dur', durdefault);
              break;
            }
          }
          if (sdur === '') return 0.0;
        }
      }

      switch (sdur) {
        case 'breve':
          dur = 8.0 * this.ppq;
          break;
        case 'long':
          dur = 16.0 * this.ppq;
          break;
        default:
          dur = (4.0 * this.ppq) / parseInt(sdur);
      }
    }

    {
      let dots = 0;
      const ownDots = focus.getAttributeValue('dots');
      if (ownDots !== null) {
        dots = parseInt(ownDots);
      } else {
        const childDots = focus.getAttributeValue('childDots');
        if (childDots !== null) dots = parseInt(childDots);
        if (dots === 0 && chord !== null) {
          const chordDots = chord.getAttributeValue('dots');
          if (chordDots !== null) dots = parseInt(chordDots);
        }
      }
      for (let d = dur; dots > 0; --dots) {
        d /= 2;
        dur += d;
      }
    }

    // tuplets
    for (
      let e = parentElement(focus);
      e !== null && e.getLocalName() !== 'mdiv';
      e = parentElement(e)
    ) {
      if (e.getLocalName() === 'tuplet') {
        const numbase = e.getAttributeValue('numbase');
        const num = e.getAttributeValue('num');
        if (numbase === null || num === null) return 0.0;
        dur *= parseFloat(numbase) / parseInt(num);
      }
    }

    // tupletSpans
    let tps: Element[];
    if (ctx.part !== null) {
      tps = allChildElements(
        requireFirstChildElement(requirePartDatedMap(ctx, 'miscMap'), 'tupletSpanMap'),
        'tupletSpan',
      );
    } else {
      tps = allChildElements(
        requireFirstChildElement(requireGlobalDatedMap(ctx, 'miscMap'), 'tupletSpanMap'),
        'tupletSpan',
      );
    }

    // Backwards, and the direction is arithmetic rather than taste: `dur` accumulates by
    // multiplication and floating-point multiplication is not associative, so visiting the
    // spans in the other order would change the last bits of every tuplet duration.
    //
    // This one stays an index walk, against the rule the rest of this file now follows,
    // because it is the innermost thing the converter does — once per note — and `for..of`
    // over a reversed copy measured 4% slower on a 2000-note score against
    // `scripts/bench.mjs`'s synthetic corpus. `elementAt` is what makes the walk honest
    // without allocating an iterator per note: `i` comes from `tps.length`, so a miss would
    // be a defect here rather than a property of the score.
    for (let i = tps.length - 1; i >= 0; --i) {
      const ts = elementAt(tps, i, 'the tuplet spans in scope');
      const dateEnd = ts.getAttributeValue('date.end');
      if (dateEnd !== null && parseFloat(dateEnd) <= this.getMidiTime(ctx)) {
        requireFirstChildElement(requirePartDatedMap(ctx, 'miscMap'), 'tupletSpanMap').removeChild(
          ts,
        );
        continue;
      }
      if (!Mei2MsmMpmConverter.isSameLayer(ts, Mei.getLayerId(ctx.layer))) continue;
      // `date`, `numbase` and `num` are written together by `processTupletSpan`, so a span
      // missing any of them is a defect in this converter rather than in the score.
      if (parseFloat(requireAttributeValue('date', ts)) <= this.getMidiTime(ctx))
        dur *=
          parseFloat(requireAttributeValue('numbase', ts)) /
          parseInt(requireAttributeValue('num', ts));
    }

    return dur;
  }

  public isSameLayerInstance(startid: string, endid: string): string {
    const start = this.allNotesAndChords.get(startid.trim().replace(/#/g, ''));
    if (start === undefined) return '';
    const end = this.allNotesAndChords.get(endid.trim().replace(/#/g, ''));
    if (end === undefined) return '';
    const startLayerId = Mei.getLayerId(Mei.getLayer(start));
    if (startLayerId === '') return '';
    const endLayerId = Mei.getLayerId(Mei.getLayer(end));
    if (startLayerId !== endLayerId) return '';
    return startLayerId;
  }

  public isSameStaff(startid: string, endid: string): string {
    const start = this.allNotesAndChords.get(startid.trim().replace(/#/g, ''));
    if (start === undefined) return '';
    const end = this.allNotesAndChords.get(endid.trim().replace(/#/g, ''));
    if (end === undefined) return '';
    const startStaffId = Mei.getStaffId(Mei.getStaff(start));
    if (startStaffId === '') return '';
    const endStaffId = Mei.getStaffId(Mei.getStaff(end));
    if (startStaffId !== endStaffId) return '';
    return startStaffId;
  }

  /**
   * The MIDI pitch of a note, and — through the out-parameter — the spelling that produced
   * it. The other half of the parity-critical arithmetic, alongside
   * {@link computeDuration}.
   *
   * ### `.ges` beats written, everywhere
   *
   * MEI's `pname.ges`, `oct.ges` and `accid.ges` are the *gestural* (sounding) values; the
   * unsuffixed ones are what is written on the page. Wherever both exist the gestural one
   * wins, and — this is the important part — **a gestural value also suppresses the work
   * that would have derived it**: `accid.ges` clears `checkKeySign`, and having both
   * `pname.ges` and `oct.ges` skips the entire transposition section, because a gestural
   * pitch is already transposed by definition.
   *
   * ### Where each component comes from
   *
   * - **pitch name**: `pname.ges` (unless `'none'`), else `pname`; no pname at all means
   *   this is not a pitched note and -1 is returned;
   * - **octave**: `oct.ges`, else `oct`, else the nearest layer-matching `oct.default` from
   *   the part's `miscMap` (global as fallback). When it has to fall back this far it
   *   **writes the resolved `oct` back onto the MEI element**, so later passes see it;
   * - **accidental**, in four escalating steps: `accid.ges`; else `accid`; else the most
   *   recent {@link accid} entry in this measure for the same pname *and* octave — MEI
   *   accidentals are octave-specific here; else the key signature.
   *
   * ### Key signature resolution
   *
   * Part-local before global, but only if the local one is not older: a global key
   * signature dated later than the local one wins, and is then **copied into the local
   * map** so subsequent notes in this part find it directly. An accidental in the key
   * signature matches by pitch class (`pname2midi(pname) % 12`) against the entry's
   * `midi.pitch` or `pitchname`.
   *
   * ### Transposition
   *
   * Four sources add up: global and part-local `transposition` and `addTransposition`
   * entries in the `miscMap`s. `transposition` is exclusive — the backwards scan takes the
   * first applicable entry and `break`s, so later entries override earlier ones — while
   * `addTransposition` accumulates every applicable entry, which is what lets an `octave`
   * (8va) line stack on top of an instrument's transposition. Note the asymmetry in the
   * expiry test: an expired `transposition` `break`s the scan, an expired
   * `addTransposition` merely `continue`s. Both shapes are Java's.
   *
   * @param pitchdata out-parameter, **appended to**: `[pitchname, accidental, octave]`
   * @return the MIDI pitch, or -1 if `ofThis` carries no pitch name
   */
  protected computePitch(ofThis: Element, pitchdata: string[], ctx: WalkContext): number {
    let pname: string;
    let accid = '';
    const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
    let oct = 0.0;
    let trans = 0;
    let checkKeySign = false;

    // `.ges` ("gestural", i.e. as performed) wins over the written spelling for all three
    // of pitch name, octave and accidental; each pair used to be four lookups and two
    // assertions, and is now one read apiece.
    const pnameGes = ofThis.getAttributeValue('pname.ges');
    if (pnameGes !== null && pnameGes !== 'none') {
      pname = pnameGes;
    } else {
      const pnameWritten = ofThis.getAttributeValue('pname');
      if (pnameWritten !== null) {
        pname = pnameWritten;
        checkKeySign = true;
      } else {
        return -1.0;
      }
    }

    const octGes = ofThis.getAttributeValue('oct.ges');
    const octWritten = ofThis.getAttributeValue('oct');
    if (octGes !== null) {
      oct = parseFloat(octGes);
    } else {
      if (octWritten !== null) {
        oct = parseFloat(octWritten);
      } else {
        if (ctx.part !== null) {
          let octs = requirePartDatedMap(ctx, 'miscMap').getChildElements('oct.default');
          if (octs.size() === 0) {
            octs = requireGlobalDatedMap(ctx, 'miscMap').getChildElements('oct.default');
          }
          for (let i = octs.size() - 1; i >= 0; --i) {
            const octDefault = octs.get(i);
            const defaultLayer = octDefault.getAttributeValue('layer');
            if (defaultLayer === null || defaultLayer === layerId) {
              oct = parseFloat(requireAttributeValue('oct.default', octDefault));
              break;
            }
          }
        }
        ofThis.addAttribute(new Attribute('oct', String(oct)));
      }
    }

    const accidGes = ofThis.getAttributeValue('accid.ges');
    const accidWritten = ofThis.getAttributeValue('accid');
    if (accidGes !== null) {
      accid = accidGes;
      checkKeySign = false;
    } else {
      if (accidWritten !== null) {
        accid = accidWritten;
        if (accid !== '') checkKeySign = false;
      } else {
        // The most recent accidental in this measure on the same pitch and octave. Java
        // counts an index down and `break`s on the first hit, which is a backwards search;
        // as one, the predicate and the thing done with the hit stop being interleaved, and
        // reading each attribute value once instead of asking `getAttribute` and then
        // asserting `getAttributeValue(…)!` retires three assertions with it.
        //
        // (`getAttribute('pname') !== null` is dropped from the predicate because it is
        // subsumed: `pname` is a `string`, and a candidate without the attribute answers
        // `null`, which is equal to no string.)
        const anAccid = findLast(this.accid, (candidate) => {
          const candidateOct = candidate.getAttributeValue('oct');
          return (
            candidate.getAttributeValue('pname') === pname &&
            candidateOct !== null &&
            parseFloat(candidateOct) === oct
          );
        });
        if (anAccid !== null) {
          const gestural = anAccid.getAttributeValue('accid.ges');
          const written = anAccid.getAttributeValue('accid');
          if (gestural !== null) accid = gestural;
          else if (written !== null) accid = written;
          checkKeySign = accid === '';
        }
        if (checkKeySign) {
          const keySigMapLocal = ctx.part === null ? null : partDatedMap(ctx, 'keySignatureMap');
          const keySigMapGlobal = globalDatedMap(ctx, 'keySignatureMap');

          let keySigLocal: Element | null = null;
          if (keySigMapLocal !== null) {
            const keySigsLocal = keySigMapLocal.getChildElements('keySignature');
            for (let i = keySigsLocal.size() - 1; i >= 0; --i) {
              if (
                keySigsLocal.get(i).getAttribute('layer') === null ||
                keySigsLocal.get(i).getAttributeValue('layer') === layerId
              ) {
                keySigLocal = keySigsLocal.get(i);
                break;
              }
            }
          }

          let keySigGlobal: Element | null = null;
          if (keySigMapGlobal !== null) {
            const keySigsGlobal = keySigMapGlobal.getChildElements('keySignature');
            for (let i = keySigsGlobal.size() - 1; i >= 0; --i) {
              if (
                keySigsGlobal.get(i).getAttribute('layer') === null ||
                keySigsGlobal.get(i).getAttributeValue('layer') === layerId
              ) {
                keySigGlobal = keySigsGlobal.get(i);
                break;
              }
            }
          }

          let keySig = keySigLocal;
          if (
            keySig === null ||
            (keySigGlobal !== null &&
              parseFloat(requireAttributeValue('date', keySigLocal)) <
                parseFloat(requireAttributeValue('date', keySigGlobal)))
          ) {
            keySig = keySigGlobal;
            if (
              keySigMapLocal !== null &&
              keySigGlobal !== null &&
              keySigMapLocal.getChildCount() > 0
            ) {
              addToMap(keySigGlobal.copy(), keySigMapLocal);
            }
          }

          if (keySig !== null) {
            const keySigAccids = keySig.getChildElements('accidental');
            for (let i = 0; i < keySigAccids.size(); ++i) {
              const a = keySigAccids.get(i);
              const midiPitch = a.getAttributeValue('midi.pitch');
              const pitchname = a.getAttributeValue('pitchname');
              let aPitch: number;
              if (midiPitch !== null) aPitch = parseFloat(midiPitch);
              else if (pitchname !== null) aPitch = pname2midi(pitchname);
              else continue;
              const pitchOfThis = pname2midi(pname) % 12;
              if (aPitch === pitchOfThis) {
                // `makeKeySignature` writes `value` on every `accidental` it emits — and
                // these come from an MSM keySignatureMap this converter filled itself.
                accid = requireAttributeValue('value', a);
                break;
              }
            }
          }
        }
      }
    }

    // transpositions
    if (ofThis.getAttribute('pname.ges') === null || ofThis.getAttribute('oct.ges') === null) {
      {
        const globalTrans = requireGlobalDatedMap(ctx, 'miscMap').getChildElements('transposition');
        for (let i = globalTrans.size() - 1; i >= 0; --i) {
          if (
            globalTrans.get(i).getAttributeValue('date') !== null &&
            parseFloat(requireAttributeValue('date', globalTrans.get(i))) > this.getMidiTime(ctx)
          )
            continue;
          if (
            globalTrans.get(i).getAttribute('date.end') !== null &&
            parseFloat(requireAttributeValue('date.end', globalTrans.get(i))) <=
              this.getMidiTime(ctx)
          )
            break;
          if (!Mei2MsmMpmConverter.isSameLayer(globalTrans.get(i), layerId)) continue;
          trans += parseFloat(requireAttributeValue('semi', globalTrans.get(i)));
          break;
        }
      }
      {
        const globalAddTrans = requireGlobalDatedMap(ctx, 'miscMap').getChildElements(
          'addTransposition',
        );
        for (let i = globalAddTrans.size() - 1; i >= 0; --i) {
          if (
            globalAddTrans.get(i).getAttributeValue('date') !== null &&
            parseFloat(requireAttributeValue('date', globalAddTrans.get(i))) > this.getMidiTime(ctx)
          )
            continue;
          if (
            globalAddTrans.get(i).getAttribute('date.end') !== null &&
            parseFloat(requireAttributeValue('date.end', globalAddTrans.get(i))) <=
              this.getMidiTime(ctx)
          )
            continue;
          if (!Mei2MsmMpmConverter.isSameLayer(globalAddTrans.get(i), layerId)) continue;
          trans += parseFloat(requireAttributeValue('semi', globalAddTrans.get(i)));
        }
      }
      if (ctx.part !== null) {
        {
          const localTrans = requirePartDatedMap(ctx, 'miscMap').getChildElements('transposition');
          for (let i = localTrans.size() - 1; i >= 0; --i) {
            if (
              localTrans.get(i).getAttributeValue('date') !== null &&
              parseFloat(requireAttributeValue('date', localTrans.get(i))) > this.getMidiTime(ctx)
            )
              continue;
            if (
              localTrans.get(i).getAttribute('date.end') !== null &&
              parseFloat(requireAttributeValue('date.end', localTrans.get(i))) <=
                this.getMidiTime(ctx)
            )
              break;
            if (!Mei2MsmMpmConverter.isSameLayer(localTrans.get(i), layerId)) continue;
            trans += parseFloat(requireAttributeValue('semi', localTrans.get(i)));
            break;
          }
        }
        {
          const localAddTrans = requirePartDatedMap(ctx, 'miscMap').getChildElements(
            'addTransposition',
          );
          for (let i = localAddTrans.size() - 1; i >= 0; --i) {
            if (
              localAddTrans.get(i).getAttributeValue('date') !== null &&
              parseFloat(requireAttributeValue('date', localAddTrans.get(i))) >
                this.getMidiTime(ctx)
            )
              continue;
            if (
              localAddTrans.get(i).getAttribute('date.end') !== null &&
              parseFloat(requireAttributeValue('date.end', localAddTrans.get(i))) <=
                this.getMidiTime(ctx)
            )
              continue;
            if (!Mei2MsmMpmConverter.isSameLayer(localAddTrans.get(i), layerId)) continue;
            trans += parseFloat(requireAttributeValue('semi', localAddTrans.get(i)));
          }
        }
      }
    }

    let pitch = pname2midi(pname);
    if (pitch === -1.0) return -1.0;

    const initialPitch = pitch;
    pitch += 12 * (oct + 1);

    const accidentals = checkKeySign
      ? accid === ''
        ? 0.0
        : parseFloat(accid)
      : accidString2decimal(accid);
    pitch += accidentals;
    pitch += trans;

    const p1 = Math.floor(initialPitch + 12 * oct + trans);
    const p2 = ((p1 % 12) + 12) % 12;
    const outputOct = (p1 - p2) / 12 - 1;
    let outputAcc = accidentals;
    let pitchname = pname;
    if (trans !== 0) {
      switch (p2) {
        case 0:
          pitchname = 'c';
          break;
        case 1:
          if (trans > 0) {
            pitchname = 'c';
            outputAcc += 1;
          } else {
            pitchname = 'd';
            outputAcc -= 1;
          }
          break;
        case 2:
          pitchname = 'd';
          break;
        case 3:
          if (trans > 0) {
            pitchname = 'd';
            outputAcc += 1;
          } else {
            pitchname = 'e';
            outputAcc -= 1;
          }
          break;
        case 4:
          pitchname = 'e';
          break;
        case 5:
          pitchname = 'f';
          break;
        case 6:
          if (trans > 0) {
            pitchname = 'f';
            outputAcc += 1;
          } else {
            pitchname = 'g';
            outputAcc -= 1;
          }
          break;
        case 7:
          pitchname = 'g';
          break;
        case 8:
          if (trans > 0) {
            pitchname = 'g';
            outputAcc += 1;
          } else {
            pitchname = 'a';
            outputAcc -= 1;
          }
          break;
        case 9:
          pitchname = 'a';
          break;
        case 10:
          if (trans > 0) {
            pitchname = 'a';
            outputAcc += 1;
          } else {
            pitchname = 'b';
            outputAcc -= 1;
          }
          break;
        case 11:
          pitchname = 'b';
          break;
      }
    }
    pitchdata.push(pitchname);
    pitchdata.push(String(outputAcc));
    pitchdata.push(String(outputOct));

    return pitch;
  }

  /** strip the conversion's scaffolding from every MSM; see {@link msmCleanupSingle} */
  public static msmCleanup(msms: Msm[]): void {
    for (const msm of msms) Mei2MsmMpmConverter.msmCleanupSingle(msm);
  }

  /**
   * Remove everything the conversion needed but the MSM format does not define: the whole
   * `miscMap` (the converter's scratch space for defaults, tuplet spans and the like) and
   * the working attributes `currentDate`, `tie`, `layer`, `endid`, `tstamp2` and a `goto`'s
   * `n`. Then drop the maps left empty by all of that.
   *
   * This is what the `cleanup` constructor flag switches on, and it is destructive — an
   * MSM that has been through here can no longer be resumed by the converter.
   *
   * The root element is required rather than asserted: this file's standing assumption is
   * that a movement under conversion has one, and the previous note here explained that a
   * *guard* would turn today's `TypeError` on an empty MSM into a silent no-op. It would —
   * which is why this throws instead, keeping the control flow and naming the cause
   * (ARCHITECTURE.md RULE N2a).
   */
  public static msmCleanupSingle(msm: Msm): void {
    const root = msm.getRootElement();
    if (root === null) throw new MissingNodeError('this MSM movement holds no document');
    for (const node of Mei2MsmMpmConverter.msmScaffolding(root)) {
      if (node instanceof Element) {
        const parent = node.getParent();
        if (parent) parent.removeChild(node);
      }
      if (node instanceof Attribute) {
        const parent = node.getParent();
        if (parent) parent.removeAttribute(node);
      }
    }
    msm.deleteEmptyMaps();
  }

  /** the working attributes {@link msmScaffolding} strips, in the order the union listed them */
  private static readonly MSM_SCAFFOLDING_ATTRIBUTES = [
    'currentDate',
    'tie',
    'layer',
    'endid',
    'tstamp2',
  ] as const;

  /**
   * Every node {@link msmCleanupSingle} has to remove, in document order.
   *
   * This was one {@link Element.query} over a seven-branch union:
   *
   * ```
   * descendant::*[local-name()='miscMap']
   *   | descendant::*[attribute::currentDate]/attribute::currentDate
   *   | … tie | layer | endid | tstamp2 …
   *   | descendant::*[local-name()='goto' and attribute::n]/attribute::n
   * ```
   *
   * and it was 72% of a whole MEI-to-MSM conversion. `query` serialises the subtree to
   * XML text, re-parses it, evaluates the expression over the throwaway copy and maps the
   * hits back by position — but the cost here is not the round trip, it is what the union
   * operator does afterwards. `|` puts its operands through XPath's node-set ordering,
   * which inserts every hit into an AVL tree under a `compareDocumentPosition` comparator;
   * xmldom implements that by materialising and comparing both ancestor chains. Every
   * note in an MSM score carries `currentDate` and most carry `tie` and `layer`, so the
   * node set is several times the size of the score and that sort is what makes the whole
   * converter quadratic. Walking the tree once costs a single pass instead.
   *
   * Faithfulness of the replacement, branch by branch:
   *
   * - `descendant::` excludes the root, and {@link descendantElements} does too;
   * - pre-order matches XPath document order for the elements. Attributes of one element
   *   are emitted in declaration order, where the union emitted them in whatever order
   *   `compareDocumentPosition`'s implementation-specific attribute branch produced. That
   *   difference is invisible: the loop's two removals are independent of each other and
   *   of order — the node set is a snapshot taken before any removal, removing an
   *   attribute never affects another node, and removing an element leaves its subtree
   *   intact so a nested `miscMap` or an attribute inside a removed one is still removed
   *   from its (now detached) owner, exactly as before;
   * - the walk descends into `miscMap` as `descendant::` did, so the set is the same set
   *   and not merely the same effect;
   * - `getAttribute(name)` matches on local name where `attribute::name` matches only the
   *   no-namespace attribute. MSM carries no namespaced attribute but `xml:id`, none of
   *   the six names is ever prefixed, and the fixture corpus is the check on that.
   */
  private static msmScaffolding(root: Element): (Element | Attribute)[] {
    const doomed: (Element | Attribute)[] = [];
    for (const element of descendantElements(root, () => true)) {
      const name = element.getLocalName();
      if (name === 'miscMap') doomed.push(element);
      for (const attributeName of Mei2MsmMpmConverter.MSM_SCAFFOLDING_ATTRIBUTES) {
        const found = element.getAttribute(attributeName);
        if (found) doomed.push(found);
      }
      if (name === 'goto') {
        const n = element.getAttribute('n');
        if (n) doomed.push(n);
      }
    }
    return doomed;
  }

  public static mpmPostprocessing(mpms: Mpm[]): void {
    for (const mpm of mpms) Mei2MsmMpmConverter.mpmPostprocessingSingle(mpm);
  }

  /**
   * Finish the MPM's continuous maps once the whole movement is known.
   *
   * Continuous instructions — a crescendo, an accelerando — are written as a start value
   * plus `transition.to`, and they need a *following* instruction to transition into. This
   * pass supplies the missing one: for every entry with a `date.end`, if no later
   * instruction already starts at or before that date, a synthetic instruction carrying the
   * `transition.to` value is inserted there (as `volume` for dynamics, `bpm` for tempo).
   * Without it the transition would have no endpoint and would extend to the end of the
   * piece.
   *
   * It also drops the working attributes `endid`, `tstamp2` and `date.end` — the MPM
   * counterpart of what {@link msmCleanupSingle} does for MSM, except that this one runs
   * unconditionally rather than under the `cleanup` flag, because these attributes are not
   * valid MPM.
   */
  public static mpmPostprocessingSingle(mpm: Mpm): void {
    const maps: GenericMap[] = [];

    for (let p = 0; p < mpm.size(); ++p) {
      const perf = mpm.getPerformance(p);
      if (perf === null) continue;

      // collect all global and local dynamicsMaps and tempoMaps
      let aMap = perf.getGlobal()?.getDated()?.getMap(Mpm.DYNAMICS_MAP) ?? null;
      if (aMap !== null) maps.push(aMap);

      aMap = perf.getGlobal()?.getDated()?.getMap(Mpm.TEMPO_MAP) ?? null;
      if (aMap !== null) maps.push(aMap);

      // `perf.size()` IS `perf.getAllParts().length`, so the counter never said anything the
      // sequence did not.
      for (const part of perf.getAllParts()) {
        aMap = part.getDated()?.getMap(Mpm.DYNAMICS_MAP) ?? null;
        if (aMap !== null) maps.push(aMap);

        aMap = part.getDated()?.getMap(Mpm.TEMPO_MAP) ?? null;
        if (aMap !== null) maps.push(aMap);
      }
    }

    // go through all the maps' elements and finalize them
    for (const map of maps) {
      for (let e = 0; e < map.size(); ++e) {
        const d = mapElement(map, e);

        // handle remaining endid attributes
        const endid = d.getAttribute('endid');
        if (endid !== null) d.removeAttribute(endid);

        // handle remaining tstamp2 attributes
        const tstamp2 = d.getAttribute('tstamp2');
        if (tstamp2 !== null) d.removeAttribute(tstamp2);

        const end = d.getAttribute('date.end');
        if (end !== null) {
          const endDate = parseFloat(end.getValue());
          d.removeAttribute(end);
          const next = map.getElement(e + 1);
          if (next === null || parseFloat(requireAttributeValue('date', next)) > endDate) {
            const t = d.getAttribute('transition.to');
            if (t !== null) {
              const elementType = d.getLocalName();
              const endElement = new Element(elementType, Mpm.MPM_NAMESPACE);
              endElement.addAttribute(new Attribute('date', String(endDate)));

              switch (elementType) {
                case 'dynamics':
                  endElement.addAttribute(new Attribute('volume', t.getValue()));
                  break;
                case 'tempo':
                  endElement.addAttribute(new Attribute('bpm', t.getValue()));
                  break;
                default:
                  continue;
              }
              map.addElement(endElement);
            }
          }
        }
      }
    }
  }

  /**
   * Move everything in a measure that is *not* staff content to the front.
   *
   * Control events (`dynam`, `tempo`, `dir`, `slur`, …) are commonly encoded after the
   * staves they apply to, but the converter is a single forward pass: a dynamic must be
   * seen before the notes it colours, or it would be dated after them. Hoisting every
   * subtree with no `staff`/`oStaff` inside it to position 0 gives the walk that order.
   *
   * The backwards loop combined with `insertChild(subtree, 0)` is what preserves the
   * relative order of the hoisted elements — walking forwards would reverse them.
   *
   * The test used to be `subtree.query("descendant-or-self::*[local-name()='staff' or
   * local-name()='oStaff']").size() === 0`, run once per child of every measure — so every
   * `<staff>` in the document was serialised to XML text and re-parsed just to establish
   * that it is a staff. That was 19% of a 32 000-note conversion. Written out, the
   * `-or-self` half answers for the staves before anything is walked, and the walk that
   * remains only ever covers a control event's own small subtree.
   */
  protected static reorderMeasureContent(measure: Element): void {
    const isStaffLike = (element: Element): boolean => {
      const name = element.getLocalName();
      return name === 'staff' || name === 'oStaff';
    };
    const subtrees = measure.getChildElements();
    for (let i = subtrees.size() - 1; i >= 0; --i) {
      const subtree = subtrees.get(i);
      if (!isStaffLike(subtree) && descendantElements(subtree, isStaffLike).length === 0) {
        subtree.detach();
        measure.insertChild(subtree, 0);
      }
    }
  }

  /**
   * Stamp a note with the id of the slur that covers it, so MPM's articulation rendering
   * can tell two overlapping slurs apart.
   *
   * The `_meico_<uuid>` suffix makes the value unique per note while keeping the slur's own
   * id readable as a prefix. It draws a UUID per stamped note, so this sits on the
   * order-sensitive path described on {@link addUUID}.
   */
  protected static addSlurId(fromThis: Element, toThis: Element): void {
    const slurid = attribute('id', fromThis);
    if (slurid !== null) {
      toThis.addAttribute(new Attribute('slurid', `${slurid.getValue()}_meico_${uuidv4()}`));
    }
  }

  /**
   * Translate a barline into MSM sequencing commands — the `marker`/`goto` pairs that
   * {@link Msm.applySequencingMapToMap} later expands into actual repeats.
   *
   * `rptstart` drops a "repetition start" marker; `rptend` emits a `goto` that jumps back
   * to it; `rptboth` does both, in that order — the goto is written *before* the marker so
   * that a `rptboth` barline jumps back to the *previous* repeat start rather than to
   * itself. `end` marks "fine". Anything else is not a sequencing instruction and returns.
   *
   * The goto's target is found by scanning the map backwards for the newest marker strictly
   * *before* this date; failing that the target stays `date 0` with an empty id, i.e. jump
   * to the beginning.
   */
  protected static barline2SequencingCommand(
    barline: string,
    date: number,
    sequencingMap: Element,
  ): void {
    let markerMessage: string | null = null;
    let makeGoto = false;

    switch (barline) {
      case 'end':
        markerMessage = 'fine';
        break;
      case 'rptstart':
        markerMessage = 'repetition start';
        break;
      case 'rptboth':
        markerMessage = 'repetition start';
        makeGoto = true;
        break;
      case 'rptend':
        makeGoto = true;
        break;
      default:
        return;
    }

    if (makeGoto) {
      const gt = new Element('goto');
      gt.addAttribute(new Attribute('date', String(date)));
      gt.addAttribute(new Attribute('activity', '1'));
      gt.addAttribute(new Attribute('target.date', '0'));
      gt.addAttribute(new Attribute('target.id', ''));
      addToMap(gt, sequencingMap);
      const ns = sequencingMap.query(
        "descendant::*[local-name()='marker' and (@message='repetition start' or @message='fine')]",
      );
      for (let i = ns.size() - 1; i >= 0; --i) {
        const n = ns.get(i) as unknown as Element;
        if (parseFloat(requireAttributeValue('date', n)) < date) {
          requireAttribute('target.date', gt).setValue(requireAttributeValue('date', n));
          requireAttribute('target.id', gt).setValue(`#${requireAttributeValue('id', n)}`);
          break;
        }
      }
    }

    if (markerMessage !== null) {
      const marker = new Element('marker');
      marker.addAttribute(new Attribute('date', String(date)));
      marker.addAttribute(new Attribute('message', markerMessage));
      const id = new Attribute(
        'xml:id',
        'http://www.w3.org/XML/1998/namespace',
        `meico_${uuidv4()}`,
      );
      marker.addAttribute(id);
      addToMap(marker, sequencingMap);
    }
  }

  /**
   * Octave-displacement clefs (`clef.dis`, e.g. a tenor G clef sounding an octave down).
   *
   * **Not implemented — always 0.** Java computes a semitone offset from the `clef.dis` and
   * `clef.dis.place` attributes here; this port never ported it, so a displaced clef is
   * converted as an undisplaced one. Latent for the fixtures, which contain no `clef.dis` —
   * grep says zero hits across `tests/integration/fixtures/`, so nothing in the corpus can
   * tell the stub from the real thing. Left as a stub rather than removed so the gap stays
   * visible at the two `trans += processClefDis()` call sites.
   *
   * The `scoreStaffDef` parameter is **gone**, not renamed with an underscore. The body has
   * never read it, so declaring it claimed a dependence this function does not have;
   * whoever implements the method adds it back at the same time as the code that reads it,
   * which is two lines. Java's signature is recorded here instead:
   * `private static double processClefDis(Element scoreStaffDef)`.
   *
   * The repo's `^_` convention (`eslint.config.js`, and lint-debt.md:596) would also cover
   * this, and deliberately is not used: it marks a parameter kept for its **position** in a
   * signature an outside caller supplies — `writeMsmString(_filename)` keeps Java's public
   * shape. This is a `protected static` helper whose only two callers are three lines away in
   * this file, so there is no signature to keep and nobody to keep it for.
   */
  protected static processClefDis(): number {
    return 0.0;
  }

  /**
   * Does `e` apply to the layer `layerId`? The voice filter used throughout the converter.
   *
   * `e`'s `layer` attribute may name several layers, space separated. An element with **no**
   * `layer` attribute applies everywhere, and an empty `layerId` — what
   * {@link Mei.getLayerId} returns for unlayered music — matches everything, so the filter
   * is inert on scores that do not use layers at all.
   */
  public static isSameLayer(e: Element, layerId: string): boolean {
    const layerAttribute = e.getAttributeValue('layer');
    if (layerAttribute !== null) {
      const layers = layerAttribute.trim().split(/\s+/);
      for (const layer of layers) {
        if (layer === layerId) return true;
      }
      return false;
    }
    return true;
  }
}

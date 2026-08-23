import { Element, Attribute, Elements, Document } from '../xml/XomTypes.js';
import { addToMap } from '../msm/dateMap.js';
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
import { Mei } from './Mei.js';
import type { KeyValue } from '../supplementary/KeyValue.js';
import { Goto } from '../msm/Goto.js';
import { Msm } from '../msm/Msm.js';
import { v4 as uuidv4 } from 'uuid';
import { firstPresent, foldl, head, isNonEmpty, mapPresent, orDefault } from '../prelude/index.js';
import { elementAt, findLast, removeAt } from '../prelude/seq.js';

/**
 * The circle of fifths as `[midi.pitch, pitchname]` pairs, sharpwards and flatwards — the
 * accidentals a key signature carries, in the order it accumulates them.
 *
 * `makeKeySignature` takes the first `|accidCount|` entries of one of these, so the order is
 * the whole content: F♯ C♯ G♯ D♯ A♯ E♯ B♯ going sharpwards, B♭ E♭ A♭ D♭ G♭ C♭ F♭ going
 * flatwards. The flatward list is the sharpward one reversed, written out rather than derived
 * so that reading either one against a key-signature table needs no mental step.
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
 * What the walker does with an element once its handler has run. `'done'` means the element is
 * finished — either it was ignored, or its handler took over the descent itself; `'descend'`
 * means the walker recurses into its children.
 *
 * The set of `'descend'` elements is exactly the set whose children reach the converter through
 * the generic path, so moving an element between the two silently changes what gets converted.
 */
type Traversal = 'done' | 'descend';

/**
 * The movement being converted: the MSM being filled, and the `meiHead` `work` this `mdiv`
 * claims, if any. Ambient context for everything below the `mdiv` — every method there reads
 * the same two values and none may change one.
 *
 * `work` is set only when the `mdiv` claims one by `@decls` or matches one by `@n`, and it
 * supplies the movement's fallback tempo and `<meter>`. It has to be per-movement for that
 * reason: a value carried over from the previous `mdiv` would serve that movement's defaults
 * to this one.
 */
interface MovementContext {
  /** the root of the MSM being filled */
  readonly msm: Element;
  /** the `meiHead` `work` this movement claims, or null if it claims none */
  readonly work: Element | null;
}

/**
 * Where in the MEI the walk currently is: the movement being filled, plus the part, layer,
 * measure and chord enclosing the element being converted. Threaded down
 * {@link Mei2MsmMpmConverter.convertElement}, so a method that takes `ctx` reads its enclosing
 * context and a method that does not, does not.
 *
 * Every field is `readonly` and the record is never mutated: a descent builds a new one
 * (`{ ...ctx, part: … }`) and passes it no further than the subtree it belongs to, which is why
 * nothing has to be put back on the way out. One record is allocated per staff, layer, measure
 * and chord, none per note.
 */
interface WalkContext {
  /**
   * the movement being filled, or null before any `mdiv` has been entered
   *
   * {@link Mei2MsmMpmConverter.getMidiTime} and {@link Mei2MsmMpmConverter.processReh} branch
   * on the null: a `body` is walked before any movement exists, and an element outside every
   * `mdiv` still reaches the dispatch table.
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
 * {@link Mei2MsmMpmConverter.convertMei} starts from it, walking a `body` whose children are
 * `mdiv`s; {@link Mei2MsmMpmConverter.makeMovement} starts each movement from
 * `{ ...NOTHING_OPEN, movement }`.
 */
const NOTHING_OPEN: WalkContext = {
  movement: null,
  part: null,
  layer: null,
  measure: null,
  chord: null,
};

/**
 * The movement the walk is inside. Null here is a broken invariant rather than an outcome:
 * every caller of this is below a handler `makeMovement` dispatched. The two places where an
 * absent movement is a real outcome — {@link Mei2MsmMpmConverter.getMidiTime} and
 * {@link Mei2MsmMpmConverter.processReh} — branch on `ctx.movement === null` themselves.
 */
function requireMovement(ctx: WalkContext): MovementContext {
  if (ctx.movement === null)
    throw new MissingNodeError('no MSM movement is currently being converted');
  return ctx.movement;
}

/**
 * The `global/dated/<name>` map of the MSM movement being filled, or null if it holds no such
 * map. `global` and `dated` are required — {@link Msm.createMsm} builds them unconditionally —
 * while the map itself is created on demand, and several callers hand the result straight to
 * `addToMap`, which treats a null map as "nowhere to add".
 */
function globalDatedMap(ctx: WalkContext, name: string): Element | null {
  return datedMap(requireFirstChildElement(requireMovement(ctx).msm, 'global'), name);
}

/** {@link globalDatedMap} for the callers that read or write the map; see {@link requireDatedMap} */
function requireGlobalDatedMap(ctx: WalkContext, name: string): Element {
  return requireDatedMap(requireFirstChildElement(requireMovement(ctx).msm, 'global'), name);
}

/**
 * The MSM part the walk is inside. `part` is null until a `staff` or `staffDef` opens one, but
 * every handler that comes here was dispatched from below the element that set it, so an empty
 * cursor is a broken invariant and not an outcome. Where it is an outcome the caller branches
 * on `ctx.part === null` directly instead.
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
 * Handlers are free functions rather than methods so the table can be a single static value;
 * they receive the converter explicitly because the conversion's output state — the movement
 * being filled, the deferred work lists — lives there. Where the walk *is* is the third
 * parameter: see {@link WalkContext}.
 */
type ElementHandler = (c: Mei2MsmMpmConverter, e: Element, ctx: WalkContext) => Traversal;

/**
 * The `dated/<name>` map of an MSM `global` or `part` element, or null if it holds no such map.
 *
 * MSM puts every timed list under a `dated` wrapper, so every map access here is a two-step
 * descent. `dated` is required — {@link Msm.createMsm} and {@link Mei2MsmMpmConverter.makePart}
 * build it unconditionally — while the map itself stays nullable: maps are created on demand,
 * and most callers pass the result straight to `addToMap`, whose contract already includes
 * "null map, nothing to do".
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
 * are the only names asked for here, and the empty ones are not pruned until `msmCleanup` runs
 * at the very end of the conversion, after every read below.
 */
function requireDatedMap(container: Element, name: string): Element {
  return requireFirstChildElement(requireFirstChildElement(container, 'dated'), name);
}

/**
 * MEI's `@label`, else its `@n`, else null — the readable name of a structural element, the
 * preference `phrase` and `section` both take.
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
 * {@link Mei2MsmMpmConverter.processStaff} refreshes it on re-entry, so its absence is a broken
 * MSM and not a case to branch on. The value is in MIDI ticks.
 */
function partClock(part: Element): Attribute {
  return requireAttribute('currentDate', part);
}

/** move an MSM part's clock forward by `ticks`; see {@link partClock} */
function advancePartClock(part: Element, ticks: number): void {
  const clock = partClock(part);
  clock.setValue(String(parseFloat(clock.getValue()) + ticks));
}

/** element without effect on the sounding result: skipped whole, not descended into */
const IGNORE: ElementHandler = () => 'done';

/** structural wrapper with no meaning of its own: nothing to do but walk its children */
const DESCEND: ElementHandler = () => 'descend';

/**
 * Converts MEI into MSM — the score, as written. Essentially all the musical knowledge in the
 * port lives here; {@link Mei} only owns the tree and {@link Msm} only owns the output format.
 *
 * It converts what is played, not how. The score's performance markings — `tempo`, `dynam`,
 * `artic`, `slur`, `arpeg`, the ornament signs — are skipped: espressivo applies an MPM that
 * comes from outside, and a transcription of the score's own markings is not one
 * (PARITY.md §9).
 *
 * One converter, one conversion: {@link convert} is not re-entrant, because the object *is*
 * the conversion's working state. Instantiate, call `convert(mei)`, discard.
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
 * 5. walk each `body` with {@link convertElement}, which is where the MSMs get built and
 *    pushed onto {@link movements};
 * 6. restore `ppq` and the MEI document, clean the MSMs, and name them after the source file.
 *
 * Step 5 is the recursive heart: {@link convertElement} looks every MEI element name up in
 * {@link ELEMENT_HANDLERS} and either handles it, descends into it, or skips it. Everything
 * else in this class is a handler for one of those elements (`processNote`,
 * `processMeasure`, …), a builder (`makeMovement`, `makePart`, …), or a shared computation
 * (`getMidiTime`, `computeDuration`, `computePitch`, …).
 *
 * ### Working state: what is a parameter and what is a field
 *
 * - Where the walk is — the part, layer, measure and chord — is {@link WalkContext}, a
 *   parameter threaded down {@link convertElement}, so a method that depends on the enclosing
 *   part says so in its signature.
 * - Which movement is being filled is {@link MovementContext}, reached through
 *   {@link WalkContext.movement}: built once per `mdiv`, read by everything below it, never
 *   changed.
 * - Genuinely sequential state stays a field, because it is an accumulator and not a
 *   position: the deferred lists (`accid`, `endids`, `tstamp2s`, `lyrics`) and
 *   {@link endingCounter}. They exist because MEI lets an element refer forward: an `accid`
 *   applies to notes that come later in the measure, and an `endid`/`tstamp2` closes a span
 *   whose end has not been walked yet. Each is drained at a defined point — `accid` per
 *   measure, `endids`/`tstamp2s` as the referenced elements are met ({@link checkEndid}).
 *   {@link reset} clears exactly these.
 * - The running clock is not a field at all: it is `part/@currentDate`, an attribute on the
 *   MSM output document, advanced by `processNote`/`processChord`/`processRest` and erased by
 *   `msmCleanupSingle` before delivery. See {@link partClock}.
 *
 * The handlers in {@link ELEMENT_HANDLERS} take the converter itself, because the accumulators
 * above are the converter's.
 *
 * ### Parity constraints
 *
 * All timing, duration and pitch arithmetic is compared byte-for-byte against Java-generated
 * MSM/MPM/MIDI references. Expression order, `parseFloat`/`parseInt` choices and rounding are
 * therefore frozen, as is the order in which {@link addUUID} is called. The element dispatch is
 * equally frozen: the {@link Traversal} each {@link ELEMENT_HANDLERS} entry returns encodes
 * which elements are descended into, and moving an element between the traversal groups changes
 * what gets visited.
 *
 * Port of `meico.mei.Mei2MsmMpmConverter`.
 * @author Axel Berndt
 */
export class Mei2MsmMpmConverter {
  private mei: Mei | null = null;
  private readonly ignoreExpansions: boolean = false;
  private readonly cleanup: boolean = true;

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

  protected movements: Msm[] = [];

  /** the MEI being converted, set by {@link convertMei} before anything below it runs */
  private requireMei(): Mei {
    if (this.mei === null) throw new MissingNodeError('no MEI is currently being converted');
    return this.mei;
  }

  /**
   * Java overloads this constructor — `(ppq)` for the default settings, `(ppq, …)` for the full
   * set. Here every setting other than `ppq` is a parameter default, and those defaults are the
   * field initialisers above spelled a second time; the two have to be kept in step.
   */
  constructor(ppq: number, dontUseChannel10 = true, ignoreExpansions = false, cleanup = true) {
    this.ppq = ppq;
    this.dontUseChannel10 = dontUseChannel10;
    this.ignoreExpansions = ignoreExpansions;
    this.cleanup = cleanup;
  }

  /**
   * Converts the provided MEI data into MSM and MPM format and returns a tuplet of lists.
   *
   * Java overloads this name: `convert(Mei)` is the conversion, `convert(Element)` is the
   * recursive walker. The walker is {@link convertElement} here and is private, so this method
   * has one signature and no `instanceof` dispatch.
   */
  convert(mei: Mei): Msm[] {
    return this.convertMei(mei);
  }

  /** the whole conversion, step by step; see the class comment for the outline */
  private convertMei(mei: Mei): Msm[] {
    // Java opens with `if (mei == null)` and closes with two progress banners; neither is
    // reproduced. Nothing can reach the null branch — {@link convert}'s parameter is a
    // non-nullable `Mei` — and the case it was really guarding, a `Mei` with nothing in it, is
    // caught two lines below, where `getMusic()` answers null for exactly that.
    this.mei = mei;

    const music = this.mei.getMusic();
    if (music === null || music.getFirstChildElement('body', music.getNamespaceURI()) === null)
      return [];

    const minPPQ = this.mei.computeMinimalPPQ();
    const originalPPQ = this.ppq;
    if (minPPQ > this.ppq) {
      this.ppq = minPPQ;
      console.error(
        `The specified pulses per quarter note resolution (ppq) is too coarse to capture the shortest duration values in the mei source with integer values. Using the minimal required resolution of ${this.ppq} instead`,
      );
    }

    // The snapshot `cleanup` promises to restore, taken before the three preprocessing passes
    // rewrite the document in place. `getDocument()` is null only for an empty instance and the
    // check above has ruled that out, so the `null` arm of `mapPresent` is unreachable.
    const orig: Document | null = this.cleanup
      ? mapPresent(this.mei.getDocument(), (document) => document.copy())
      : null;

    this.mei.resolveCopyofsAndSameas();
    this.mei.removeRendElements();
    if (!this.ignoreExpansions) this.mei.resolveExpansions();

    // Re-read rather than reusing `music`: `resolveExpansions` replaces the whole `music`
    // element with a regularized copy, so the element tested at the top of this method may no
    // longer be in the tree. Java dereferences the fresh lookup unguarded and would NPE if
    // preprocessing had destroyed it; the throw below is the same control flow, named.
    const preprocessedMusic = this.mei.getMusic();
    if (preprocessedMusic === null)
      throw new MissingNodeError('preprocessing left the MEI without a music element');
    const bodies = preprocessedMusic.getChildElements('body', preprocessedMusic.getNamespaceURI());
    // A `body` holds `mdiv`s and each of those opens its own movement, so the walk starts
    // outside every cursor — see {@link NOTHING_OPEN}.
    for (let b = 0; b < bodies.size(); ++b) this.convertElement(bodies.get(b), NOTHING_OPEN);

    const msms: Msm[] = [...this.movements];

    this.ppq = originalPPQ;

    if (this.cleanup) {
      if (orig !== null) this.mei.setDocument(orig);
      Mei2MsmMpmConverter.msmCleanup(msms);
    }

    const meiFile = this.mei.getFile();
    if (meiFile !== null) {
      // A lone export is named after the source file, a series after the source file plus its
      // 0-based index in that series.
      const stem = getFilenameWithoutExtension(meiFile);
      const exportName = (index: number, count: number, extension: string): string =>
        count === 1 ? `${stem}.${extension}` : `${stem}-${index}.${extension}`;

      msms.forEach((msm, i) => msm.setFile(exportName(i, msms.length, 'msm')));
    }

    return msms;
  }

  /**
   * The element dispatch: MEI element name → what {@link convertElement} does with it.
   *
   * The {@link Traversal} each handler returns splits the 118 known elements four ways:
   * - {@link IGNORE} (53) — no effect on the sounding result: `clef`, `barline`, `annot`, …;
   * - {@link DESCEND} (17) — structural wrappers with no meaning of their own, whose children
   *   are the music: `score`, `staffGrp`, `beam`, `parts`, …;
   * - handler then `'done'` (36) — the handler took over the descent itself, so nothing below
   *   the element is visited by *this* loop: `processMeasure`, `processLayer`, `processNote`, …;
   * - handler then `'descend'` (10) — the handler annotates the element but still wants its
   *   children walked: `processKeySig`, `processScoreDef`, `processOctave`, …. `staffDef` is
   *   not among them: it is `'done'`, because it drives its own descent.
   *
   * Absence from this table is meaningful: an unknown element is skipped whole, not descended
   * into. The set of `'descend'` elements is exactly the set whose children reach the converter
   * through the generic path, so moving an element between the groups silently changes what
   * gets converted; in that sense the table is frozen against the Java reference.
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
   * The performance signs — `tempo`, `dynam`, `hairpin`, `artic`, `slur`, `breath`, `arpeg`,
   * `trill`, `mordent`, `turn` — are all `IGNORE`. They say how the score is played, and the
   * performance comes from outside (PARITY.md §9).
   *
   * The null prototype is load-bearing. On a plain object literal the lookup below inherits
   * from `Object.prototype`, so an element named `valueOf`, `hasOwnProperty`, `isPrototypeOf`,
   * `propertyIsEnumerable`, `toLocaleString` or `__proto__` would resolve to a defined member,
   * fail the `undefined` test and be invoked — throwing, where an unknown element must be
   * skipped. `getLocalName()` strips namespaces, so that is reachable from foreign-namespace or
   * malformed content. `Object.create(null)` makes the lookup miss for every name that is not
   * one of the 118 own keys. The `satisfies` is load-bearing too: without it `Object.assign`
   * drops the contextual typing and all 96 arrow parameters become implicit `any`.
   */
  private static readonly ELEMENT_HANDLERS: Readonly<Record<string, ElementHandler | undefined>> =
    Object.assign(Object.create(null) as Record<string, ElementHandler | undefined>, {
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
      arpeg: IGNORE,
      artic: IGNORE,
      barline: IGNORE,
      beam: DESCEND,
      beamSpan: IGNORE,
      beatRpt: (c, e, ctx) => {
        c.processBeatRpt(e, ctx);
        return 'done';
      },
      bend: IGNORE,
      breath: IGNORE,
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
      dynam: IGNORE,
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
      hairpin: IGNORE,
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
      mordent: IGNORE,
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
      slur: IGNORE,
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
      tempo: IGNORE,
      tie: (c, e, ctx) => {
        c.processTie(e, ctx);
        return 'done';
      },
      timeline: IGNORE,
      trill: IGNORE,
      tuplet: (c, e, ctx) => {
        if (c.processTuplet(e, ctx)) return 'done';
        return 'descend';
      },
      tupletSpan: (c, e, ctx) => {
        c.processTupletSpan(e, ctx);
        return 'done';
      },
      turn: IGNORE,
      unclear: DESCEND,
      uneume: IGNORE,
      verse: DESCEND,
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
   * Start a new movement: build the MSM and the MPM for one `mdiv`, install them as the
   * current output, convert the mdiv's content, then finish the two things that could not be
   * done during the walk.
   *
   * The title is the work title plus the mdiv's `n` and `label`, appended in that order. The
   * movement id is the mdiv's own id, or a fresh `meico_<uuid>` which is written back onto the
   * mdiv so the MSM and the MEI agree.
   *
   * Then it locates this mdiv's `work` element in `meiHead`, which is where a global tempo may
   * live: by `decls` reference if the mdiv has one, else by matching `n`, and trivially if
   * there is exactly one `work`. That lookup only matters for the last step.
   *
   * After the walk, two postponed jobs run:
   * - arpeggios parked on {@link arpeggiosToSort} are ordered by the pitches that are only now
   *   known, ascending or descending per the stored flag, and written back as a
   *   space-separated `#id` list;
   * - the tempo map gets a fallback: if no tempo was found anywhere in the movement, the
   *   `work`'s `tempo` element is used as an initial tempo at date 0. This is why the `work`
   *   lookup above exists.
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

    this.reset();
    this.indexNotesAndChords(mdiv);

    // find the corresponding work element in meiHead; all three branches below have a
    // "no match" path, so `work` stays null unless one of them matches
    let work: Element | null = null;
    const n = mdiv.getAttributeValue('n');
    const declsValue = mdiv.getAttributeValue('decls');
    const decls = declsValue === null ? null : declsValue.split(/\s+/);
    // `getMeiHead()` is null only for an empty MEI, which `convertMei` has already ruled out;
    // the null arms below exist because `firstChildElement`'s typed overload does not take one.
    const meiHead = this.requireMei().getMeiHead();
    let workList = mapPresent(meiHead, (head) => firstChildElement('workList', head));
    if (workList === null && meiHead !== null) workList = firstChildElement('workDesc', meiHead);
    if (workList !== null) {
      const works = allChildElements(workList, 'work');
      switch (works.length) {
        case 0:
          break;
        case 1:
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
    // `isEmpty` is `data === null`, so a non-empty MSM has a document; `getRootElement` is
    // typed for the general case, hence the check.
    const msmRoot = msm.getRootElement();
    if (msmRoot === null)
      throw new MissingNodeError('no MSM movement is currently being converted');

    const movement: MovementContext = { msm: msmRoot, work };

    // a movement begins with nothing else open
    const inMovement: WalkContext = { ...NOTHING_OPEN, movement };
    this.convertElement(mdiv, inMovement);
  }

  /**
   * Fill the movement's global maps from a `scoreDef`. Inside a part — a `scoreDef` nested
   * under an open staff — it is a `staffDef` instead and is handed to
   * {@link processStaffDef}.
   */
  private processScoreDef(scoreDef: Element, ctx: WalkContext): void {
    if (ctx.part !== null) {
      this.processStaffDef(scoreDef, ctx);
      return;
    }

    scoreDef.addAttribute(new Attribute('date', this.getMidiTimeAsString(ctx)));

    let s: Element | null;

    s = this.makeTimeSignature(scoreDef, ctx);
    if (s !== null) {
      addToMap(s, globalDatedMap(ctx, 'timeSignatureMap'));
    }

    s = this.makeKeySignature(scoreDef, ctx);
    if (s !== null) {
      addToMap(s, globalDatedMap(ctx, 'keySignatureMap'));
    }

    // store default values in miscMap
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
   * Open the MSM part a `staffDef` describes, fill its defaults, and walk the `staffDef`'s own
   * children inside it. The part is in force for this subtree and no further.
   *
   * `makePart` is called with the outer `ctx`: it does not read the part it is about to
   * create, and passing `inPart` would be circular.
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
   * {@link accid} is cleared on the way out — see {@link processLayer} for its lifetime.
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
   * {@link accid} is cleared per layer as well as per measure: an accidental in one voice does
   * not carry into another.
   *
   * The layer reaches only its own subtree: the clock bookkeeping after the descent runs under
   * the enclosing context, so the `layer` attribute it writes is not stamped on it.
   */
  private processLayer(layer: Element, ctx: WalkContext): void {
    const oldDate = partClock(requirePart(ctx)).getValue();

    this.convertElement(layer, { ...ctx, layer });

    layer.addAttribute(new Attribute('currentDate', partClock(requirePart(ctx)).getValue()));
    this.accid = [];
    if (getNextSiblingElement('layer', layer) !== null)
      partClock(requirePart(ctx)).setValue(oldDate);
    else {
      const layers = allChildElements(requireParentElement(layer), 'layer');
      // A layer the walk has not reached yet carries no `currentDate`, and `parseFloat` of
      // that is NaN, which loses every `<` comparison and is therefore skipped.
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

    // no preferred child: fall back to the first child of any name
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
   * The ending's number comes from `@n`, else from `@label`, and is reduced to an integer by
   * {@link extractAllIntegersFromString} — so `"1."`, `"1, 2"` and `"1-2"` all yield 1, the
   * first integer found. An ending whose text contains "fine" is given `MAX_SAFE_INTEGER` so it
   * sorts last, and one with no recognisable number gets `MIN_SAFE_INTEGER` and is simply
   * appended in encounter order. Those two sentinels decide the ordering of gotos at one date
   * further down.
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
    // `@n` before `@label`, both optional; `''` when neither is set
    const endingText = orDefault(
      firstPresent(ending.getAttributeValue('n'), ending.getAttributeValue('label')),
      '',
    );
    if (endingText.toLowerCase().includes('fine')) n = Number.MAX_SAFE_INTEGER;
    else {
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

    // `source` is the MEI element a Goto was read from; there is none here because this goto is
    // synthesised, and Goto only ever stores the field, never reads it, so null is safe.
    const gotoObj = Goto.fromValues(
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
   * - before: parked {@link tstamp2s} are counted down one measure. `tstamp2` is written
   *   `<measures>m+<beat>`, so each measure boundary decrements the count and only the entry
   *   that reaches zero resolves to a `date.end` here;
   * - before: {@link reorderMeasureContent} hoists control events ahead of the staves;
   * - after: {@link accid} is cleared, because MEI accidentals last exactly one measure.
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
    // countdown below, which resolves a parked span against this measure's `date`. The tail
    // after the descent runs under `ctx` again.
    const inMeasure: WalkContext = { ...ctx, measure };

    // Both halves of the `m+` split are in range by construction: an entry is only parked when
    // `computeControlEventTiming` saw at least two parts (a one-part `tstamp2` resolves there
    // and is never parked), and the rewrite below puts the separator back.
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
        partsTsMapAndTs.set(part, { key: tsMap, value: ts });
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
      const tsMap = tsData.key;
      // The entry exists only where a `timeSignature` was actually found (see the loop that
      // fills `partsTsMapAndTs` above), so the pair's value is an element whenever the
      // `undefined` test above lets us through.
      const ts = tsData.value;

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

    // Barlines, left before right: `barline2SequencingCommand` draws UUIDs, so the order the
    // two guards run in is part of the compared output.
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

    // `@ploc`, else the parent note's `@pname`, else its `@pname.ges` unless that says "none";
    // anything else and the accidental has no pitch to attach to and is dropped.
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
   * A `staffDef` without `n` gets a negative number derived from the current part count, and
   * it is written back onto the MEI, so synthetic numbers can never collide with real staff
   * numbers.
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
      // The previous part's channel and port. `Msm.makePartFromString` writes both on every
      // part this converter creates, so a part without them is a broken MSM rather than an
      // encoding to tolerate.
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

    return part;
  }

  /**
   * Build an MSM `timeSignature` from a `scoreDef`/`staffDef`/`meterSig`, reading `count`
   * and `unit` or their `meter.`-prefixed forms.
   *
   * MEI allows additive meters such as `"3+2+2"`, so the character loop over `count` sums
   * every numeric run it finds: `3+2+2` becomes 7. Any non-numeric separator works, and a
   * `count` with no digits at all sums to 0.
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
      // `str` is nullable on purpose: the test above accepts either spelling, so a `meterSig`
      // carrying only `@meter.sym` reaches this line and `getAttributeValue('sym')` returns
      // null. Both comparisons below then fail and the method returns null.
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
      // `key.sig` decides whether there is a key signature at all
      const keySig = meiSource.getAttributeValue('key.sig');
      if (keySig === null) return null;
      sig = keySig;
      mixed = orDefault(meiSource.getAttributeValue('key.sig.mixed'), '');
    } else if (meiSource.getLocalName() === 'keySig') {
      sig = orDefault(meiSource.getAttributeValue('sig'), '');
      mixed = orDefault(meiSource.getAttributeValue('sig.mixed'), '');

      const accids = meiSource.getChildElements('keyAccid');
      for (let i = 0; i < accids.size(); ++i) {
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
        // The first `|accidCount|` entries of the circle in the matching direction are exactly
        // the key's accidentals; see {@link CIRCLE_OF_FIFTHS_SHARPWARD}.
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

    // marks the chord so `processNote` mints ids for its members: an anonymous note in an
    // articulated chord reaches the MSM with an `xml:id` and the reference expects it there.
    if (chord.query("descendant::*[local-name()='artic']").size() > 0)
      chord.addAttribute(new Attribute('hasArticulations', 'true'));

    this.convertElement(chord, inChord);
    // The clock advances once, for the outermost chord only: an inner chord's notes sound
    // within their parent's span, so they must not move it a second time.
    if (ctx.chord === null) {
      advancePartClock(ctx.part, dur);
    }
  }

  /**
   * Handle a `tuplet` that carries its own `dur`, i.e. one that states its total length
   * rather than leaving it to be derived from its contents.
   *
   * @return true if it was handled here, in which case the caller must not descend again —
   *   this method already walked the children; false to let {@link convertElement}'s generic
   *   descent take over, which is the normal case. The tuplet ratio itself is applied per note
   *   inside {@link computeDuration}, not here.
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
   * Layer filtering here is inverted relative to {@link isSameLayer}: an empty current layer
   * copies everything, otherwise only entries whose `layer` matches exactly.
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
      // Unreachable: the guard at the top of the method has already returned for a missing
      // `@dis`. Named alongside the default because that is where a reader asks.
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
   * 5. advance the part clock only when not inside a chord — chord members all start together,
   *    and the chord itself moves the clock once;
   * 6. write `pnum`, `date` and `midi.dur` back onto the *MEI* element as well, because later
   *    references (arpeggio ordering, `startid` lookups) read them from there.
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

    const date = this.getMidiTime(ctx);
    const s = new Element('note');
    copyId(note, s);
    s.addAttribute(new Attribute('date', String(date)));

    const pitchdata: string[] = [];
    const pitch = this.computePitch(note, pitchdata, ctx);
    if (pitch === -1) return;
    s.addAttribute(new Attribute('midi.pitch', String(pitch)));
    // `computePitch` returns the pitch and reports the spelling — name, accidental, octave —
    // by appending three strings to `pitchdata`. It appends all three or none, the only early
    // return being the `-1` handled on the line above, so the three reads are in range.
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
    // the note's own `@tie`, else the enclosing chord's
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
        // The note this tie continues, looked for from the end of the part's score backwards:
        // the first one at the same pitch that ends exactly where this one starts.
        // {@link reverseDescendantElements} is lazy and `.find` stops pulling at the first hit,
        // so a tie whose partner is the note just before it costs one step. Materialising the
        // walk instead makes this quadratic in the notes converted so far.
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
   * Clear the per-movement deferred state, so a second `mdiv` starts from nothing.
   *
   * Two lines are belt-and-braces: `allNotesAndChords.clear()` is redundant, because
   * {@link indexNotesAndChords} clears the map before filling it, and `accid = []` cannot
   * matter across movements, because {@link processMeasure}, {@link processLayer},
   * {@link processStaff} and {@link processStaffDef} each clear it on the way out. `lyrics` is
   * the one line with no test: the queue is filled and drained inside a single
   * {@link processNote}, so a leak needs the tie-merge path that returns before the drain.
   */
  protected reset(): void {
    this.endingCounter = 0;
    this.accid = [];
    this.endids = [];
    this.tstamp2s = [];
    this.lyrics = [];
    this.allNotesAndChords.clear();
  }

  /**
   * Build the id → element index that `startid`, `endid` and `plist` references resolve
   * against. Only `note` and `chord` elements with an `xml:id` are indexed: an element without
   * one cannot be referenced, so it cannot be a target.
   *
   * Run once per movement, before the walk, because MEI references point forward as readily as
   * backward — {@link computeControlEventTiming} depends on being able to find a note the
   * traversal has not reached yet.
   *
   * The descent is pre-order and must stay that way: the index is last-one-wins, so two
   * elements sharing an `xml:id` resolve to whichever comes later in the document.
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
   * {@link getMidiTimeAsString} is the same decision returning the attribute's string. It is
   * not `String(getMidiTime())`: for the first two cases it hands back the stored text
   * verbatim, so `"0.0"` stays `"0.0"` instead of becoming `"0"`. MSM attribute text is
   * byte-compared against the Java reference, so the two must stay separate.
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
   * "In force" means the last entry of the map, not the last one at or before the current
   * date — the maps are built in document order as the walk proceeds, so their final entry is
   * the most recent one seen. That holds only while the conversion is running forward through
   * the score, which is why this is not a general lookup.
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
    // The empty string is the miss this screens for: `getAttributeValue` hands back `''` for an
    // absent attribute, and every caller reads the id that way.
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

  /**
   * The position of the first parked span whose `endid` is `id`, or `-1` — Java's contract.
   *
   * An index walk rather than a `findIndex`: {@link checkEndid} calls this for every element of
   * the score, so a predicate closure would be one allocation per element on the converter's
   * hottest path.
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
    // The `-1` from `getEndid` is safe to pass straight to `removeAt`: a bare
    // `splice(-1, 1)` would remove the *last* entry, so the bounds test lives inside the
    // helper, which answers null instead.
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
   * Convert an MEI `tstamp` — a 1-based beat number within the current measure, where the beat
   * unit is the time signature's denominator — into an absolute MSM tick.
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
   * Works out when a control event (dynamics, tempo, slur, arpeggio, pedal, …) starts and
   * ends, in MSM ticks. The one routine every control-event handler funnels through, which is
   * why they all begin with the same four-line destructuring.
   *
   * The start date comes from `tstamp.ges` if present, else `tstamp`. If neither exists the
   * event has no timing of its own and must borrow it from the note it points at: the event is
   * moved in the MEI tree to sit immediately before that note (`startid`, or the first entry of
   * `plist`), marked `dontRepositionMeAgain`, and null is returned so the caller gives up for
   * now — the walk will reach the event again in its new position, where `getMidiTime()` yields
   * the right date. That marker attribute stops the move from repeating forever, and
   * {@link msmCleanupSingle} strips it afterwards.
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
        // `<measures>m+<beat>`. The length tests below are the bounds proof for the two reads:
        // the one-part form has a part 0, and reaching the `'0'` test means there are at least
        // two.
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
   * 1. Base value. From `dur` on the element; failing that, from the enclosing `chord`'s
   *    `dur`; failing that, from the nearest applicable `dur.default` recorded in the part's
   *    `miscMap` (falling back to the global one), matched by layer. `breve` and `long` are
   *    special-cased to 8 and 16 quarters because they are words, not divisors; everything else
   *    is `4 * ppq / parseInt(dur)`. `focus` is set alongside the base value and the later
   *    stages read dots from `focus`, not from `ofThis`, so a note inheriting its `dur` from
   *    its chord inherits the chord's dots too.
   * 2. Dots. Each dot adds half of what the previous step added, accumulated in a running `d`,
   *    not recomputed as `dur * (2 - 2^-n)`. `childDots` is honoured as well; it is how a chord
   *    records dots that live on its children.
   * 3. Tuplets by nesting. Walk the MEI ancestors up to the `mdiv` and, for every `tuplet` on
   *    the way, scale by `numbase / num`. Nested tuplets therefore multiply. A `tuplet` missing
   *    either attribute makes the whole duration 0 rather than being skipped — Java does the
   *    same.
   * 4. Tuplets by span. `tupletSpan` elements apply to elements that are not inside a `tuplet`,
   *    so they are kept in a `tupletSpanMap` and matched by date and layer here. Expired spans
   *    (`date.end` already passed) are deleted from the map as a side effect of this walk,
   *    which is why it runs backwards and why this method is not free of effects.
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

    // Backwards, and the direction is arithmetic: `dur` accumulates by multiplication and
    // floating-point multiplication is not associative, so visiting the spans in the other
    // order would change the last bits of every tuplet duration. An index walk rather than
    // `for..of` over a reversed copy, which measured 4% slower on a 2000-note score
    // (`scripts/bench.mjs`); this runs once per note.
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
   * MEI's `pname.ges`, `oct.ges` and `accid.ges` are the gestural (sounding) values; the
   * unsuffixed ones are what is written on the page. Wherever both exist the gestural one wins,
   * and a gestural value also suppresses the work that would have derived it: `accid.ges`
   * clears `checkKeySign`, and having both `pname.ges` and `oct.ges` skips the entire
   * transposition section, because a gestural pitch is already transposed by definition.
   *
   * ### Where each component comes from
   *
   * - pitch name: `pname.ges` (unless `'none'`), else `pname`; no pname at all means this is
   *   not a pitched note and -1 is returned;
   * - octave: `oct.ges`, else `oct`, else the nearest layer-matching `oct.default` from the
   *   part's `miscMap` (global as fallback). When it has to fall back this far it writes the
   *   resolved `oct` back onto the MEI element, so later passes see it;
   * - accidental, in four escalating steps: `accid.ges`; else `accid`; else the most recent
   *   {@link accid} entry in this measure for the same pname *and* octave — MEI accidentals
   *   are octave-specific here; else the key signature.
   *
   * ### Key signature resolution
   *
   * Part-local before global, but only if the local one is not older: a global key signature
   * dated later than the local one wins, and is then copied into the local map so subsequent
   * notes in this part find it directly. An accidental in the key signature matches by pitch
   * class (`pname2midi(pname) % 12`) against the entry's `midi.pitch` or `pitchname`.
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
   * @param pitchdata out-parameter, appended to: `[pitchname, accidental, octave]`
   * @return the MIDI pitch, or -1 if `ofThis` carries no pitch name
   */
  protected computePitch(ofThis: Element, pitchdata: string[], ctx: WalkContext): number {
    let pname: string;
    let accid = '';
    const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
    let oct = 0.0;
    let trans = 0;
    let checkKeySign = false;

    // `.ges` ("gestural", i.e. as performed) wins over the written spelling for all three of
    // pitch name, octave and accidental.
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
        // The most recent accidental in this measure on the same pitch and octave. Java's
        // extra `getAttribute('pname') !== null` test is subsumed: `pname` is a `string`, and a
        // candidate without the attribute answers `null`, which equals no string.
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
   * The root element is required rather than guarded: a guard would turn an empty MSM from a
   * thrown error into a silent no-op (ARCHITECTURE.md RULE N2a).
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

  /** the working attributes {@link msmScaffolding} strips, wherever they occur */
  private static readonly MSM_SCAFFOLDING_ATTRIBUTES = [
    'currentDate',
    'tie',
    'layer',
    'endid',
    'tstamp2',
  ] as const;

  /**
   * Every node {@link msmCleanupSingle} has to remove, in document order: each `miscMap`
   * element, the working attributes of {@link MSM_SCAFFOLDING_ATTRIBUTES} wherever they occur,
   * and a `goto`'s `n`. `root` itself is excluded, and the walk descends into `miscMap` rather
   * than stopping at it.
   *
   * The list is a snapshot taken before any removal, and the removals are independent of one
   * another and of order: removing an attribute affects no other node, and removing an element
   * leaves its subtree intact, so an attribute inside a removed `miscMap` is still removed from
   * its now-detached owner.
   *
   * Attributes are matched on local name. MSM carries no namespaced attribute but `xml:id`, and
   * none of the five scaffolding names is ever prefixed.
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

  /**
   * Move everything in a measure that is not staff content to the front.
   *
   * Control events (`dynam`, `tempo`, `dir`, `slur`, …) are commonly encoded after the staves
   * they apply to, but the converter is a single forward pass: a dynamic must be seen before
   * the notes it colours, or it would be dated after them. Hoisting every subtree with no
   * `staff`/`oStaff` inside it to position 0 gives the walk that order.
   *
   * The backwards loop combined with `insertChild(subtree, 0)` preserves the relative order of
   * the hoisted elements; walking forwards would reverse them.
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
   * Not implemented — always 0. Java computes a semitone offset from the `clef.dis` and
   * `clef.dis.place` attributes here; this port does not, so a displaced clef is converted as
   * an undisplaced one. Latent for the fixture corpus, which contains no `clef.dis`. Left as a
   * stub rather than removed so the gap stays visible at the two `trans += processClefDis()`
   * call sites.
   *
   * Java's signature is `private static double processClefDis(Element scoreStaffDef)`; the
   * parameter is dropped here because nothing reads it, and whoever implements the method adds
   * it back with the code that does.
   */
  protected static processClefDis(): number {
    return 0.0;
  }

  /**
   * Does `e` apply to the layer `layerId`? The voice filter used throughout the converter.
   *
   * `e`'s `layer` attribute may name several layers, space separated. An element with no
   * `layer` attribute applies everywhere, and an empty `layerId` — what {@link Mei.getLayerId}
   * returns for unlayered music — matches everything, so the filter is inert on scores that do
   * not use layers at all.
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

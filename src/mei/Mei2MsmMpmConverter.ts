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
  getAttributeValue,
  getNextSiblingElement,
  parentElement,
} from '../xml/tree.js';
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
import { Part as MpmPart } from '../mpm/elements/Part.js';
import { GenericMap } from '../mpm/elements/maps/GenericMap.js';
import { TempoMap } from '../mpm/elements/maps/TempoMap.js';
import { DynamicsMap } from '../mpm/elements/maps/DynamicsMap.js';
import { ArticulationMap } from '../mpm/elements/maps/ArticulationMap.js';
import { OrnamentationMap } from '../mpm/elements/maps/OrnamentationMap.js';
import { TempoStyle } from '../mpm/elements/styles/TempoStyle.js';
import { DynamicsStyle } from '../mpm/elements/styles/DynamicsStyle.js';
import { ArticulationStyle } from '../mpm/elements/styles/ArticulationStyle.js';
import { OrnamentationStyle } from '../mpm/elements/styles/OrnamentationStyle.js';
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
 * One entry of {@link Mei2MsmMpmConverter.ELEMENT_HANDLERS}.
 *
 * Handlers are free functions rather than methods so the table can be a single static
 * value; they receive the converter explicitly because the conversion state *is* the
 * converter (see the class comment on the cursor fields).
 */
type ElementHandler = (c: Mei2MsmMpmConverter, e: Element) => Traversal;

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
 * ### Working state, and why it is a field
 *
 * The `current*` fields are a cursor into the MEI tree: the mdiv, part, layer, measure and
 * chord the walk is currently inside, plus the MSM movement and MPM performance being
 * filled. {@link reset} clears them per movement. Java keeps the same state on a `Helper`
 * instance; this port hoisted it onto the converter, which is why the port's `Helper` held
 * no state at all — and is why T14 could dissolve it into plain modules. **The cursor stays
 * one object on purpose**: ARCHITECTURE.md §8.5 rules that splitting it into context objects
 * is out of scope, because `reset()`'s semantics and the drain points of the deferred lists
 * below are subtle and the fixture suite cannot prove a change in a field's lifetime. This is
 * also why the handlers in {@link ELEMENT_HANDLERS} take the converter itself: the conversion
 * state *is* the converter.
 *
 * The deferred lists (`accid`, `endids`, `tstamp2s`, `lyrics`, `arpeggiosToSort`) exist
 * because MEI lets an element refer forward: an `accid` applies to notes that come later
 * in the measure, an `endid`/`tstamp2` closes a span whose end has not been walked yet,
 * and an arpeggio's note order is not known until every note it names has a pitch. Each is
 * drained at a defined point — `accid` per measure, `endids`/`tstamp2s` as the referenced
 * elements are met ({@link checkEndid}), `arpeggiosToSort` at the end of the movement.
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

  // --- cursor into the MEI tree and the output being built; see the class comment ---
  protected currentMsmMovement: Element | null = null;
  protected currentMdiv: Element | null = null;
  protected currentWork: Element | null = null;
  protected currentPart: Element | null = null;
  protected currentLayer: Element | null = null;
  protected currentMeasure: Element | null = null;
  protected currentChord: Element | null = null;

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

  protected currentPerformance: Performance | null = null;
  protected movements: Msm[] = [];
  protected performances: Mpm[] = [];

  /**
   * constructor with default settings
   */
  constructor(ppq: number);
  /**
   * constructor with fully specified settings
   */
  constructor(
    ppq: number,
    dontUseChannel10: boolean,
    ignoreExpansions: boolean,
    cleanup: boolean,
    expandOrnaments?: boolean,
  );
  constructor(
    ppq: number,
    dontUseChannel10?: boolean,
    ignoreExpansions?: boolean,
    cleanup?: boolean,
    expandOrnaments?: boolean,
  ) {
    this.ppq = ppq;
    this.dontUseChannel10 = dontUseChannel10 ?? true;
    this.ignoreExpansions = ignoreExpansions ?? false;
    this.cleanup = cleanup ?? true;
    this.expandOrnaments = expandOrnaments ?? false;
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
    if (mei === null) {
      console.log('\nThe provided MEI object is null and cannot be converted.');
      return new KeyValue<Msm[], Mpm[]>([], []);
    }

    const startTime = Date.now();
    console.log(
      `\nConverting ${mei.getFile() !== null ? mei.getFile() : 'MEI data'} to MSM and MPM.`,
    );

    this.mei = mei;

    if (
      this.mei.isEmpty() ||
      this.mei.getMusic() === null ||
      this.mei.getMusic()!.getFirstChildElement('body', this.mei.getMusic()!.getNamespaceURI()) ===
        null
    )
      return new KeyValue<Msm[], Mpm[]>([], []);

    const minPPQ = this.mei.computeMinimalPPQ();
    const originalPPQ = this.ppq;
    if (minPPQ > this.ppq) {
      this.ppq = minPPQ;
      console.log(
        `The specified pulses per quarter note resolution (ppq) is too coarse to capture the shortest duration values in the mei source with integer values. Using the minimal required resolution of ${this.ppq} instead`,
      );
    }

    let orig: Document | null = null;
    if (this.cleanup) orig = this.mei.getDocument()!.copy();

    this.mei.resolveCopyofsAndSameas();
    this.mei.removeRendElements();
    if (!this.ignoreExpansions) this.mei.resolveExpansions();

    const bodies = this.mei
      .getMusic()!
      .getChildElements('body', this.mei.getMusic()!.getNamespaceURI());
    for (let b = 0; b < bodies.size(); ++b) this.convertElement(bodies.get(b));

    const msms: Msm[] = [...this.movements];
    const mpms: Mpm[] = [...this.performances];

    Mei2MsmMpmConverter.mpmPostprocessing(mpms);

    this.ppq = originalPPQ;

    if (this.cleanup) {
      this.mei.setDocument(orig!);
      Mei2MsmMpmConverter.msmCleanup(msms);
    }

    if (this.mei.getFile() !== null) {
      if (msms.length === 1)
        msms[0].setFile(`${getFilenameWithoutExtension(this.mei.getFile()!)}.msm`);
      else {
        for (let i = 0; i < msms.length; ++i) {
          msms[i].setFile(`${getFilenameWithoutExtension(this.mei.getFile()!)}-${i}.msm`);
        }
      }
      if (mpms.length === 1) {
        mpms[0].setFile(`${getFilenameWithoutExtension(this.mei.getFile()!)}.mpm`);
        const msmRelatedResource = RelatedResource.createRelatedResource(msms[0].getFile()!, 'msm');
        if (msmRelatedResource !== null)
          mpms[0].getMetadata()?.addRelatedResource(msmRelatedResource);
      } else {
        for (let i = 0; i < mpms.length; ++i) {
          mpms[i].setFile(`${getFilenameWithoutExtension(this.mei.getFile()!)}-${i}.mpm`);
        }
      }
    }

    console.log(
      `MEI to MSM/MPM conversion finished. Time consumed: ${Date.now() - startTime} milliseconds`,
    );

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
      accid: (c, e) => {
        c.processAccid(e);
        return 'done';
      },
      add: DESCEND,
      anchorText: IGNORE,
      annot: IGNORE,
      app: (c, e) => {
        c.processApp(e);
        return 'done';
      },
      arpeg: (c, e) => {
        c.processArpeg(e);
        return 'done';
      },
      artic: (c, e) => {
        c.processArtic(e);
        return 'done';
      },
      barline: IGNORE,
      beam: DESCEND,
      beamSpan: IGNORE,
      beatRpt: (c, e) => {
        c.processBeatRpt(e);
        return 'done';
      },
      bend: IGNORE,
      breath: (c, e) => {
        c.processBreath(e);
        return 'done';
      },
      bTrem: (c, e) => {
        c.processChord(e);
        return 'done';
      },
      caesura: IGNORE,
      choice: (c, e) => {
        c.processChoice(e);
        return 'done';
      },
      chord: (c, e) => {
        if (e.getAttribute('grace') !== null) return 'done';
        c.processChord(e);
        return 'done';
      },
      chordTable: IGNORE,
      clef: IGNORE,
      clefGrp: IGNORE,
      corr: DESCEND,
      curve: IGNORE,
      custos: IGNORE,
      damage: IGNORE,
      del: (c, e) => {
        c.processDel(e);
        return 'done';
      },
      dir: IGNORE,
      div: IGNORE,
      dot: (c, e) => {
        c.processDot(e);
        return 'done';
      },
      dynam: (c, e) => {
        c.processDynam(e);
        return 'done';
      },
      ending: (c, e) => {
        c.processEnding(e);
        return 'done';
      },
      expan: DESCEND,
      expansion: IGNORE,
      fermata: IGNORE,
      fTrem: (c, e) => {
        c.processChord(e);
        return 'done';
      },
      gap: IGNORE,
      gliss: IGNORE,
      grpSym: IGNORE,
      hairpin: (c, e) => {
        c.processDynam(e);
        return 'done';
      },
      halfmRpt: (c, e) => {
        c.processHalfmRpt(e);
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
      keySig: (c, e) => {
        c.processKeySig(e);
        return 'descend';
      },
      label: IGNORE,
      layer: (c, e) => {
        c.processLayer(e);
        return 'done';
      },
      layerDef: (c, e) => {
        c.processLayerDef(e);
        return 'descend';
      },
      lb: IGNORE,
      lem: IGNORE,
      line: IGNORE,
      lyrics: DESCEND,
      mdiv: (c, e) => {
        c.makeMovement(e);
        return 'done';
      },
      measure: (c, e) => {
        c.processMeasure(e);
        return 'done';
      },
      mensur: IGNORE,
      meterSig: (c, e) => {
        c.processMeterSig(e);
        return 'descend';
      },
      meterSigGrp: DESCEND,
      midi: IGNORE,
      mordent: (c, e) => {
        c.processOrnamentSign(e);
        return 'done';
      },
      mRest: (c, e) => {
        c.processMeasureRest(e);
        return 'done';
      },
      mRpt: (c, e) => {
        c.processMRpt(e);
        return 'descend';
      },
      mRpt2: (c, e) => {
        c.processMRpt2(e);
        return 'descend';
      },
      mSpace: (c, e) => {
        c.processMeasureRest(e);
        return 'done';
      },
      multiRest: (c, e) => {
        c.processMultiRest(e);
        return 'done';
      },
      multiRpt: (c, e) => {
        c.processMultiRpt(e);
        return 'descend';
      },
      note: (c, e) => {
        c.processNote(e);
        return 'done';
      },
      octave: (c, e) => {
        c.processOctave(e);
        return 'descend';
      },
      oLayer: (c, e) => {
        c.processLayer(e);
        return 'done';
      },
      orig: DESCEND,
      ossia: IGNORE,
      oStaff: (c, e) => {
        c.processStaff(e);
        return 'done';
      },
      parts: DESCEND,
      part: DESCEND,
      pb: IGNORE,
      pedal: (c, e) => {
        c.processPedal(e);
        return 'done';
      },
      pgFoot: IGNORE,
      pgFoot2: IGNORE,
      pgHead: IGNORE,
      pgHead2: IGNORE,
      phrase: (c, e) => {
        c.processPhrase(e);
        return 'done';
      },
      proport: IGNORE,
      rdg: IGNORE,
      reg: DESCEND,
      reh: (c, e) => {
        c.processReh(e);
        return 'done';
      },
      rend: IGNORE,
      rest: (c, e) => {
        c.processRest(e);
        return 'done';
      },
      restore: (c, e) => {
        c.processRestore(e);
        return 'descend';
      },
      sb: IGNORE,
      scoreDef: (c, e) => {
        c.processScoreDef(e);
        return 'descend';
      },
      score: DESCEND,
      section: (c, e) => {
        c.processSection(e);
        return 'done';
      },
      sic: DESCEND,
      space: (c, e) => {
        c.processSpace(e);
        return 'done';
      },
      slur: (c, e) => {
        c.processSlur(e);
        return 'done';
      },
      stack: IGNORE,
      staff: (c, e) => {
        c.processStaff(e);
        return 'done';
      },
      staffDef: (c, e) => {
        c.processStaffDef(e);
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
      tempo: (c, e) => {
        c.processTempo(e);
        return 'done';
      },
      tie: (c, e) => {
        c.processTie(e);
        return 'done';
      },
      timeline: IGNORE,
      trill: (c, e) => {
        c.processOrnamentSign(e);
        return 'done';
      },
      tuplet: (c, e) => {
        if (c.processTuplet(e)) return 'done';
        return 'descend';
      },
      tupletSpan: (c, e) => {
        c.processTupletSpan(e);
        return 'done';
      },
      turn: (c, e) => {
        c.processOrnamentSign(e);
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
  private convertElement(root: Element): void {
    const es = root.getChildElements();

    for (let i = 0; i < es.size(); ++i) {
      const e = es.get(i);

      this.checkEndid(e);

      const handler = Mei2MsmMpmConverter.ELEMENT_HANDLERS[e.getLocalName()];
      if (handler === undefined) continue;
      if (handler(this, e) === 'descend') this.convertElement(e);
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
    let titleString = this.mei!.getTitle();
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

    // `RelatedResource.createRelatedResource` reports failure with null, and
    // `Mpm.addMetadata` now says it accepts such an array (T16 closed T10's DISCOVERED
    // note by widening the consumer, which is what retired this file's `any`).
    const relatedResources: (RelatedResource | null)[] = [];
    const meiFile = this.mei!.getFile();
    if (meiFile !== null) {
      relatedResources.push(RelatedResource.createRelatedResource(meiFile, 'mei'));
      const comment = Comment.createComment(
        `This MPM has been generated from '${meiFile}' using the meico MEI converter v${VERSION}.`,
        null,
      );
      mpm.addMetadata(Author.createAuthor('meico', null, null), comment, relatedResources);
    } else {
      const comment = Comment.createComment(
        `This MPM has been generated from MEI code using the meico MEI converter v${VERSION}.`,
        null,
      );
      mpm.addMetadata(Author.createAuthor('meico', null, null), comment, null);
    }

    const performance = Performance.createPerformance('MEI export performance');
    if (performance === null) {
      console.error(`Failed to generate an instance of Performance. Skipping mdiv ${titleString}`);
      return;
    }
    performance.setPulsesPerQuarter(this.ppq);
    mpm.addPerformance(performance);
    this.performances.push(mpm);

    this.reset();
    this.currentMdiv = mdiv;
    this.currentMsmMovement = msm.getRootElement();
    this.currentPerformance = performance;
    this.indexNotesAndChords(this.currentMdiv);

    // find the corresponding work element in meiHead
    const n = mdiv.getAttribute('n') === null ? null : mdiv.getAttributeValue('n');
    const decls =
      mdiv.getAttribute('decls') === null ? null : mdiv.getAttributeValue('decls')!.split(/\s+/);
    let workList = firstChildElement('workList', this.mei!.getMeiHead()!);
    if (workList === null) workList = firstChildElement('workDesc', this.mei!.getMeiHead()!);
    if (workList !== null) {
      const works = allChildElements(workList, 'work');
      switch (works.length) {
        case 0:
          break;
        case 1:
          this.currentWork = works[0];
          break;
        default: {
          if (decls !== null) {
            for (const work of works) {
              const workId = getAttributeValue('id', work);
              let found = false;
              for (const decl of decls) {
                if (decl.substring(1) === workId) {
                  this.currentWork = work;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
          }
          if (this.currentWork === null && n !== null) {
            for (const work of works) {
              if (n === getAttributeValue('n', work)) {
                this.currentWork = work;
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
    this.convertElement(mdiv);

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
    let globalTempoMap = this.currentPerformance?.getGlobal()?.getDated()?.getMap(Mpm.TEMPO_MAP) as
      TempoMap | null | undefined;
    if (
      (globalTempoMap === null ||
        globalTempoMap === undefined ||
        globalTempoMap.getElementBeforeAt(0.0) === null) &&
      this.currentWork !== null
    ) {
      const tempo = firstChildElement('tempo', this.currentWork);
      if (tempo !== null) {
        const tempoData = this.parseTempo(tempo, null);
        if (tempoData !== null) {
          if (globalTempoMap === null || globalTempoMap === undefined) {
            globalTempoMap = this.currentPerformance
              ?.getGlobal()
              ?.getDated()
              ?.addMap(TempoMap.createTempoMap()) as TempoMap | null | undefined;

            if (
              this.currentPerformance
                ?.getGlobal()
                ?.getHeader()
                ?.getAllStyleTypes()
                ?.get(Mpm.TEMPO_STYLE) !== null
            )
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
  private processScoreDef(scoreDef: Element): void {
    if (this.currentPart !== null) {
      this.processStaffDef(scoreDef);
      return;
    }

    scoreDef.addAttribute(new Attribute('date', this.getMidiTimeAsString()));

    let s: Element | null;

    // time signature
    s = this.makeTimeSignature(scoreDef);
    if (s !== null) {
      addToMap(
        s,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('timeSignatureMap'),
      );
    }

    // key signature
    s = this.makeKeySignature(scoreDef);
    if (s !== null) {
      addToMap(
        s,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('keySignatureMap'),
      );
    }

    // store default values in miscMap
    if (scoreDef.getAttribute('dur.default') !== null) {
      const d = new Element('dur.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      d.addAttribute(new Attribute('dur', scoreDef.getAttributeValue('dur.default')!));
      copyId(scoreDef, d);
      addToMap(
        d,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap'),
      );
    }

    if (scoreDef.getAttribute('octave.default') !== null) {
      const d = new Element('oct.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      d.addAttribute(new Attribute('oct', scoreDef.getAttributeValue('octave.default')!));
      copyId(scoreDef, d);
      addToMap(
        d,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap'),
      );
    }

    {
      let trans = 0;
      trans =
        scoreDef.getAttribute('trans.semi') === null
          ? 0.0
          : parseFloat(scoreDef.getAttributeValue('trans.semi')!);
      trans += Mei2MsmMpmConverter.processClefDis(scoreDef);
      const d = new Element('transposition');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      d.addAttribute(new Attribute('semi', String(trans)));
      copyId(scoreDef, d);
      addToMap(
        d,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap'),
      );
    }

    addToMap(
      cloneElement(scoreDef),
      this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('miscMap'),
    );
  }

  private processStaffDef(staffDef: Element): void {
    const parentPart = this.currentPart;
    this.currentPart = this.makePart(staffDef);

    staffDef.addAttribute(new Attribute('date', this.getMidiTimeAsString()));

    let t = this.makeTimeSignature(staffDef);
    if (t !== null) {
      addToMap(
        t,
        this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('timeSignatureMap'),
      );
    }

    t = this.makeKeySignature(staffDef);
    if (t !== null) {
      addToMap(
        t,
        this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('keySignatureMap'),
      );
    }

    if (staffDef.getAttribute('dur.default') !== null) {
      const d = new Element('dur.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      d.addAttribute(new Attribute('dur', staffDef.getAttributeValue('dur.default')!));
      copyId(staffDef, d);
      addToMap(d, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('miscMap'));
    }

    if (staffDef.getAttribute('octave.default') !== null) {
      const d = new Element('oct.default');
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      d.addAttribute(new Attribute('oct', staffDef.getAttributeValue('octave.default')!));
      copyId(staffDef, d);
      addToMap(d, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('miscMap'));
    }

    {
      let trans = 0;
      trans =
        staffDef.getAttribute('trans.semi') === null
          ? 0.0
          : parseFloat(staffDef.getAttributeValue('trans.semi')!);
      trans += Mei2MsmMpmConverter.processClefDis(staffDef);
      const d = new Element('transposition');
      d.addAttribute(new Attribute('semi', String(trans)));
      d.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
      copyId(staffDef, d);
      addToMap(d, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('miscMap'));
    }

    addToMap(
      cloneElement(staffDef),
      this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('miscMap'),
    );

    this.convertElement(staffDef);
    this.accid = [];
    this.currentPart = parentPart;
  }

  private processStaff(staff: Element): void {
    let ref = staff.getAttribute('def');
    if (ref === null) ref = staff.getAttribute('n');
    const s = this.getPart(ref === null ? '' : ref.getValue());
    const parentPart = this.currentPart;

    if (s !== null) {
      s.addAttribute(new Attribute('currentDate', this.getMidiTimeAsString()));
      this.currentPart = s;
    } else {
      console.log(
        `There is an undefined staff element in the score with no corresponding staffDef.\n${staff.toXML()}\nGenerating a new part for it.`,
      );
      this.currentPart = this.makePart(staff);
    }

    this.convertElement(staff);
    this.accid = [];
    this.currentPart = parentPart;
  }

  private processLayerDef(layerDef: Element): void {
    layerDef.addAttribute(new Attribute('date', this.getMidiTimeAsString()));

    if (layerDef.getAttribute('dur.default') !== null) {
      const d = new Element('dur.default');
      this.currentPart!.getFirstChildElement('dated')!
        .getFirstChildElement('miscMap')!
        .appendChild(d);
      d.addAttribute(new Attribute('dur', layerDef.getAttributeValue('dur.default')!));
      copyId(layerDef, d);
      this.addLayerAttribute(d);
    }

    if (layerDef.getAttribute('octave.default') !== null) {
      const d = new Element('oct.default');
      this.currentPart!.getFirstChildElement('dated')!
        .getFirstChildElement('miscMap')!
        .appendChild(d);
      d.addAttribute(new Attribute('oct', layerDef.getAttributeValue('octave.default')!));
      copyId(layerDef, d);
      this.addLayerAttribute(d);
    }

    if (this.currentPart === null) {
      addToMap(
        cloneElement(layerDef),
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap'),
      );
      return;
    }

    addToMap(
      cloneElement(layerDef),
      this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('miscMap'),
    );
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
   */
  private processLayer(layer: Element): void {
    const parentLayer = this.currentLayer;
    this.currentLayer = layer;

    const oldDate = this.currentPart!.getAttribute('currentDate')!.getValue();

    this.convertElement(layer);

    layer.addAttribute(
      new Attribute('currentDate', this.currentPart!.getAttribute('currentDate')!.getValue()),
    );
    this.accid = [];
    this.currentLayer = parentLayer;
    if (getNextSiblingElement('layer', layer) !== null)
      this.currentPart!.getAttribute('currentDate')!.setValue(oldDate);
    else {
      const layers = layer.getParent()!.query("child::*[local-name()='layer']");
      let latestDate = parseFloat(this.currentPart!.getAttribute('currentDate')!.getValue());
      for (let j = layers.size() - 1; j >= 0; --j) {
        const date = parseFloat(
          (layers.get(j) as unknown as Element).getAttributeValue('currentDate')!,
        );
        if (latestDate < date) latestDate = date;
      }
      this.currentPart!.getAttribute('currentDate')!.setValue(String(latestDate));
    }
  }

  private processApp(app: Element): void {
    let takeThisReading = firstChildElement(app, 'lem');
    if (takeThisReading === null) {
      takeThisReading = firstChildElement(app, 'rdg');
      if (takeThisReading === null) {
        return;
      }
    }
    this.convertElement(takeThisReading);
  }

  private processChoice(choice: Element): void {
    const prefOrder = ['corr', 'reg', 'expan', 'subst', 'choice', 'orig', 'unclear', 'sic', 'abbr'];

    let c: Element | null = null;
    for (let i = 0; c === null && i < prefOrder.length; ++i) {
      c = firstChildElement(choice, prefOrder[i]);
    }

    if (c !== null) {
      if (c.getLocalName() === 'choice') this.processChoice(c);
      else this.convertElement(c);
      return;
    }

    const children = choice.getChildElements();
    if (children.size() > 0) {
      c = children.get(0);
      if (c !== null) this.convertElement(c);
    }
  }

  private processRestore(restore: Element): void {
    const dels = restore.query("descendant::*[local-name()='del']");
    for (let i = 0; i < dels.size(); ++i) {
      const d = dels.get(i) as unknown as Element;
      d.addAttribute(new Attribute('restored-meico', 'true'));
    }
  }

  private processDel(del: Element): void {
    const restored = del.getAttribute('restored-meico');
    if (restored !== null && restored.getValue() === 'true') this.convertElement(del);
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
  private processEnding(ending: Element): void {
    const startDate = this.getMidiTime();
    const endingCount = this.endingCounter++;
    const sequencingMap = this.currentMsmMovement!.getFirstChildElement('global')!
      .getFirstChildElement('dated')!
      .getFirstChildElement('sequencingMap')!;

    let endingText = '';
    let endingNumbers: number[];
    const activity = '1';
    let n = Number.MIN_SAFE_INTEGER;
    if (ending.getAttribute('n') !== null) endingText = ending.getAttributeValue('n')!;
    else if (ending.getAttribute('label') !== null) endingText = ending.getAttributeValue('label')!;
    if (endingText.toLowerCase().includes('fine')) n = Number.MAX_SAFE_INTEGER;
    else {
      endingNumbers = extractAllIntegersFromString(endingText);
      if (endingNumbers.length > 0) {
        n = endingNumbers[0];
      }
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
      if (
        e.getAttribute('date') !== null &&
        parseFloat(e.getAttributeValue('date')!) <= startDate
      ) {
        repetitionStartMarker = e;
        break;
      }
    }

    let noPreviousEndings = false;
    const find1stEndingMarkerAfterThisDate =
      repetitionStartMarker === null
        ? 0.0
        : parseFloat(repetitionStartMarker.getAttributeValue('date')!);
    const ends = sequencingMap.query(
      "descendant::*[local-name()='marker' and contains(attribute::message, 'ending')]",
    );
    let dateOfGoto = Number.MAX_VALUE;
    for (let i = 0; i < ends.size(); ++i) {
      const end = ends.get(i) as unknown as Element;
      if (
        (repetitionStartMarker !== null &&
          end.getParent()!.indexOf(end) < end.getParent()!.indexOf(repetitionStartMarker)) ||
        end.getAttribute('date') === null
      ) {
        continue;
      }
      if (end === marker) {
        noPreviousEndings = true;
        dateOfGoto = startDate;
        break;
      }
      const firstEndingMarkerDate = parseFloat(end.getAttributeValue('date')!);
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
        gt.getAttribute('target.id')!.setValue('');
        addToMap(gt, sequencingMap);
      } else {
        let index: number;
        for (index = 0; index < gotosAtSameDate.size(); ++index) {
          const gtast = gotosAtSameDate.get(index) as unknown as Element;
          if (gtast.getAttribute('n') === null) continue;
          if (parseInt(gtast.getAttributeValue('n')!) > n) break;
        }
        if (index === 0) gt.getAttribute('activity')!.setValue(activity);
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

    this.convertElement(ending);

    if (noPreviousEndings) gt.getAttribute('target.date')!.setValue(this.getMidiTimeAsString());
  }

  private processPhrase(phrase: Element): void {
    const timingData = this.computeControlEventTiming(phrase, this.currentPart);
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
      if (phrase.getAttribute('label') !== null)
        phraseMapEntry.addAttribute(new Attribute('label', phrase.getAttributeValue('label')!));
      else if (phrase.getAttribute('n') !== null)
        phraseMapEntry.addAttribute(new Attribute('label', phrase.getAttributeValue('n')!));
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

      const phraseMap = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('phraseMap')!;
      addToMap(phraseMapEntry, phraseMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      const parts = this.currentMsmMovement!.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const phraseMapEntry = new Element('phrase');
          phraseMapEntry.addAttribute(new Attribute('date', String(date)));
          if (phrase.getAttribute('label') !== null)
            phraseMapEntry.addAttribute(new Attribute('label', phrase.getAttributeValue('label')!));
          else if (phrase.getAttribute('n') !== null)
            phraseMapEntry.addAttribute(new Attribute('label', phrase.getAttributeValue('n')!));
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

          const phraseMap = parts
            .get(p)
            .getFirstChildElement('dated')!
            .getFirstChildElement('phraseMap')!;
          addToMap(phraseMapEntry, phraseMap);
          this.addLayerAttribute(phraseMapEntry);
        }
      }
    }
  }

  private processSection(section: Element): void {
    const sectionMapEntry = new Element('section');
    sectionMapEntry.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
    if (section.getAttribute('label') !== null)
      sectionMapEntry.addAttribute(new Attribute('label', section.getAttributeValue('label')!));
    else if (section.getAttribute('n') !== null)
      sectionMapEntry.addAttribute(new Attribute('label', section.getAttributeValue('n')!));
    copyId(section, sectionMapEntry);
    const sectionMap = this.currentMsmMovement!.getFirstChildElement('global')!
      .getFirstChildElement('dated')!
      .getFirstChildElement('sectionMap')!;
    sectionMap.appendChild(sectionMapEntry);
    this.convertElement(section);
    sectionMapEntry.addAttribute(new Attribute('date.end', this.getMidiTimeAsString()));
  }

  /**
   * Convert one measure, and then reconcile the parts' clocks.
   *
   * Three things happen around the recursive descent:
   * - **before**: parked {@link tstamp2s} are counted down one measure. `tstamp2` is
   *   written `<measures>m+<beat>`, so each measure boundary decrements the count and only
   *   the entry that reaches zero resolves to a `date.end` here. The in-place `splice`
   *   with `i--` is why this is an index loop and not a `for..of`;
   * - **before**: {@link reorderMeasureContent} hoists control events ahead of the staves;
   * - **after**: {@link accid} is cleared, because MEI accidentals last exactly one measure.
   *
   * The tail then decides how long the measure actually was. `metcon="false"` marks a
   * measure that deliberately does not fill its time signature (a pickup, a cadenza), and
   * the parts are advanced by what they really contain; otherwise every part is advanced to
   * the same measure end, so a part that under- or over-fills does not desynchronise the
   * score.
   */
  private processMeasure(measure: Element): void {
    const startDate = this.getMidiTime();
    measure.addAttribute(new Attribute('date', String(startDate)));
    this.currentMeasure = measure;

    // process pending tstamp2 elements
    for (let i = 0; i < this.tstamp2s.length; ++i) {
      const e = this.tstamp2s[i];
      const att = e.getAttribute('tstamp2')!;
      const tstamp2Parts = att.getValue().split('m+');
      const measures = parseInt(tstamp2Parts[0]) - 1;
      if (measures <= 0) {
        const endDate = this.tstampToTicks(tstamp2Parts[1], null);
        e.addAttribute(new Attribute('date.end', String(endDate)));
        e.removeAttribute(att);
        this.tstamp2s.splice(i, 1);
        i--;
      } else {
        att.setValue(`${measures}m+${tstamp2Parts[1]}`);
      }
    }

    Mei2MsmMpmConverter.reorderMeasureContent(measure);

    this.convertElement(measure);
    this.accid = [];
    this.currentMeasure = null;

    const metconAtt = measure.getAttribute('metcon');
    const metcon = metconAtt === null || metconAtt.getValue() !== 'false';

    let defaultGlobalMeasureDuration = 0.0;
    let globalTimeSignature: Element | null = null;
    const globalTsMap = this.currentMsmMovement!.getFirstChildElement('global')!
      .getFirstChildElement('dated')!
      .getFirstChildElement('timeSignatureMap')!;
    if (globalTsMap.getChildCount() > 0) {
      const tss = globalTsMap.getChildElements('timeSignature');
      globalTimeSignature = tss.get(tss.size() - 1);
      defaultGlobalMeasureDuration = this.computeMeasureLength(
        parseFloat(globalTimeSignature.getAttributeValue('numerator')!),
        parseFloat(globalTimeSignature.getAttributeValue('denominator')!),
      );
    }

    let longestDuration = 0.0;
    const partsDefaultDurations = new Map<Element, number>();
    const partsTsMapAndTs = new Map<Element, KeyValue<Element, Element>>();
    const parts = this.currentMsmMovement!.getChildElements('part');
    for (let pi = 0; pi < parts.size(); ++pi) {
      const part = parts.get(pi);
      const tsMap = part.getFirstChildElement('dated')!.getFirstChildElement('timeSignatureMap')!;
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
              parseFloat(ts.getAttributeValue('numerator')!),
              parseFloat(ts.getAttributeValue('denominator')!),
            );
      partsDefaultDurations.set(part, defaultLocalMeasureDuration);
      const actualPartMeasureDuration =
        parseFloat(part.getAttributeValue('currentDate')!) - startDate;

      const d =
        actualPartMeasureDuration === defaultLocalMeasureDuration ||
        (actualPartMeasureDuration < defaultLocalMeasureDuration && metcon)
          ? defaultLocalMeasureDuration
          : actualPartMeasureDuration;
      part.getAttribute('currentDate')!.setValue(String(d + startDate));
      if (d > longestDuration) longestDuration = d;
    }
    measure.addAttribute(new Attribute('midi.dur', String(longestDuration)));
    const endDate = startDate + longestDuration;

    if (globalTimeSignature !== null && longestDuration !== defaultGlobalMeasureDuration) {
      while (globalTsMap.getChildElements().size() > 0) {
        const last = globalTsMap.getChildElements().get(globalTsMap.getChildCount() - 1);
        if (parseFloat(last.getAttributeValue('date')!) >= startDate) {
          globalTsMap.removeChild(last);
        } else break;
      }
      const numDenom = [
        parseFloat(globalTimeSignature.getAttributeValue('numerator')!),
        parseFloat(globalTimeSignature.getAttributeValue('denominator')!),
      ];
      const num = (longestDuration * numDenom[1]) / (this.ppq * 4.0);
      const newTs = Msm.makeTimeSignature(startDate, num, numDenom[1], null);
      globalTsMap.appendChild(newTs);
      const switchBackTs = Msm.makeTimeSignature(endDate, numDenom[0], numDenom[1], null);
      globalTsMap.appendChild(switchBackTs);
    }

    for (let pi = 0; pi < parts.size(); ++pi) {
      const part = parts.get(pi);
      const tsData = partsTsMapAndTs.get(part);
      if (tsData === undefined || partsDefaultDurations.get(part) === longestDuration) continue;
      const tsMap = tsData.getKey();
      const ts = tsData.getValue();
      if (ts === null) continue;

      while (tsMap.getChildElements().size() > 0) {
        const last = tsMap.getChildElements().get(tsMap.getChildCount() - 1);
        if (parseFloat(last.getAttributeValue('date')!) >= startDate) {
          tsMap.removeChild(last);
        } else break;
      }
      const numDenom = [
        parseFloat(ts.getAttributeValue('numerator')!),
        parseFloat(ts.getAttributeValue('denominator')!),
      ];
      const num2 = (longestDuration * numDenom[1]) / (this.ppq * 4.0);
      const newTs2 = Msm.makeTimeSignature(startDate, num2, numDenom[1], null);
      tsMap.appendChild(newTs2);
      const switchBackTs2 = Msm.makeTimeSignature(endDate, numDenom[0], numDenom[1], null);
      tsMap.appendChild(switchBackTs2);
    }

    // process barlines
    if (measure.getAttribute('left') !== null)
      Mei2MsmMpmConverter.barline2SequencingCommand(
        measure.getAttributeValue('left')!,
        startDate,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('sequencingMap')!,
      );
    if (measure.getAttribute('right') !== null)
      Mei2MsmMpmConverter.barline2SequencingCommand(
        measure.getAttributeValue('right')!,
        endDate,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('sequencingMap')!,
      );
  }

  private processMeterSig(meterSig: Element): void {
    const s = this.makeTimeSignature(meterSig);
    if (s === null) return;
    if (this.currentPart !== null) {
      addToMap(
        s,
        this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('timeSignatureMap'),
      );
    } else {
      addToMap(
        s,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('timeSignatureMap'),
      );
    }
  }

  private processKeySig(keySig: Element): void {
    const s = this.makeKeySignature(keySig);
    if (s === null) return;
    if (this.currentPart !== null) {
      addToMap(
        s,
        this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('keySignatureMap'),
      );
    } else {
      addToMap(
        s,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('keySignatureMap'),
      );
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
  private processAccid(accid: Element): void {
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

    const ploc = accid.getAttribute('ploc');
    let pname: string | null = null;
    if (ploc !== null) {
      pname = ploc.getValue();
    } else {
      if (parentNote !== null) {
        if (parentNote.getAttribute('pname') !== null) {
          pname = parentNote.getAttributeValue('pname');
        } else {
          if (
            parentNote.getAttribute('pname.ges') !== null &&
            parentNote.getAttributeValue('pname.ges') !== 'none'
          ) {
            pname = parentNote.getAttributeValue('pname.ges');
          } else {
            return;
          }
        }
      } else {
        return;
      }
    }
    accid.addAttribute(new Attribute('pname', pname!));

    const oloc = accid.getAttribute('oloc');
    let oct: string | null = null;
    if (oloc !== null) {
      oct = oloc.getValue();
    } else {
      if (parentNote !== null) {
        if (parentNote.getAttribute('oct') !== null) {
          oct = parentNote.getAttributeValue('oct');
        } else {
          if (parentNote.getAttribute('oct.ges') !== null) {
            oct = parentNote.getAttributeValue('oct.ges');
          } else {
            if (this.currentPart !== null) {
              let octs = this.currentPart
                .getFirstChildElement('dated')!
                .getFirstChildElement('miscMap')!
                .getChildElements('oct.default');
              if (octs.size() === 0) {
                octs = this.currentMsmMovement!.getFirstChildElement('global')!
                  .getFirstChildElement('dated')!
                  .getFirstChildElement('miscMap')!
                  .getChildElements('oct.default');
              }
              for (let i2 = octs.size() - 1; i2 >= 0; --i2) {
                if (
                  octs.get(i2).getAttribute('layer') === null ||
                  octs.get(i2).getAttributeValue('layer') === Mei.getLayerId(Mei.getLayer(accid))
                ) {
                  oct = octs.get(i2).getAttributeValue('oct.default');
                  break;
                }
              }
              if (oct === null) return;
            } else {
              return;
            }
          }
        }
      } else {
        return;
      }
    }
    accid.addAttribute(new Attribute('oct', oct!));

    this.addLayerAttribute(accid);
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
  private makePart(staffDef: Element): Element {
    const existingPart = this.getPart(staffDef.getAttributeValue('n') ?? '');
    if (existingPart !== null) return existingPart;

    let label = '';
    const parentElem = staffDef.getParent();
    if (parentElem !== null && parentElem.getLocalName() === 'staffGrp')
      if (parentElem.getAttribute('label') !== null) label = parentElem.getAttributeValue('label')!;
    if (staffDef.getAttribute('label') !== null)
      label +=
        label === ''
          ? staffDef.getAttributeValue('label')!
          : ` ${staffDef.getAttributeValue('label')!}`;
    else {
      const labelElement = firstChildElement('label', staffDef);
      if (labelElement !== null) {
        label += label === '' ? labelElement.getValue() : ` ${labelElement.getValue()}`;
      }
    }

    let number: string;
    if (staffDef.getAttribute('n') !== null) {
      number = staffDef.getAttributeValue('n')!;
    } else {
      number = String(-1 * this.currentMsmMovement!.getChildElements('part').size());
      staffDef.addAttribute(new Attribute('n', number));
    }

    let midiChannel = 0;
    let midiPort = 0;
    const ps = this.currentMsmMovement!.getChildElements('part');
    if (ps.size() > 0) {
      const p = ps.get(ps.size() - 1);
      midiChannel = (parseInt(p.getAttributeValue('midi.channel')!) + 1) % 16;
      if (midiChannel === 9 && this.dontUseChannel10) ++midiChannel;
      midiPort =
        midiChannel === 0
          ? (parseInt(p.getAttributeValue('midi.port')!) + 1) % 256
          : parseInt(p.getAttributeValue('midi.port')!);
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
        this.currentMeasure !== null ? this.currentMeasure.getAttributeValue('date')! : '0.0',
      ),
    );

    this.currentMsmMovement!.appendChild(part);

    // MPM part creation
    if (this.currentPerformance) {
      const performancePart = MpmPart.createPart(label, parseInt(number), midiChannel, midiPort);
      if (performancePart !== null) {
        this.currentPerformance.addPart(performancePart);
        if (xmlId !== null) performancePart.setId(xmlId.getValue());
      }
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
  protected makeTimeSignature(meiSource: Element): Element | null {
    const s = new Element('timeSignature');
    copyId(meiSource, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString()));

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
      this.addLayerAttribute(s);
      return s;
    }

    let sym = meiSource.getAttribute('sym');
    if (sym === null) sym = meiSource.getAttribute('meter.sym');
    if (sym !== null) {
      const str =
        meiSource.getLocalName() === 'meterSig'
          ? meiSource.getAttributeValue('sym')!
          : meiSource.getAttributeValue('meter.sym')!;
      if (str === 'common') {
        s.addAttribute(new Attribute('numerator', '4'));
        s.addAttribute(new Attribute('denominator', '4'));
        this.addLayerAttribute(s);
        return s;
      } else if (str === 'cut') {
        s.addAttribute(new Attribute('numerator', '2'));
        s.addAttribute(new Attribute('denominator', '2'));
        this.addLayerAttribute(s);
        return s;
      }
    }

    return null;
  }

  private makeKeySignature(meiSource: Element): Element | null {
    const s = new Element('keySignature');
    copyId(meiSource, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString()));

    const accidentals: Element[] = [];
    let sig = '';
    let mixed = '';

    if (meiSource.getLocalName() === 'scoreDef' || meiSource.getLocalName() === 'staffDef') {
      if (meiSource.getAttribute('key.sig') !== null) sig = meiSource.getAttributeValue('key.sig')!;
      else return null;
      if (meiSource.getAttribute('key.sig.mixed') !== null)
        mixed = meiSource.getAttributeValue('key.sig.mixed')!;
    } else if (meiSource.getLocalName() === 'keySig') {
      if (meiSource.getAttribute('sig') !== null) sig = meiSource.getAttributeValue('sig')!;
      if (meiSource.getAttribute('sig.mixed') !== null)
        mixed = meiSource.getAttributeValue('sig.mixed')!;

      const accids = meiSource.getChildElements('keyAccid');
      for (let i = 0; i < accids.size(); ++i) {
        if (
          accids.get(i).getAttribute('pname') === null ||
          accids.get(i).getAttribute('accid') === null
        ) {
          console.log(
            `The following keyAccid element requires a pname and accid attribute for processing in meico: ${accids.get(i).toXML()}`,
          );
          continue;
        }
        const pitch = pname2midi(accids.get(i).getAttributeValue('pname')!);
        if (pitch < 0.0) {
          console.error(`No valid value in attribute pname: ${accids.get(i).toXML()}`);
          continue;
        }
        const accidental = new Element('accidental');
        accidental.addAttribute(new Attribute('midi.pitch', String(pitch)));
        accidental.addAttribute(
          new Attribute('pitchname', accids.get(i).getAttributeValue('pname')!),
        );
        accidental.addAttribute(
          new Attribute(
            'value',
            String(accidString2decimal(accids.get(i).getAttributeValue('accid')!)),
          ),
        );
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
        const acsArr =
          accidCount > 0
            ? ['5.0', '0.0', '7.0', '2.0', '9.0', '4.0', '11.0']
            : ['11.0', '4.0', '9.0', '2.0', '7.0', '0.0', '5.0'];
        const acsnArr =
          accidCount > 0
            ? ['F', 'C', 'G', 'D', 'A', 'E', 'B']
            : ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
        for (let i = 0; i < Math.abs(accidCount); ++i) {
          const accidental = new Element('accidental');
          accidental.addAttribute(new Attribute('midi.pitch', acsArr[i]));
          accidental.addAttribute(new Attribute('pitchname', acsnArr[i]));
          accidental.addAttribute(new Attribute('value', accidCount > 0 ? '1.0' : '-1.0'));
          accidentals.push(accidental);
        }
      }
    }

    for (const accidental of accidentals) {
      s.appendChild(accidental);
    }

    this.addLayerAttribute(s);
    return s;
  }

  private processChord(chord: Element): void {
    if (this.currentPart === null) return;

    if (this.currentChord !== null) {
      if (chord.getAttribute('dur') === null && this.currentChord.getAttribute('dur') !== null) {
        chord.addAttribute(new Attribute('dur', this.currentChord.getAttributeValue('dur')!));
      }
      if (chord.getAttribute('dots') === null && this.currentChord.getAttribute('dots') !== null) {
        chord.addAttribute(new Attribute('dots', this.currentChord.getAttributeValue('dots')!));
      }
    }

    let dur = 0.0;
    if (chord.getAttribute('dur') !== null) {
      dur = this.computeDuration(chord);
    } else {
      const durs = chord.query('descendant::*[attribute::dur]');
      let idur = 0.0;
      for (let i = 0; i < durs.size(); ++i) {
        idur = this.computeDuration(durs.get(i) as unknown as Element);
        if (idur > dur) dur = idur;
      }
    }

    const f = this.currentChord;
    this.currentChord = chord;

    this.checkSlurs(chord);

    if (chord.query("descendant::*[local-name()='artic']").size() > 0)
      chord.addAttribute(new Attribute('hasArticulations', 'true'));
    this.processArtic(chord);

    this.convertElement(chord);
    this.currentChord = f;
    if (this.currentChord === null) {
      this.currentPart
        .getAttribute('currentDate')!
        .setValue(String(parseFloat(this.currentPart.getAttributeValue('currentDate')!) + dur));
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
  private processTuplet(tuplet: Element): boolean {
    if (tuplet.getAttribute('dur') !== null) {
      const cd = parseFloat(this.currentPart!.getAttributeValue('currentDate')!);
      this.convertElement(tuplet);
      const dur = this.computeDuration(tuplet);
      this.currentPart!.getAttribute('currentDate')!.setValue(String(cd + dur));
      return true;
    }
    return false;
  }

  private processTupletSpan(tupletSpan: Element): void {
    if (tupletSpan.getAttribute('num') === null || tupletSpan.getAttribute('numbase') === null) {
      console.error(
        `Cannot process MEI element ${tupletSpan.toXML()}. Attributes 'num' and 'numbase' both need to be specified.`,
      );
      return;
    }

    const timingData = this.computeControlEventTiming(tupletSpan, this.currentPart);
    if (timingData === null) return;
    const date = timingData[0];
    const endDate = timingData[1];
    const tstamp2 = timingData[2];
    const endid = timingData[3];

    let att = tupletSpan.getAttribute('part');
    if (att === null) att = tupletSpan.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      const clone = cloneElement(tupletSpan)!;
      clone.addAttribute(new Attribute('date', String(date)));
      if (endDate !== null) {
        clone.addAttribute(new Attribute('date.end', String(endDate)));
      } else if (tstamp2 !== null) {
        clone.addAttribute(new Attribute('tstamp2', tstamp2.getValue()));
        this.tstamp2s.push(clone);
      } else if (endid !== null) {
        this.endids.push(clone);
      }

      const tsMap = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('miscMap')!
        .getFirstChildElement('tupletSpanMap')!;
      addToMap(clone, tsMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      const parts = this.currentMsmMovement!.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const clone = cloneElement(tupletSpan)!;
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

          const tsMap = parts
            .get(p)
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!
            .getFirstChildElement('tupletSpanMap')!;
          addToMap(clone, tsMap);
          this.addLayerAttribute(clone);
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
  private processArpeg(arpeg: Element): void {
    // check if this is really an arpeggio
    const order = attribute('order', arpeg);
    if (order !== null && order.getValue().trim() === 'nonarp') return;

    // compute the timing
    const timingData = this.computeControlEventTiming(arpeg, this.currentPart);
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

    // make sure that the arpeggio is defined in a global ornamentation style
    let ornamentationStyle = this.currentPerformance!.getGlobal()!
      .getHeader()!
      .getStyleDef(Mpm.ORNAMENTATION_STYLE, 'MEI export') as OrnamentationStyle | null;
    if (ornamentationStyle === null)
      ornamentationStyle = this.currentPerformance!.getGlobal()!
        .getHeader()!
        .addStyleDef(Mpm.ORNAMENTATION_STYLE, 'MEI export') as OrnamentationStyle | null;
    if (ornamentationStyle!.getDef(od.ornamentDefName) === undefined) {
      const def = OrnamentDef.createDefaultOrnamentDef(od.ornamentDefName);
      if (def !== null) ornamentationStyle!.addDef(def);
    }

    // parse the staff attribute
    let ornamentationMap: OrnamentationMap | null;
    let att = arpeg.getAttribute('part');
    if (att === null) att = arpeg.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      ornamentationMap = this.currentPerformance!.getGlobal()!
        .getDated()!
        .getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = this.currentPerformance!.getGlobal()!
          .getDated()!
          .addMap(OrnamentationMap.createOrnamentationMap()) as OrnamentationMap;
        ornamentationMap.addStyleSwitch(0.0, 'MEI export');
      }
      const index = ornamentationMap.addOrnamentFromData(od);
      if (needsPostprocessing !== 0)
        this.arpeggiosToSort.push(
          new KeyValue<Attribute, boolean>(
            attribute('note.order', ornamentationMap.getElement(index))!,
            needsPostprocessing > 0,
          ),
        );
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = this.currentPerformance!.getPart(parseInt(staff));
        if (part === null) continue;

        ornamentationMap = part
          .getDated()!
          .getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
        if (ornamentationMap === null) {
          ornamentationMap = part
            .getDated()!
            .addMap(OrnamentationMap.createOrnamentationMap()) as OrnamentationMap;
          ornamentationMap.addStyleSwitch(0.0, 'MEI export');
        }

        const odd = od.clone();
        if (od.xmlId !== null && multiIDs) odd.xmlId = `${od.xmlId}_meico_${uuidv4()}`;

        const index = ornamentationMap.addOrnamentFromData(odd);
        if (needsPostprocessing !== 0)
          this.arpeggiosToSort.push(
            new KeyValue<Attribute, boolean>(
              attribute('note.order', ornamentationMap.getElement(index))!,
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
  private processOrnamentSign(sign: Element): void {
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
    const timingData = this.computeControlEventTiming(sign, this.currentPart);
    if (timingData === null) return;

    const idAtt = attribute('id', sign);
    const idBase = idAtt === null ? `meico_${uuidv4()}` : idAtt.getValue();
    const date = timingData[0];

    // make sure that the ornament is defined in a global ornamentation style
    let ornamentationStyle = this.currentPerformance!.getGlobal()!
      .getHeader()!
      .getStyleDef(Mpm.ORNAMENTATION_STYLE, 'MEI export') as OrnamentationStyle | null;
    if (ornamentationStyle === null)
      ornamentationStyle = this.currentPerformance!.getGlobal()!
        .getHeader()!
        .addStyleDef(Mpm.ORNAMENTATION_STYLE, 'MEI export') as OrnamentationStyle | null;
    if (ornamentationStyle!.getDef(resolved.defName) === undefined) {
      const def = createMeiOrnamentDef(resolved.defName);
      if (def !== null) ornamentationStyle!.addDef(def);
    }

    // parse the staff attribute
    let ornamentationMap: OrnamentationMap | null;
    let att = sign.getAttribute('part');
    if (att === null) att = sign.getAttribute('staff');
    if (att === null || att.getValue() === '' || att.getValue() === '%all') {
      ornamentationMap = this.currentPerformance!.getGlobal()!
        .getDated()!
        .getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = this.currentPerformance!.getGlobal()!
          .getDated()!
          .addMap(OrnamentationMap.createOrnamentationMap()) as OrnamentationMap;
        ornamentationMap.addStyleSwitch(0.0, 'MEI export');
      }
      ornamentationMap.addOrnamentFromData(
        buildOrnamentData(resolved.shape, resolved.defName, resolved.principalId, date, idBase),
      );
      return;
    }

    let multiIDs = false;
    for (const staff of att.getValue().split(/\s+/)) {
      const part = this.currentPerformance!.getPart(parseInt(staff));
      if (part === null) continue;

      ornamentationMap = part.getDated()!.getMap(Mpm.ORNAMENTATION_MAP) as OrnamentationMap | null;
      if (ornamentationMap === null) {
        ornamentationMap = part
          .getDated()!
          .addMap(OrnamentationMap.createOrnamentationMap()) as OrnamentationMap;
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

  private processDynam(dynam: Element): void {
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
          let dynamicsStyle = this.currentPerformance!.getGlobal()!
            .getHeader()!
            .getStyleDef(Mpm.DYNAMICS_STYLE, 'MEI export') as DynamicsStyle | null;
          if (dynamicsStyle === null)
            dynamicsStyle = this.currentPerformance!.getGlobal()!
              .getHeader()!
              .addStyleDef(Mpm.DYNAMICS_STYLE, 'MEI export') as DynamicsStyle | null;

          if (dynamicsStyle !== null && dynamicsStyle.getDef(dd.volumeString) === undefined) {
            const def = DynamicsDef.createDefaultDynamicsDef(dd.volumeString);
            if (def !== null) dynamicsStyle.addDef(def);
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
    const timingData = this.computeControlEventTiming(dynam, this.currentPart);
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
      dynamicsMap = this.currentPerformance!.getGlobal()!
        .getDated()!
        .getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
      if (dynamicsMap === null) {
        dynamicsMap = this.currentPerformance!.getGlobal()!
          .getDated()!
          .addMap(DynamicsMap.createDynamicsMap()) as DynamicsMap;
        dynamicsMap.addStyleSwitch(0.0, 'MEI export');
      }

      this.addDynamicsToMpm(dd, dynamicsMap, endid, tstamp2);
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = this.currentPerformance!.getPart(parseInt(staff));
        if (part === null) continue;

        dynamicsMap = part.getDated()!.getMap(Mpm.DYNAMICS_MAP) as DynamicsMap | null;
        if (dynamicsMap === null) {
          dynamicsMap = part.getDated()!.addMap(DynamicsMap.createDynamicsMap()) as DynamicsMap;
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
    const previousDynamics = dynamicsMap.getAllElements();

    for (let i = previousDynamics.length - 1; i >= 0; --i) {
      if (previousDynamics[i].getKey() > dynamicsData.startDate) continue;

      if (dynamicsData.transitionToString === null) {
        const trans = previousDynamics[i].getValue().getAttribute('transition.to');
        if (trans !== null) trans.setValue(dynamicsData.volumeString!);
      } else {
        const trans = previousDynamics[i].getValue().getAttribute('transition.to');
        if (trans !== null) dynamicsData.volumeString = trans.getValue();
        else dynamicsData.volumeString = previousDynamics[i].getValue().getAttributeValue('volume');
      }
      break;
    }
    if (dynamicsData.volumeString === null) dynamicsData.volumeString = '?';

    const index = dynamicsMap.addDynamicsFromData(dynamicsData);
    if (index < 0) return index;
    const dynamics = dynamicsMap.getElement(index)!;
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

  private processTempo(tempo: Element): void {
    const tempoData = this.parseTempo(tempo, this.currentPart);
    if (tempoData === null) return;

    // compute the timing or get the necessary data to compute the end date later on
    const timingData = this.computeControlEventTiming(tempo, this.currentPart);
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
      tempoMap = this.currentPerformance!.getGlobal()!
        .getDated()!
        .getMap(Mpm.TEMPO_MAP) as TempoMap | null;
      if (tempoMap === null) {
        tempoMap = this.currentPerformance!.getGlobal()!
          .getDated()!
          .addMap(TempoMap.createTempoMap()) as TempoMap;

        if (
          this.currentPerformance!.getGlobal()!
            .getHeader()!
            .getAllStyleTypes()
            .get(Mpm.TEMPO_STYLE) !== undefined
        )
          tempoMap.addStyleSwitch(0.0, 'MEI export');
      }

      this.addTempoToMpm(tempoData, tempoMap, endid, tstamp2);
    } else {
      let multiIDs = false;
      const staffs = att.getValue().split(/\s+/);

      for (const staff of staffs) {
        const part = this.currentPerformance!.getPart(parseInt(staff));
        if (part === null) continue;

        tempoMap = part.getDated()!.getMap(Mpm.TEMPO_MAP) as TempoMap | null;
        if (tempoMap === null) {
          tempoMap = part.getDated()!.addMap(TempoMap.createTempoMap()) as TempoMap;
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
    const previousTempo = tempoMap.getAllElements();

    for (let i = previousTempo.length - 1; i >= 0; --i) {
      if (previousTempo[i].getKey() > tempoData.startDate) continue;

      if (tempoData.transitionToString === null) {
        const trans = previousTempo[i].getValue().getAttribute('transition.to');
        if (trans !== null) {
          trans.setValue(tempoData.bpmString!);
        }
      } else {
        const trans = previousTempo[i].getValue().getAttribute('transition.to');
        if (trans !== null) tempoData.bpmString = trans.getValue();
        else tempoData.bpmString = previousTempo[i].getValue().getAttributeValue('bpm');
      }
      break;
    }

    const index = tempoMap.addTempo(tempoData);
    if (index < 0) return index;
    const tempoElement = tempoMap.getElement(index)!;
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

  private processArtic(artic: Element): void {
    if (this.currentPart === null) return;

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
    let articulationStyle = this.currentPerformance!.getGlobal()!
      .getHeader()!
      .getStyleDef(Mpm.ARTICULATION_STYLE, 'MEI export') as ArticulationStyle | null;
    if (articulationStyle === null) {
      articulationStyle = this.currentPerformance!.getGlobal()!
        .getHeader()!
        .addStyleDef(Mpm.ARTICULATION_STYLE, 'MEI export') as ArticulationStyle | null;
      const nonlegatoDef = ArticulationDef.createDefaultArticulationDef('nonlegato');
      if (nonlegatoDef !== null) articulationStyle!.addDef(nonlegatoDef);
    }

    // find the local articulationMap
    const date = this.getMidiTime();
    const part = this.currentPerformance!.getPart(
      parseInt(this.currentPart.getAttributeValue('number')!),
    );
    let map = part!.getDated()!.getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
    if (map === null) {
      map = part!.getDated()!.addMap(ArticulationMap.createArticulationMap()) as ArticulationMap;
      map.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
    }

    for (
      let parent: Element | null = artic;
      parent !== null && parent !== this.mei!.getRootElement();
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
          this.addArticulationToMap(date, att.getValue(), xmlid, noteId, map, articulationStyle!);
        if (slur !== null) {
          const slurid =
            artic.getAttribute('slurid') === null ? null : artic.getAttributeValue('slurid');
          if (slur.getValue().includes('t'))
            this.addArticulationToMap(date, 'legatoStop', slurid, noteId, map, articulationStyle!);
          else if (slur.getValue().includes('i') || slur.getValue().includes('m'))
            this.addArticulationToMap(date, 'legato', slurid, noteId, map, articulationStyle!);
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
                articulationStyle!,
              );
              multiIDs = true;
            }
            if (slur !== null) {
              let slurid: string | null = null;
              if (artic.getAttribute('slurid') !== null) {
                slurid = artic.getAttributeValue('slurid')!;
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
                  articulationStyle!,
                );
              else if (slur.getValue().includes('i') || slur.getValue().includes('m'))
                this.addArticulationToMap(date, 'legato', slurid, noteId, map, articulationStyle!);
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
              if (artic.getAttribute('slurid') !== null) {
                const slurid = artic.getAttributeValue('slurid')!;
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
        (parent === this.currentLayer ||
          parent.getLocalName() === 'staff' ||
          parent === this.currentMeasure) &&
        att !== null
      ) {
        this.addArticulationToMap(date, att.getValue(), xmlid, null, map, articulationStyle!);
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
        if (def === null) {
          console.error(`Failed to generate articulationDef for "${artic}".`);
          continue;
        }
        articulationStyle.addDef(def);
      }
      articulationMap.addArticulation(date, artic, noteid === null ? null : `#${noteid}`, id);
    }
  }

  private processBreath(breath: Element): void {
    if (this.currentMeasure === null) return;

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
          console.log(
            `MEI element ${breath.toXML()} is not associated with a note or chord. If its 'tstamp.ges' or 'tstamp' does not coincide with a note it will have no effect on the music!`,
          );
          const tstamp = att.getValue();

          // make sure there is a styleDef in MPM for articulation definitions
          let articulationStyle = this.currentPerformance!.getGlobal()!
            .getHeader()!
            .getStyleDef(Mpm.ARTICULATION_STYLE, 'MEI export') as ArticulationStyle | null;
          if (articulationStyle === null) {
            articulationStyle = this.currentPerformance!.getGlobal()!
              .getHeader()!
              .addStyleDef(Mpm.ARTICULATION_STYLE, 'MEI export') as ArticulationStyle | null;
            articulationStyle!.getDef('defaultArticulation');
          }

          // find or generate the required articulationMaps
          let articulationMap: ArticulationMap | null;
          att = breath.getAttribute('part');
          if (att === null) att = breath.getAttribute('staff');
          if (att === null || att.getValue() === '' || att.getValue() === '%all') {
            articulationMap = this.currentPerformance!.getGlobal()!
              .getDated()!
              .getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
            if (articulationMap === null) {
              articulationMap = this.currentPerformance!.getGlobal()!
                .getDated()!
                .addMap(ArticulationMap.createArticulationMap()) as ArticulationMap;
              articulationMap.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
            }
            const date = this.tstampToTicks(tstamp, this.currentPart);
            this.addArticulationToMap(
              date,
              'breath',
              xmlid,
              null,
              articulationMap,
              articulationStyle!,
            );
          } else {
            const staffs = att.getValue().split(/\s+/);
            let multiIds = false;

            for (const staff of staffs) {
              const mpmPart = this.currentPerformance!.getPart(parseInt(staff));
              if (mpmPart === null) continue;

              articulationMap = mpmPart
                .getDated()!
                .getMap(Mpm.ARTICULATION_MAP) as ArticulationMap | null;
              if (articulationMap === null) {
                articulationMap = mpmPart
                  .getDated()!
                  .addMap(ArticulationMap.createArticulationMap()) as ArticulationMap;
                articulationMap.addArticulationStyleSwitch(0.0, 'MEI export', 'nonlegato');
              }

              // find corresponding MSM part
              let msmPart: Element | null = null;
              const parts = this.currentMsmMovement!.getChildElements('part');
              for (let p = 0; p < parts.size(); ++p) {
                if (parts.get(p).getAttributeValue('number') === staff) {
                  msmPart = parts.get(p);
                  break;
                }
              }

              const date = this.tstampToTicks(tstamp, msmPart);
              this.addArticulationToMap(
                date,
                'breath',
                xmlid === null ? null : multiIds ? `${xmlid}_meico_${uuidv4()}` : xmlid,
                null,
                articulationMap,
                articulationStyle!,
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

  private processTie(tie: Element): void {
    if (
      this.currentMeasure === null ||
      tie.getAttribute('startid') === null ||
      tie.getAttribute('endid') === null
    )
      return;

    let note = this.allNotesAndChords.get(
      tie.getAttributeValue('startid')!.trim().replace(/#/g, ''),
    );
    if (note !== undefined) {
      const a = note.getAttribute('tie');
      if (a !== null) {
        if (a.getValue() === 't') a.setValue('m');
        else if (a.getValue() === 'n') a.setValue('i');
      } else {
        note.addAttribute(new Attribute('tie', 'i'));
      }
    }

    note = this.allNotesAndChords.get(tie.getAttributeValue('endid')!.trim().replace(/#/g, ''));
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
  private processSlur(slur: Element): void {
    if (this.currentMeasure === null)
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

      // all but the last: the end of the legato bow is not played legato
      for (let i = plist.length - 2; i >= 0; --i) {
        const note = this.allNotesAndChords.get(plist[i]);
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
        const note = this.allNotesAndChords.get(plist[plist.length - 1]);
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

    const timingData = this.computeControlEventTiming(slur, this.currentPart);
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

      addToMap(
        slurMisc,
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!,
      );
      return;
    }

    // there are staffs, hence a local slur
    const staffs = att.getValue().split(/\s+/);
    const parts = this.currentMsmMovement!.getChildElements('part');
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

        addToMap(slurMisc, part.getFirstChildElement('dated')!.getFirstChildElement('miscMap')!);
      }
    }
  }

  private processReh(reh: Element): void {
    let markerMap =
      this.currentPart === null
        ? null
        : (this.currentPart.getFirstChildElement('dated')?.getFirstChildElement('markerMap') ??
          null);
    if (markerMap === null)
      markerMap =
        this.currentMsmMovement === null
          ? null
          : (this.currentMsmMovement
              .getFirstChildElement('global')
              ?.getFirstChildElement('dated')
              ?.getFirstChildElement('markerMap') ?? null);
    if (markerMap === null) return;

    const marker = new Element('marker');
    copyId(reh, marker);
    marker.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
    marker.addAttribute(new Attribute('message', reh.getValue()));
    this.addLayerAttribute(marker);
    addToMap(marker, markerMap);
  }

  private processBeatRpt(_beatRpt: Element): void {
    let es = this.currentPart!.getFirstChildElement('dated')!
      .getFirstChildElement('timeSignatureMap')!
      .getChildElements('timeSignature');
    if (es.size() === 0) {
      es = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getChildElements('timeSignature');
    }
    let beatLength =
      es.size() === 0 ? 4 : parseFloat(es.get(es.size() - 1).getAttributeValue('denominator')!);
    beatLength = (4.0 * this.ppq) / beatLength;
    this.processRepeat(beatLength);
  }

  private processMRpt(_mRpt: Element): void {
    this.processRepeat(this.getOneMeasureLength(this.currentPart));
  }

  private processMRpt2(_mRpt2: Element): void {
    const timeframe = this.getOneMeasureLength(this.currentPart);
    // Simplified -- full implementation handles time signature changes across measures
    this.processRepeat(timeframe);
  }

  private processMultiRpt(multiRpt: Element): void {
    // Simplified -- full implementation handles time signature changes
    const numMeasures =
      multiRpt.getAttribute('num') === null ? 1 : parseInt(multiRpt.getAttributeValue('num')!);
    const measureLength = this.getOneMeasureLength(this.currentPart);
    this.processRepeat(measureLength * numMeasures);
  }

  private processHalfmRpt(_halfmRpt: Element): void {
    this.processRepeat(0.5 * this.getOneMeasureLength(this.currentPart));
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
  private processRepeat(timeframe: number): void {
    if (
      this.currentPart === null ||
      this.currentPart
        .getFirstChildElement('dated')!
        .getFirstChildElement('score')!
        .getChildElements()
        .size() === 0
    ) {
      return;
    }

    const currentDate = parseFloat(this.currentPart.getAttributeValue('currentDate')!);
    const startDate = currentDate - timeframe;
    const layer = Mei.getLayerId(this.currentLayer);
    const els: Element[] = [];

    const scoreChildren = this.currentPart
      .getFirstChildElement('dated')!
      .getFirstChildElement('score')!
      .getChildElements();
    for (let idx = scoreChildren.size() - 1; idx >= 0; --idx) {
      const e = scoreChildren.get(idx);
      const date = parseFloat(e.getAttributeValue('date')!);
      if (date < startDate) break;
      if (
        layer === '' ||
        (e.getAttribute('layer') !== null && e.getAttributeValue('layer') === layer)
      ) {
        const copy = cloneElement(e)!;
        copy.getAttribute('date')!.setValue(String(date + timeframe));
        const idCopy = attribute('id', copy);
        if (idCopy !== null) idCopy.setValue(`meico_repeats_${idCopy.getValue()}_${uuidv4()}`);
        els.unshift(copy);
      }
    }

    for (const el of els) {
      addToMap(el, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('score'));
    }

    this.currentPart.getAttribute('currentDate')!.setValue(String(currentDate + timeframe));
  }

  private processMeasureRest(mRest: Element): void {
    if (this.currentPart === null) return;
    const rest = this.makeMeasureRest(mRest);
    if (rest === null) return;
    addToMap(rest, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('score'));
    this.currentPart
      .getAttribute('currentDate')!
      .setValue(
        String(
          parseFloat(this.currentPart.getAttributeValue('currentDate')!) +
            parseFloat(rest.getAttributeValue('duration')!),
        ),
      );
  }

  private makeMeasureRest(meiMRest: Element): Element | null {
    const rest = new Element('rest');
    copyId(meiMRest, rest);
    let dur = 0.0;

    if (
      this.currentPart !== null &&
      this.currentPart
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getFirstChildElement('timeSignature') !== null
    ) {
      const es = this.currentPart
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getChildElements('timeSignature');
      dur =
        (4.0 * this.ppq * parseFloat(es.get(es.size() - 1).getAttributeValue('numerator')!)) /
        parseFloat(es.get(es.size() - 1).getAttributeValue('denominator')!);
    } else if (
      this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getFirstChildElement('timeSignature') !== null
    ) {
      const es = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getChildElements('timeSignature');
      dur =
        (4.0 * this.ppq * parseFloat(es.get(es.size() - 1).getAttributeValue('numerator')!)) /
        parseFloat(es.get(es.size() - 1).getAttributeValue('denominator')!);
    }
    if (dur === 0.0) return null;

    rest.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
    rest.addAttribute(new Attribute('duration', String(dur)));
    this.addLayerAttribute(rest);
    return rest;
  }

  private processMultiRest(multiRest: Element): void {
    if (this.currentPart === null) return;
    const rest = this.makeMeasureRest(multiRest);
    if (rest === null) return;
    rest.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
    addToMap(rest, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('score'));
    const num =
      multiRest.getAttribute('num') === null ? 1 : parseInt(multiRest.getAttributeValue('num')!);
    if (num > 1)
      rest
        .getAttribute('duration')!
        .setValue(String(parseFloat(rest.getAttributeValue('duration')!) * num));
    this.currentPart
      .getAttribute('currentDate')!
      .setValue(
        String(
          parseFloat(this.currentPart.getAttributeValue('currentDate')!) +
            parseFloat(rest.getAttributeValue('duration')!),
        ),
      );
  }

  private processRest(rest: Element): void {
    const s = new Element('rest');
    copyId(rest, s);
    s.addAttribute(new Attribute('date', this.getMidiTimeAsString()));
    const dur = this.computeDuration(rest);
    if (dur === 0.0) return;
    s.addAttribute(new Attribute('duration', String(dur)));
    this.addLayerAttribute(s);
    this.currentPart!.getAttribute('currentDate')!.setValue(
      String(parseFloat(this.currentPart!.getAttributeValue('currentDate')!) + dur),
    );
    addToMap(s, this.currentPart!.getFirstChildElement('dated')!.getFirstChildElement('score'));
    rest.addAttribute(new Attribute('date', s.getAttributeValue('date')!));
    rest.addAttribute(new Attribute('midi.dur', s.getAttributeValue('duration')!));
  }

  private processSpace(space: Element): void {
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
    this.processRest(space);
  }

  private processOctave(octave: Element): void {
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

    const timingData = this.computeControlEventTiming(octave, this.currentPart);
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
      const miscMap = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('miscMap')!;
      addToMap(trans, miscMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      let multiIDs = false;
      const parts = this.currentMsmMovement!.getChildElements('part');
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
          const miscMap = parts
            .get(p)
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!;
          addToMap(trans, miscMap);
          this.addLayerAttribute(trans);
          multiIDs = true;
        }
      }
    }
  }

  private processPedal(pedal: Element): void {
    if (pedal.getAttribute('dir') === null) {
      console.error(`Cannot process MEI element ${pedal.toXML()}. Missing attribute 'dir'.`);
      return;
    }
    const timingData = this.computeControlEventTiming(pedal, this.currentPart);
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
      pedalMapEntry.addAttribute(new Attribute('state', pedal.getAttributeValue('dir')!));
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
      const pedalMap = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('pedalMap')!;
      addToMap(pedalMapEntry, pedalMap);
    } else {
      const staffString = att.getValue();
      const staffs = staffString.split(/\s+/);
      let multiIDs = false;
      const parts = this.currentMsmMovement!.getChildElements('part');
      for (const staff of staffs) {
        for (let p = 0; p < parts.size(); ++p) {
          if (parts.get(p).getAttributeValue('number') !== staff) continue;
          const pedalMapEntry = new Element('pedal');
          pedalMapEntry.addAttribute(new Attribute('date', String(date)));
          pedalMapEntry.addAttribute(new Attribute('state', pedal.getAttributeValue('dir')!));
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
          const pedalMap = parts
            .get(p)
            .getFirstChildElement('dated')!
            .getFirstChildElement('pedalMap')!;
          addToMap(pedalMapEntry, pedalMap);
          this.addLayerAttribute(pedalMapEntry);
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
  private processNote(note: Element): void {
    if (this.currentPart === null) return;

    if (
      this.currentChord !== null &&
      this.currentChord.getAttribute('hasArticulations') !== null &&
      attribute('id', note) === null
    ) {
      note.addAttribute(
        new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', `meico_${uuidv4()}`),
      );
    }

    this.convertElement(note);
    this.checkSlurs(note);
    this.processArtic(note);

    const date = this.getMidiTime();
    const s = new Element('note');
    copyId(note, s);
    s.addAttribute(new Attribute('date', String(date)));

    const pitchdata: string[] = [];
    const pitch = this.computePitch(note, pitchdata);
    if (pitch === -1) return;
    s.addAttribute(new Attribute('midi.pitch', String(pitch)));
    s.addAttribute(new Attribute('pitchname', pitchdata[0]));
    s.addAttribute(new Attribute('accidentals', pitchdata[1]));
    s.addAttribute(new Attribute('octave', pitchdata[2]));

    if (note.getAttribute('accid') !== null) {
      this.accid.push(note);
    }

    const dur = this.computeDuration(note);
    s.addAttribute(new Attribute('duration', String(dur)));

    if (this.currentChord === null)
      this.currentPart.getAttribute('currentDate')!.setValue(String(date + dur));

    note.addAttribute(new Attribute('pnum', String(pitch)));
    note.addAttribute(new Attribute('date', String(date)));
    note.addAttribute(new Attribute('midi.dur', String(dur)));

    // handle ties
    let tie = 'n';
    const tieAtt = note.getAttribute('tie');
    if (tieAtt !== null) {
      tie = tieAtt.getValue().charAt(0);
    } else if (this.currentChord !== null && this.currentChord.getAttribute('tie') !== null) {
      tie = this.currentChord.getAttributeValue('tie')!.charAt(0);
    }
    switch (tie) {
      case 'n':
        break;
      case 'i':
        s.addAttribute(new Attribute('tie', 'true'));
        break;
      case 'm':
      case 't': {
        const ps = this.currentPart
          .getFirstChildElement('dated')!
          .getFirstChildElement('score')!
          .query("descendant::*[local-name()='note' and @tie]");
        for (let i = ps.size() - 1; i >= 0; --i) {
          const p = ps.get(i) as unknown as Element;
          if (
            p.getAttributeValue('midi.pitch') === s.getAttributeValue('midi.pitch') &&
            parseFloat(p.getAttributeValue('date')!) +
              parseFloat(p.getAttributeValue('duration')!) ===
              date
          ) {
            p.addAttribute(
              new Attribute('duration', String(parseFloat(p.getAttributeValue('duration')!) + dur)),
            );
            if (tie === 't') p.removeAttribute(p.getAttribute('tie')!);
            return;
          }
        }
      }
    }

    // handle lyrics
    for (const lyricsElem of this.lyrics) {
      s.appendChild(lyricsElem);
    }
    this.lyrics = [];

    this.addLayerAttribute(s);
    addToMap(s, this.currentPart.getFirstChildElement('dated')!.getFirstChildElement('score'));
  }

  /**
   * Clear the per-movement state. Called by {@link makeMovement} *before* it installs the
   * new cursor, so a movement never inherits the previous one's accidentals, open spans or
   * note index. {@link ppq}, {@link dontUseChannel10}, {@link movements} and
   * {@link performances} deliberately survive — they belong to the conversion, not to a
   * movement.
   */
  protected reset(): void {
    this.endingCounter = 0;
    this.currentMsmMovement = null;
    this.currentMdiv = null;
    this.currentWork = null;
    this.currentPerformance = null;
    this.currentPart = null;
    this.currentLayer = null;
    this.currentMeasure = null;
    this.currentChord = null;
    this.accid = [];
    this.endids = [];
    this.tstamp2s = [];
    this.lyrics = [];
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
  protected getMidiTime(): number {
    if (this.currentPart !== null)
      return parseFloat(this.currentPart.getAttributeValue('currentDate')!);
    if (this.currentMeasure !== null)
      return parseFloat(this.currentMeasure.getAttributeValue('date')!);
    if (this.currentMsmMovement === null) return 0.0;

    const parts = this.currentMsmMovement.getChildElements('part');
    let latestDate = 0.0;
    for (let i = parts.size() - 1; i >= 0; --i) {
      const date = parseFloat(parts.get(i).getAttributeValue('currentDate')!);
      if (latestDate < date) latestDate = date;
    }
    return latestDate;
  }

  protected getMidiTimeAsString(): string {
    if (this.currentPart !== null) return this.currentPart.getAttributeValue('currentDate')!;
    if (this.currentMeasure !== null) return this.currentMeasure.getAttributeValue('date')!;
    if (this.currentMsmMovement === null) return '0.0';

    const parts = this.currentMsmMovement.getChildElements('part');
    let latestDate = 0.0;
    for (let i = parts.size() - 1; i >= 0; --i) {
      const date = parseFloat(parts.get(i).getAttributeValue('currentDate')!);
      if (latestDate < date) latestDate = date;
    }
    return String(latestDate);
  }

  /** one measure in ticks under the time signature in force; `4 * ppq` is a whole note */
  protected getOneMeasureLength(msmPartContext: Element | null): number {
    const ts = this.getCurrentTimeSignature(msmPartContext);
    return (4.0 * this.ppq * ts[0]) / ts[1];
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
   */
  protected getCurrentTimeSignature(msmPartContext: Element | null): number[] {
    let es: Elements | null = null;
    if (msmPartContext !== null)
      es = msmPartContext
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getChildElements();
    if (es === null || es.size() === 0)
      es = this.currentMsmMovement!.getFirstChildElement('global')!
        .getFirstChildElement('dated')!
        .getFirstChildElement('timeSignatureMap')!
        .getChildElements();
    if (es.size() === 0 && this.currentWork !== null) {
      const meter = this.currentWork.getFirstChildElement('meter');
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
      es.size() === 0 ? 4.0 : parseFloat(es.get(es.size() - 1).getAttributeValue('denominator')!);
    const num =
      es.size() === 0 ? 4.0 : parseFloat(es.get(es.size() - 1).getAttributeValue('numerator')!);

    return [num, denom];
  }

  protected computeMeasureLength(numerator: number, denominator: number): number {
    return (4.0 * this.ppq * numerator) / denominator;
  }

  protected getPart(id: string): Element | null {
    if (id === null || id === '') return null;
    const parts = this.currentMsmMovement!.getChildElements('part');
    for (let i = parts.size() - 1; i >= 0; --i) {
      if (
        parts.get(i).getAttributeValue('number') === id ||
        getAttributeValue('id', parts.get(i)) === id
      )
        return parts.get(i);
    }
    return null;
  }

  protected addLayerAttribute(toThis: Element): void {
    const layer = this.currentLayer;
    if (layer === null) return;
    if (layer.getAttribute('def') !== null) {
      toThis.addAttribute(new Attribute('layer', layer.getAttributeValue('def')!));
    } else if (layer.getAttribute('n') !== null)
      toThis.addAttribute(new Attribute('layer', layer.getAttributeValue('n')!));
  }

  public parseTempo(tempo: Element, msmPartContext: Element | null): TempoData | null {
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
        : 1.0 / this.getCurrentTimeSignature(msmPartContext)[1];
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
        let tempoStyle = this.currentPerformance!.getGlobal()!
          .getHeader()!
          .getStyleDef(Mpm.TEMPO_STYLE, 'MEI export') as TempoStyle | null;
        if (tempoStyle === null)
          tempoStyle = this.currentPerformance!.getGlobal()!
            .getHeader()!
            .addStyleDef(Mpm.TEMPO_STYLE, 'MEI export') as TempoStyle | null;

        if (tempoStyle !== null && tempoStyle.getDef(descriptor) === undefined) {
          let tempoDef: TempoDef | null;
          if (tempoData.bpmString === null) tempoDef = TempoDef.createDefaultTempoDef(descriptor);
          else tempoDef = TempoDef.createTempoDef(descriptor, parseFloat(tempoData.bpmString));
          if (tempoDef !== null) tempoStyle.addDef(tempoDef);
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

  private getEndid(id: string): number {
    for (let i = 0; i < this.endids.length; ++i) {
      if (this.endids[i].getAttributeValue('endid') === id) return i;
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
  protected checkEndid(e: Element): void {
    const id = `#${getAttributeValue('id', e)}`;
    for (let j = this.getEndid(id); j >= 0; j = this.getEndid(id)) {
      this.endids[j].addAttribute(
        new Attribute(
          'date.end',
          String(
            this.getMidiTime() +
              (this.endids[j].getLocalName() === 'slur' ? 0.0 : this.computeDuration(e)),
          ),
        ),
      );
      this.endids.splice(j, 1);
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
  protected checkSlurs(e: Element): void {
    let slurs = this.currentMsmMovement!.getFirstChildElement('global')!
      .getFirstChildElement('dated')!
      .getFirstChildElement('miscMap')!
      .getChildElements('slur');

    for (let i = slurs.size() - 1; i >= 0; --i) {
      if (
        slurs.get(i).getAttributeValue('date') !== null &&
        parseFloat(slurs.get(i).getAttributeValue('date')!) > this.getMidiTime()
      )
        continue;
      if (slurs.get(i).getAttribute('date.end') !== null) {
        const endDate = parseFloat(slurs.get(i).getAttributeValue('date.end')!);
        if (endDate < this.getMidiTime()) continue;
        if (endDate === this.getMidiTime()) {
          e.addAttribute(new Attribute('slur', 't'));
          Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
          return;
        }
      }
      e.addAttribute(new Attribute('slur', 'im'));
      Mei2MsmMpmConverter.addSlurId(slurs.get(i), e);
    }

    if (this.currentPart !== null) {
      const layerId = Mei.getLayerId(Mei.getLayer(e));
      slurs = this.currentPart
        .getFirstChildElement('dated')!
        .getFirstChildElement('miscMap')!
        .getChildElements('slur');

      for (let i = slurs.size() - 1; i >= 0; --i) {
        if (!Mei2MsmMpmConverter.isSameLayer(slurs.get(i), layerId)) continue;
        if (
          slurs.get(i).getAttributeValue('date') !== null &&
          parseFloat(slurs.get(i).getAttributeValue('date')!) > this.getMidiTime()
        )
          continue;
        if (slurs.get(i).getAttribute('date.end') !== null) {
          const endDate = parseFloat(slurs.get(i).getAttributeValue('date.end')!);
          if (endDate < this.getMidiTime()) continue;
          if (endDate === this.getMidiTime()) {
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
  protected tstampToTicks(tstamp: string | null, msmPartContext: Element | null): number {
    if (tstamp === null || tstamp === '' || this.currentMeasure === null) return this.getMidiTime();

    let date = parseFloat(tstamp);
    date = date < 1.0 ? 0.0 : date - 1.0;

    const denom = this.getCurrentTimeSignature(msmPartContext)[1];
    const tstampToTicksConversionFactor = (4.0 * this.ppq) / denom;

    return (
      date * tstampToTicksConversionFactor +
      parseFloat(this.currentMeasure.getAttributeValue('date')!)
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
          const startid = startidAtt.getValue().trim().replace(/#/g, '').split(/\s+/)[0].trim();
          const node = this.allNotesAndChords.get(startid);
          if (node !== undefined) {
            const parent = node.getParent()!;
            event.detach();
            parent.insertChild(event, parent.indexOf(node));
            event.addAttribute(new Attribute('dontRepositionMeAgain', 'true'));
            return null;
          }
        }
      }
    }
    const tstamp = att === null ? null : att.getValue();
    const date: number = this.tstampToTicks(tstamp, msmPartContext);

    let tstamp2: Attribute | null = null;
    let endid: Attribute | null = null;
    let endDate: number | null = null;
    if (event.getAttribute('dur') !== null) {
      endDate = date + this.computeDuration(event);
    } else {
      tstamp2 = event.getAttribute('tstamp2.ges');
      if (tstamp2 === null) tstamp2 = event.getAttribute('tstamp2');
      if (tstamp2 !== null) {
        const ts2 = tstamp2.getValue().split('m+');
        if (ts2.length === 0) tstamp2 = null;
        else if (ts2.length === 1) {
          endDate = this.tstampToTicks(ts2[0], msmPartContext);
          tstamp2 = null;
        } else if (ts2[0] === '0') {
          endDate = this.tstampToTicks(ts2[1], msmPartContext);
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
  protected computeDuration(ofThis: Element): number {
    if (
      !ofThis
        .getLocalName()
        .match(/^(bTrem|chord|dynam|fTrem|halfmRpt|mRest|mSpace|note|octave|rest|tuplet|space)$/)
    ) {
      return 0.0;
    }

    if (ofThis.getAttribute('grace') !== null) return 0.0;

    let dur: number;
    const chordEnvironment = this.currentChord !== null;
    let focus = ofThis;

    {
      let sdur = '';
      if (ofThis.getAttribute('dur') !== null) {
        sdur = focus.getAttributeValue('dur')!;
      } else {
        if (chordEnvironment && this.currentChord!.getAttribute('dur') !== null) {
          focus = this.currentChord!;
          sdur = focus.getAttributeValue('dur')!;
        } else {
          if (this.currentPart === null) return 0.0;
          const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
          let durdefaults = this.currentPart
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!
            .getChildElements('dur.default');
          if (durdefaults.size() === 0) {
            durdefaults = this.currentMsmMovement!.getFirstChildElement('global')!
              .getFirstChildElement('dated')!
              .getFirstChildElement('miscMap')!
              .getChildElements('dur.default');
          }
          for (let i = durdefaults.size() - 1; i >= 0; --i) {
            if (
              durdefaults.get(i).getAttribute('layer') === null ||
              durdefaults.get(i).getAttributeValue('layer') === layerId
            ) {
              sdur = durdefaults.get(i).getAttributeValue('dur')!;
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
      if (focus.getAttribute('dots') !== null) {
        dots = parseInt(focus.getAttributeValue('dots')!);
      } else {
        if (focus.getAttribute('childDots') !== null)
          dots = parseInt(focus.getAttributeValue('childDots')!);
        if (dots === 0 && chordEnvironment && this.currentChord!.getAttribute('dots') !== null) {
          dots = parseInt(this.currentChord!.getAttributeValue('dots')!);
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
        if (e.getAttribute('numbase') === null || e.getAttribute('num') === null) return 0.0;
        dur *= parseFloat(e.getAttributeValue('numbase')!) / parseInt(e.getAttributeValue('num')!);
      }
    }

    // tupletSpans
    let tps: Element[];
    if (this.currentPart !== null) {
      tps = allChildElements(
        this.currentPart
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!
          .getFirstChildElement('tupletSpanMap')!,
        'tupletSpan',
      );
    } else {
      tps = allChildElements(
        this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!
          .getFirstChildElement('tupletSpanMap')!,
        'tupletSpan',
      );
    }

    for (let i = tps.length - 1; i >= 0; --i) {
      const ts = tps[i];
      if (
        ts.getAttribute('date.end') !== null &&
        parseFloat(ts.getAttributeValue('date.end')!) <= this.getMidiTime()
      ) {
        this.currentPart!.getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!
          .getFirstChildElement('tupletSpanMap')!
          .removeChild(ts);
        continue;
      }
      if (!Mei2MsmMpmConverter.isSameLayer(ts, Mei.getLayerId(this.currentLayer))) continue;
      if (parseFloat(ts.getAttributeValue('date')!) <= this.getMidiTime())
        dur *=
          parseFloat(ts.getAttributeValue('numbase')!) / parseInt(ts.getAttributeValue('num')!);
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
  protected computePitch(ofThis: Element, pitchdata: string[]): number {
    let pname: string;
    let accid = '';
    const layerId = Mei.getLayerId(Mei.getLayer(ofThis));
    let oct = 0.0;
    let trans = 0;
    let checkKeySign = false;

    if (
      ofThis.getAttribute('pname.ges') !== null &&
      ofThis.getAttributeValue('pname.ges') !== 'none'
    ) {
      pname = ofThis.getAttributeValue('pname.ges')!;
    } else {
      if (ofThis.getAttribute('pname') !== null) {
        pname = ofThis.getAttributeValue('pname')!;
        checkKeySign = true;
      } else {
        return -1.0;
      }
    }

    if (ofThis.getAttribute('oct.ges') !== null) {
      oct = parseFloat(ofThis.getAttributeValue('oct.ges')!);
    } else {
      if (ofThis.getAttribute('oct') !== null) {
        oct = parseFloat(ofThis.getAttributeValue('oct')!);
      } else {
        if (this.currentPart !== null) {
          let octs = this.currentPart
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!
            .getChildElements('oct.default');
          if (octs.size() === 0) {
            octs = this.currentMsmMovement!.getFirstChildElement('global')!
              .getFirstChildElement('dated')!
              .getFirstChildElement('miscMap')!
              .getChildElements('oct.default');
          }
          for (let i = octs.size() - 1; i >= 0; --i) {
            if (
              octs.get(i).getAttribute('layer') === null ||
              octs.get(i).getAttributeValue('layer') === layerId
            ) {
              oct = parseFloat(octs.get(i).getAttributeValue('oct.default')!);
              break;
            }
          }
        }
        ofThis.addAttribute(new Attribute('oct', String(oct)));
      }
    }

    if (ofThis.getAttribute('accid.ges') !== null) {
      accid = ofThis.getAttributeValue('accid.ges')!;
      checkKeySign = false;
    } else {
      if (ofThis.getAttribute('accid') !== null) {
        accid = ofThis.getAttributeValue('accid')!;
        if (accid !== '') checkKeySign = false;
      } else {
        for (let i = this.accid.length - 1; i >= 0; --i) {
          const anAccid = this.accid[i];
          if (
            anAccid.getAttribute('pname') !== null &&
            anAccid.getAttributeValue('pname') === pname &&
            anAccid.getAttribute('oct') !== null &&
            parseFloat(anAccid.getAttributeValue('oct')!) === oct
          ) {
            if (anAccid.getAttribute('accid.ges') !== null)
              accid = anAccid.getAttributeValue('accid.ges')!;
            else if (anAccid.getAttribute('accid') !== null)
              accid = anAccid.getAttributeValue('accid')!;
            checkKeySign = accid === '';
            break;
          }
        }
        if (checkKeySign) {
          const keySigMapLocal =
            this.currentPart === null
              ? null
              : this.currentPart
                  .getFirstChildElement('dated')!
                  .getFirstChildElement('keySignatureMap');
          const keySigMapGlobal = this.currentMsmMovement!.getFirstChildElement('global')!
            .getFirstChildElement('dated')!
            .getFirstChildElement('keySignatureMap');

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
              parseFloat(keySigLocal!.getAttributeValue('date')!) <
                parseFloat(keySigGlobal.getAttributeValue('date')!))
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
              let aPitch: number;
              if (a.getAttribute('midi.pitch') !== null)
                aPitch = parseFloat(a.getAttributeValue('midi.pitch')!);
              else if (a.getAttribute('pitchname') !== null)
                aPitch = pname2midi(a.getAttributeValue('pitchname')!);
              else continue;
              const pitchOfThis = pname2midi(pname) % 12;
              if (aPitch === pitchOfThis) {
                accid = a.getAttributeValue('value')!;
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
        const globalTrans = this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!
          .getChildElements('transposition');
        for (let i = globalTrans.size() - 1; i >= 0; --i) {
          if (
            globalTrans.get(i).getAttributeValue('date') !== null &&
            parseFloat(globalTrans.get(i).getAttributeValue('date')!) > this.getMidiTime()
          )
            continue;
          if (
            globalTrans.get(i).getAttribute('date.end') !== null &&
            parseFloat(globalTrans.get(i).getAttributeValue('date.end')!) <= this.getMidiTime()
          )
            break;
          if (!Mei2MsmMpmConverter.isSameLayer(globalTrans.get(i), layerId)) continue;
          trans += parseFloat(globalTrans.get(i).getAttributeValue('semi')!);
          break;
        }
      }
      {
        const globalAddTrans = this.currentMsmMovement!.getFirstChildElement('global')!
          .getFirstChildElement('dated')!
          .getFirstChildElement('miscMap')!
          .getChildElements('addTransposition');
        for (let i = globalAddTrans.size() - 1; i >= 0; --i) {
          if (
            globalAddTrans.get(i).getAttributeValue('date') !== null &&
            parseFloat(globalAddTrans.get(i).getAttributeValue('date')!) > this.getMidiTime()
          )
            continue;
          if (
            globalAddTrans.get(i).getAttribute('date.end') !== null &&
            parseFloat(globalAddTrans.get(i).getAttributeValue('date.end')!) <= this.getMidiTime()
          )
            continue;
          if (!Mei2MsmMpmConverter.isSameLayer(globalAddTrans.get(i), layerId)) continue;
          trans += parseFloat(globalAddTrans.get(i).getAttributeValue('semi')!);
        }
      }
      if (this.currentPart !== null) {
        {
          const localTrans = this.currentPart
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!
            .getChildElements('transposition');
          for (let i = localTrans.size() - 1; i >= 0; --i) {
            if (
              localTrans.get(i).getAttributeValue('date') !== null &&
              parseFloat(localTrans.get(i).getAttributeValue('date')!) > this.getMidiTime()
            )
              continue;
            if (
              localTrans.get(i).getAttribute('date.end') !== null &&
              parseFloat(localTrans.get(i).getAttributeValue('date.end')!) <= this.getMidiTime()
            )
              break;
            if (!Mei2MsmMpmConverter.isSameLayer(localTrans.get(i), layerId)) continue;
            trans += parseFloat(localTrans.get(i).getAttributeValue('semi')!);
            break;
          }
        }
        {
          const localAddTrans = this.currentPart
            .getFirstChildElement('dated')!
            .getFirstChildElement('miscMap')!
            .getChildElements('addTransposition');
          for (let i = localAddTrans.size() - 1; i >= 0; --i) {
            if (
              localAddTrans.get(i).getAttributeValue('date') !== null &&
              parseFloat(localAddTrans.get(i).getAttributeValue('date')!) > this.getMidiTime()
            )
              continue;
            if (
              localAddTrans.get(i).getAttribute('date.end') !== null &&
              parseFloat(localAddTrans.get(i).getAttributeValue('date.end')!) <= this.getMidiTime()
            )
              continue;
            if (!Mei2MsmMpmConverter.isSameLayer(localAddTrans.get(i), layerId)) continue;
            trans += parseFloat(localAddTrans.get(i).getAttributeValue('semi')!);
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
   * The `!` on `getRootElement()` carries this file's standing assumption that a movement
   * under conversion has a root element; it is the same idiom `XmlBase` uses for this exact
   * call. Narrowing it properly is T12's null policy, not a local idiom — a guard here
   * would turn today's TypeError on an empty MSM into a silent no-op.
   */
  public static msmCleanupSingle(msm: Msm): void {
    for (const node of Mei2MsmMpmConverter.msmScaffolding(msm.getRootElement()!)) {
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

      const parts = perf.getAllParts();
      for (let pp = 0; pp < perf.size(); ++pp) {
        const part = parts[pp];

        aMap = part.getDated()?.getMap(Mpm.DYNAMICS_MAP) ?? null;
        if (aMap !== null) maps.push(aMap);

        aMap = part.getDated()?.getMap(Mpm.TEMPO_MAP) ?? null;
        if (aMap !== null) maps.push(aMap);
      }
    }

    // go through all the maps' elements and finalize them
    for (const map of maps) {
      for (let e = 0; e < map.size(); ++e) {
        const d = map.getElement(e)!;

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
          if (next === null || parseFloat(next.getAttributeValue('date')!) > endDate) {
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
   */
  protected static reorderMeasureContent(measure: Element): void {
    const subtrees = measure.getChildElements();
    for (let i = subtrees.size() - 1; i >= 0; --i) {
      const subtree = subtrees.get(i);
      if (
        subtree
          .query("descendant-or-self::*[local-name()='staff' or local-name()='oStaff']")
          .size() === 0
      ) {
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
        if (parseFloat(n.getAttributeValue('date')!) < date) {
          gt.getAttribute('target.date')!.setValue(n.getAttributeValue('date')!);
          gt.getAttribute('target.id')!.setValue(`#${n.getAttributeValue('id')!}`);
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
   * **Not implemented — always 0.** Java computes a semitone offset here; this port never
   * ported it, so a displaced clef is converted as an undisplaced one. Latent for the
   * fixtures, which contain no `clef.dis`. Left as a stub rather than removed so the gap
   * stays visible and the call sites keep their shape against the Java original.
   */
  protected static processClefDis(_scoreStaffDef: Element): number {
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
    if (e.getAttribute('layer') !== null) {
      const layers = e.getAttributeValue('layer')!.trim().split(/\s+/);
      for (const layer of layers) {
        if (layer === layerId) return true;
      }
      return false;
    }
    return true;
  }
}

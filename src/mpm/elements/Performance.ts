import { Attribute, Element } from '../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../xml/AbstractXmlSubtree.js';
import {
  elementAt,
  err,
  filterMap,
  isErr,
  isOk,
  ok,
  pipe,
  unwrapOr,
  type Result,
} from '../../prelude/index.js';
import { type MpmParseError } from './parseError.js';
import {
  allChildElements,
  attribute,
  firstChildElement,
  getAttributeValue,
  requireAttribute,
} from '../../xml/tree.js';
import { MissingNodeError } from '../../xml/errors.js';
import type { Dated } from './Dated.js';
import {
  ARTICULATION_MAP,
  ASYNCHRONY_MAP,
  DYNAMICS_MAP,
  IMPRECISION_MAP_DYNAMICS,
  IMPRECISION_MAP_TIMING,
  IMPRECISION_MAP_TONEDURATION,
  IMPRECISION_MAP_TUNING,
  METRICAL_ACCENTUATION_MAP,
  MOVEMENT_MAP,
  MPM_NAMESPACE,
  ORNAMENTATION_MAP,
  RUBATO_MAP,
  TEMPO_MAP,
} from '../names.js';
import { Global } from './Global.js';
import { Part } from './Part.js';
import { GenericMap } from './maps/GenericMap.js';
import type { RenderContext, RenderOptions } from '../RenderOptions.js';
import type { Msm } from '../../msm/Msm.js';
import type { TempoMap } from './maps/TempoMap.js';
import type { DynamicsMap } from './maps/DynamicsMap.js';
import type { RubatoMap } from './maps/RubatoMap.js';
import type { AsynchronyMap } from './maps/AsynchronyMap.js';
import type { ImprecisionMap } from './maps/ImprecisionMap.js';
import type { MetricalAccentuationMap } from './maps/MetricalAccentuationMap.js';
import type { OrnamentationMap } from './maps/OrnamentationMap.js';
import type { ArticulationMap } from './maps/ArticulationMap.js';
import type { MovementMap } from './maps/MovementMap.js';

/**
 * The coordinate system a scope's dates are currently expressed in. Each phase names what the
 * performance date attributes hold at that point:
 *
 * | phase | `date.perf` | `milliseconds.date` | produced by |
 * |---|---|---|---|
 * | `symbolic` | the MSM's date, rescaled to this PPQ | absent | the collection stages |
 * | `displaced` | moved by the rubato pass | absent | the rubato stages |
 * | `milliseconds` | unchanged from `displaced` | present | the tempo stages |
 *
 * A stage declares the phase it consumes and the phase it produces, so hoisting a stage across a
 * boundary is a compile error rather than a silent change of output — which the fixture byte
 * probe does not catch. Two edges are enforced
 * this way: articulation's symbolic half cannot sink below rubato, and the tempo pass cannot
 * rise above it.
 *
 * A pass that touches none of these attributes is written `<P extends Phase>`: the metrical
 * accentuation and dynamics passes read the map's *symbolic key* and write `velocity`, so they
 * commute with rubato — see {@link Performance.renderPartAccentuation}.
 *
 * `phase` is a phantom property in the sense of `src/units.ts`: it is `declare`d, so it has no
 * runtime existence and the mechanism emits nothing. The phase changes are the `as … as`
 * assertions on the return lines of the three timing stages.
 */
type Phase = 'symbolic' | 'displaced' | 'milliseconds';
declare const phase: unique symbol;
type At<S, P extends Phase> = S & { readonly [phase]: P };

/**
 * The twelve MPM instruction maps in effect for one render scope: either the {@link Global}
 * environment, or one {@link Part} with the global maps as its per-field fallback (a local
 * map shadows the global one of the same type — see {@link Performance.resolvePartMaps}).
 */
interface MpmMaps {
  readonly rubato: RubatoMap | null;
  readonly tempo: TempoMap | null;
  readonly asynchrony: AsynchronyMap | null;
  readonly imprecisionTiming: ImprecisionMap | null;
  readonly imprecisionDynamics: ImprecisionMap | null;
  readonly imprecisionToneduration: ImprecisionMap | null;
  readonly imprecisionTuning: ImprecisionMap | null;
  readonly dynamics: DynamicsMap | null;
  readonly movement: MovementMap | null;
  readonly metricalAccentuation: MetricalAccentuationMap | null;
  readonly ornamentation: OrnamentationMap | null;
  readonly articulation: ArticulationMap | null;
}

/** The MSM maps of one scope, collected and primed for the render passes. */
interface CollectedMaps {
  /**
   * Every collected map, in collection order. Rubato and tempo run over this whole list;
   * the individually named maps below are the ones later stages also address on their own.
   */
  readonly maps: readonly GenericMap[];
  readonly timeSignatureMap: GenericMap | null;
  readonly pedalMap: GenericMap | null;
}

/** {@link CollectedMaps} for a part, which additionally has a `score`. */
interface PartMaps extends CollectedMaps {
  readonly score: GenericMap | null;
}

/** {@link PartMaps} plus the two maps the part's render passes create. */
interface PartRender extends PartMaps {
  readonly channelVolumeMap: GenericMap | null;
  readonly positionMap: GenericMap | null;
}

/**
 * The state {@link Performance.perform}'s fold carries, one interface per stage boundary.
 *
 * A stage's parameter type is everything it may read; the difference between its parameter and
 * its return type is everything it writes into the fold. What a stage needs that is *not* state
 * — the resolved MPM maps for one scope, the part's `<dated>`, the render context — it takes as
 * further arguments.
 *
 * Three ordering edges follow from these shapes alone, since a stage cannot be handed a field no
 * earlier stage has produced:
 *
 * - `convertPPQ` runs first: {@link Performance.cloneForRender} is the only producer of a
 *   `clone`, and every later stage requires one.
 * - {@link Performance.renderGlobal} runs before the parts: it is the only producer of a
 *   {@link GlobalRender}, which {@link Performance.renderParts} requires.
 * - the dynamics pass runs before metrical accentuation: it is what widens {@link PartMaps} into
 *   {@link PartRender}, which the accentuation stage requires. Accentuation *adds* to a note's
 *   `velocity` and skips notes that have none, so with no dynamics pass before it there is
 *   nothing to accentuate.
 *
 * A fourth is enforced by an absence: `msm` is in {@link RenderInput} and in nothing after it, so
 * no stage past the clone can reach the caller's document.
 */
interface RenderInput {
  readonly ctx: RenderContext;
  readonly msm: Msm;
}

/** {@link RenderInput} after stage 1: the caller's MSM is gone, its rescaled copy is here. */
interface ClonedMsm {
  readonly ctx: RenderContext;
  readonly clone: Msm;
}

/** {@link ClonedMsm} after stage 2. */
interface WithGlobalMaps extends ClonedMsm {
  readonly globalMaps: MpmMaps;
}

/** {@link WithGlobalMaps} after stage 3. */
interface WithGlobalRender extends WithGlobalMaps {
  readonly global: GlobalRender;
}

/**
 * What the global scope hands the part scope, and the token that says it ran.
 *
 * The `timeSignatureMap` is the per-part fallback for parts that have none of their own. The
 * *other* thing the global scope leaves behind has no field here because it is not in the fold
 * at all: {@link Performance.distributeGlobalOrnamentation} writes `ornament.*` attributes onto
 * the affected parts' score notes, which the part passes consume. Requiring this record is what
 * keeps a part from being rendered before that has happened.
 */
interface GlobalRender {
  readonly timeSignatureMap: GenericMap | null;
}

/**
 * An MPM `<performance>` element: one complete interpretation of a piece.
 * Port of meico.mpm.elements.Performance
 *
 * A performance owns a {@link Global} environment (style definitions and instruction maps
 * that apply to every part) and a list of {@link Part}s (the same, per MSM part). Its
 * reason to exist is {@link perform}, which reads an MSM and returns an augmented copy
 * carrying millisecond timing, velocities and articulation — see that method's comment for
 * the stage order, which is the load-bearing part of this class.
 *
 * Every map class is imported *for its type only*, so this file cannot call the maps' **static**
 * methods; {@link renderTempoToMap} and {@link renderMillisecondsModifiersToMap} are private
 * re-implementations of `TempoMap.renderTempoToMap` and
 * `OrnamentationMap.renderMillisecondsModifiersToMap` for that reason. Collapsing either copy
 * would need a *value* import here, which changes this module's ESM evaluation order on the
 * byte-compared rendering path. Both bodies are character-identical to their originals
 * (`TempoMap.ts:335-357`, `OrnamentationMap.ts:406-448`) apart from the `private` keyword and
 * the wrapping it forces, so one diff re-checks that they are still in sync.
 */
export class Performance extends AbstractXmlSubtree {
  /**
   * The `name` attribute node, held so {@link setName} writes where {@link readFrom} read.
   *
   * Unlike `Part`'s namesake there is no defaulting path here — {@link readFrom} REFUSES a
   * `<performance>` with no `name` — so the placeholder this is initialised to is never the one
   * in the document: `readFrom` always replaces it with the declared node before the object can
   * escape the factory.
   */
  private nameAttr: Attribute;
  private pulsesPerQuarter = 720;
  private global: Global | null = null;
  private readonly parts: Part[] = [];

  private constructor() {
    super();
    this.nameAttr = new Attribute('name', '');
  }

  /**
   * Create a performance from scratch: `name`, optionally `pulsesPerQuarter` and `id`.
   *
   * Split from {@link fromXml} — same return type on both arms, so the overload carried no
   * information. Note what the split makes plain: `pulsesPerQuarter` and `id` were only ever
   * meaningful for THIS form, but the shared implementation signature offered them to the
   * parse arm too, where they were silently ignored.
   */
  static fromName(
    name: string,
    pulsesPerQuarter?: number,
    id?: string,
  ): Result<Performance, MpmParseError> {
    const p = new Performance();
    const performance = new Element('performance', MPM_NAMESPACE);
    performance.addAttribute(new Attribute('name', name));
    const parsed = p.readFrom(performance);
    if (isErr(parsed)) return parsed;
    if (pulsesPerQuarter !== undefined) p.setPulsesPerQuarter(pulsesPerQuarter);
    if (id !== undefined) p.setId(id);
    return parsed;
  }

  /**
   * Create a performance by parsing an existing `<performance>` element.
   *
   * A `<performance>` with no `@name` is the one thing a document can get wrong here, and the
   * `Result` (see `elements/parseError.ts`) is what distinguishes "this MPM has no performances"
   * from "it has one that could not be read".
   */
  static fromXml(xml: Element | null): Result<Performance, MpmParseError> {
    if (xml === null) return err({ kind: 'noElement', what: 'Performance' });
    return new Performance().readFrom(xml);
  }

  /**
   * After this has run, {@link getXml} returns the very element passed in — `setXml` stores
   * it verbatim rather than copying, so the attributes cached below ({@link nameAttr},
   * {@link id}, the `pulsesPerQuarter` attribute) stay live views onto that element and
   * the setters write through to the document.
   *
   * Parsing is not read-only: a `<performance>` without `pulsesPerQuarter` gets one added
   * (defaulting to 720) and one without a `<global>` child gets an empty one appended, so
   * that every performance is renderable afterwards. `<part>` children that fail to parse
   * are skipped, and the reason `Part.fromXml` gives is dropped with them.
   */
  private readFrom(xml: Element): Result<Performance, MpmParseError> {
    const name = attribute('name', xml);
    if (name === null || name.getValue() === '')
      return err({ kind: 'missingAttribute', what: 'Performance', attribute: 'name' });
    this.setXml(xml);
    this.nameAttr = name;
    this.id = attribute('id', this.getXml());

    let ppqAtt = attribute('pulsesPerQuarter', this.getXml());
    if (ppqAtt === null) {
      ppqAtt = new Attribute('pulsesPerQuarter', '720');
      this.getXml().addAttribute(ppqAtt);
      this.pulsesPerQuarter = 720;
    } else {
      this.pulsesPerQuarter = parseInt(ppqAtt.getValue());
    }

    const globalElt = firstChildElement('global', this.getXml());
    if (globalElt === null) {
      const fresh = Global.createGlobal();
      if (isErr(fresh))
        return err({ kind: 'childFailed', what: 'Performance', cause: fresh.error });
      this.global = fresh.value;
      this.getXml().appendChild(this.global.getXml());
    } else {
      // A `<global>` that will not parse leaves this null and the performance usable; see
      // {@link requireGlobalDated}.
      this.global = unwrapOr(Global.createGlobal(globalElt), null);
    }

    const parts = allChildElements(this.getXml(), 'part');
    for (const part of filterMap(parts, (e) => unwrapOr(Part.fromXml(e), null))) {
      part.setGlobal(this.global);
      this.parts.push(part);
    }
    return ok(this);
  }

  /** Not an entry point — see {@link Global.parseData} for the shape and the reason. */
  protected parseData(): never {
    throw new Error('Performance is constructed by its factory; parseData is not an entry point.');
  }

  size(): number {
    return this.parts.length;
  }
  getAllParts(): readonly Part[] {
    return this.parts;
  }

  /**
   * The first part with this number. {@link getPartByName} and {@link getPartByMidi} are the
   * other two lookups; each likewise returns the first match.
   */
  getPart(number: number): Part | null {
    for (const p of this.parts) if (p.getNumber() === number) return p;
    return null;
  }

  getPartByName(name: string): Part | null {
    for (const p of this.parts) if (p.getName() === name) return p;
    return null;
  }

  getPartByMidi(midiChannel: number, midiPort: number): Part | null {
    for (const p of this.parts)
      if (p.getMidiChannel() === midiChannel && p.getMidiPort() === midiPort) return p;
    return null;
  }

  /** Null is accepted and refused, as `Performance.java`'s `part == null` does. */
  addPart(part: Part): boolean {
    if (this.parts.includes(part)) return false;
    const parent = part.getXml().getParent();
    if (parent === null || parent !== this.getXml()) {
      part.getXml().detach();
      this.getXml().appendChild(part.getXml());
    }
    part.setGlobal(this.getGlobal());
    return this.parts.push(part) > 0;
  }

  removePartByNumber(number: number): void {
    this.removePartsWhere((part) => part.getNumber() === number);
  }

  removePartByName(name: string): void {
    this.removePartsWhere((part) => part.getName() === name);
  }

  /**
   * Remove every part the predicate accepts, from the list and from the XML. Walked backwards
   * and spliced per match, so a removal cannot make the walk skip the next one.
   */
  private removePartsWhere(matches: (part: Part) => boolean): void {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const part = elementAt(this.parts, i, 'part');
      if (!matches(part)) continue;
      this.getXml().removeChild(part.getXml());
      this.parts.splice(i, 1);
    }
  }

  removePart(part: Part): void {
    const idx = this.parts.indexOf(part);
    if (idx !== -1) {
      this.getXml().removeChild(part.getXml());
      this.parts.splice(idx, 1);
    }
  }

  getGlobal(): Global | null {
    return this.global;
  }

  /**
   * The global environment's `dated`, which every render stage reads.
   *
   * {@link readFrom} builds a `<global>` when the document has none, but a `<global>` that will
   * not PARSE leaves {@link global} null and the performance usable — so a caller really can
   * hold a `Performance` whose `global` is null and call `perform` on it. Java NPEs on the same
   * input (`Performance.java`'s `this.global.getDated()`), so this throws too, naming which half
   * was missing.
   */
  private requireGlobalDated(): Dated {
    const global = this.global;
    if (global === null)
      throw new MissingNodeError(
        `the performance '${this.getName()}' has no readable <global> environment`,
      );
    return global.requireDated();
  }
  getName(): string {
    return this.nameAttr.getValue();
  }
  setName(name: string): void {
    this.nameAttr.setValue(name);
  }
  getPulsesPerQuarter(): number {
    return this.pulsesPerQuarter;
  }
  getPPQ(): number {
    return this.getPulsesPerQuarter();
  }
  setPulsesPerQuarter(ppq: number): void {
    this.pulsesPerQuarter = ppq;
    // Re-read from the element on every call, as Java does. `readFrom` ADDS a
    // `pulsesPerQuarter` where the document omits one, so a constructed performance always
    // carries the attribute this writes to.
    requireAttribute('pulsesPerQuarter', this.getXml()).setValue(String(ppq));
  }
  setPPQ(ppq: number): void {
    this.setPulsesPerQuarter(ppq);
  }

  getCorrespondingPart(msmPart: Element | null): Part | null {
    if (msmPart === null) return null;
    let mpmPart = this.getPart(parseInt(getAttributeValue('number', msmPart)));
    if (mpmPart === null) {
      mpmPart = this.getPartByName(getAttributeValue('name', msmPart));
    }
    return mpmPart;
  }

  /**
   * Wrap one named MSM map (`score`, `timeSignatureMap`, `pedalMap`, …) found under
   * `msmDated` in a {@link GenericMap}, register it for timing processing and prime its
   * elements with the `.perf` and `modified` attributes that the render passes write into.
   *
   * Two effects the callers depend on: the map is **appended to `list`**, which is the
   * collection {@link perform} later runs rubato and tempo over, *and* it is returned so a
   * caller can also address it individually. Returning null means the MSM has no such map.
   */
  private static addMsmMapToList(
    mapName: string,
    msmDated: Element | null,
    list: GenericMap[],
  ): GenericMap | null {
    if (msmDated === null) return null;
    const e = firstChildElement(mapName, msmDated);
    if (e !== null) {
      const m = GenericMap.createGenericMap(e);
      if (isOk(m)) {
        list.push(m.value);
        Performance.addPerformanceTimingAttributes(m.value);
        Performance.addModifiedAttributes(m.value);
        return m.value;
      }
    }
    return null;
  }

  /**
   * Seed the performance timing attributes: `date.perf` (always), plus `duration.perf` and
   * `date.end.perf` where the symbolic counterparts exist. Every render pass edits these
   * `.perf` attributes and leaves the symbolic `date`/`duration`/`date.end` untouched, so
   * the original musical time stays readable next to the performed time.
   */
  private static addPerformanceTimingAttributes(map: GenericMap): void {
    if (map.isEmpty()) return;
    for (const e of map.getAllElements()) {
      e.value.addAttribute(new Attribute('date.perf', getAttributeValue('date', e.value)));
      const duration = attribute('duration', e.value);
      if (duration !== null)
        e.value.addAttribute(new Attribute('duration.perf', duration.getValue()));
      const dateEnd = attribute('date.end', e.value);
      if (dateEnd !== null)
        e.value.addAttribute(new Attribute('date.end.perf', dateEnd.getValue()));
    }
  }

  /** Mark every element of the map as touched by performance rendering (empty `modified`). */
  private static addModifiedAttributes(map: GenericMap): void {
    if (map.isEmpty()) return;
    for (const e of map.getAllElements()) e.value.addAttribute(new Attribute('modified', ''));
  }

  /**
   * Render this performance into `msm`: returns an **augmented copy** carrying millisecond
   * timing, velocities, articulation and ornamentation. The input is never modified — the
   * first thing this does is clone it.
   *
   * ## The stage order is the algorithm
   *
   * Every pass mutates the `.perf` / `milliseconds.*` attributes that the *previous* pass
   * produced, so reordering any two of them silently changes the output. Java runs exactly this
   * order (Performance.java:385-548) and so must this. The four stages are folded over a state
   * that is declared one interface per boundary — {@link RenderInput} → {@link ClonedMsm} →
   * {@link WithGlobalMaps} → {@link WithGlobalRender}:
   *
   * 1. {@link cloneForRender} — clone, rename, and rescale to this performance's PPQ.
   * 2. {@link resolveGlobalMaps} — the global MPM maps, read once here and reused as the
   *    per-part fallback in stage 4.
   * 3. {@link renderGlobal} — the MSM's global maps.
   * 4. {@link renderParts} — every MSM part, one at a time, via {@link renderPart}.
   *
   * Stages 3 and 4 are themselves folds of the same shape, over {@link CollectedMaps} and
   * {@link PartMaps}: collect the MSM maps, run the symbolic passes, cross into the millisecond
   * domain with the tempo pass, then run the millisecond passes. The state is **not** immutable:
   * the maps are views onto the clone's XML and the passes write through them.
   *
   * ## Which edges are mechanised, and which are only written down
   *
   * Enforced by the compiler: everything in {@link RenderInput}'s comment (PPQ first, global
   * before parts, dynamics before accentuation) and everything in {@link Phase}'s (articulation's
   * symbolic half before rubato, rubato before tempo, every millisecond pass after tempo,
   * articulation's and ornamentation's millisecond halves after their symbolic ones).
   *
   * Written down only, and pinned by `Performance.test.ts`'s "stage order" block:
   *
   * - *asynchrony before timing imprecision*, in both millisecond stages. Not a commuting pair,
   *   although two additive millisecond shifts look like one: an imprecision draw is indexed on
   *   the note's millisecond date, so shifting first changes which value is drawn.
   * - *the four imprecision maps last, in the order timing, dynamics, toneduration, tuning* —
   *   an RNG draw order, and therefore byte-visible (RULE F7's seeds are derived from the
   *   ordinal these calls advance).
   * - *`channelVolumeMap` and `positionMap` stay out of `collected.maps`*, so that neither the
   *   rubato loop nor the tempo loop reaches them; they get their own tempo+asynchrony
   *   treatment in {@link renderPartMilliseconds}, which is what keeps rubato's wobble out of
   *   the dynamics and position curves.
   * - *parts are rendered in document order* — they are independent of each other except
   *   through `ctx` (below), and that is enough to make the order byte-visible.
   * - *articulation's millisecond half before ornamentation's*, on the score. The two are
   *   additive shifts of the same two attributes and commute as things stand. They would stop
   *   commuting for an ornament that sets an absolute `ornament.milliseconds.duration`, which
   *   measures from a `milliseconds.date` that articulation would already have moved — and no
   *   fixture has one.
   * - *rubato and tempo interleave per map* in {@link renderGlobalTiming}, which is a shape
   *   preserved rather than an edge enforced; the reason is with that method.
   *
   * ## The one cross-part cell
   *
   * `ctx.streamOrdinal` is the only sequential state in the renderer that spans parts. It has
   * exactly one consumer: `ImprecisionMap.renderImprecisionToMap` reads and increments it
   * before any early return, so it counts *calls* rather than distributions, and feeds
   * `deriveSeed(seed, ordinal, impIndex)`. Seeded imprecision output therefore depends on the
   * global order of imprecision calls across all parts, which is why the part loop's order is
   * an ordering edge like any other. It is passed as an explicit argument to every stage that
   * can advance it and is otherwise inert.
   *
   * @param msm the score to perform; left unmodified
   * @param options render knobs. Every default is the historic value, so omitting them
   *   or passing `{}` renders as this method did before they existed.
   * @returns a new Msm with performance data added
   */
  perform(msm: Msm, options?: RenderOptions): Msm {
    // One context per call, local to it, passed by reference down the render chain. It is
    // never stored anywhere that outlives this method (RULE I1, boundary 6).
    const ctx: RenderContext = { options: options ?? {}, streamOrdinal: 0 };

    const rendered = pipe(
      { ctx, msm },
      (state) => this.cloneForRender(state),
      (state) => this.resolveGlobalMaps(state),
      (state) => this.renderGlobal(state),
      (state) => this.renderParts(state),
    );

    return rendered.clone;
  }

  /**
   * Stage 1. The copy every later stage mutates, named after the performance and rescaled:
   * `convertPPQ` rewrites every symbolic `date`, `date.end` and `duration` to this
   * performance's resolution, and everything downstream assumes that has already happened.
   *
   * The returned state is built field by field rather than spread from the input, which is what
   * drops `msm`: past this line the caller's document is unreachable from the fold.
   */
  private cloneForRender(state: RenderInput): ClonedMsm {
    const clone = state.msm.clone();
    const origFile = clone.getFile();
    if (origFile !== null) {
      const dotIdx = origFile.lastIndexOf('.');
      const base = dotIdx > 0 ? origFile.substring(0, dotIdx) : origFile;
      clone.setFile(`${base}_${this.getName()}.msm`);
    }

    clone.convertPPQ(this.getPPQ());
    return { ctx: state.ctx, clone };
  }

  /**
   * Stage 2. The global environment's instruction maps, read once per render. Every part
   * that does not bring its own map of a given type falls back to the one collected here
   * ({@link resolvePartMaps}), so this runs before any rendering.
   *
   * The one stage that reads nothing from the state — its whole input is `this` — and it is in
   * the fold because what it *writes* is what stages 3 and 4 read.
   */
  private resolveGlobalMaps(state: ClonedMsm): WithGlobalMaps {
    const dated = this.requireGlobalDated();
    return {
      ...state,
      globalMaps: {
        rubato: dated.getMapOfKind(RUBATO_MAP),
        tempo: dated.getMapOfKind(TEMPO_MAP),
        asynchrony: dated.getMapOfKind(ASYNCHRONY_MAP),
        imprecisionTiming: dated.getMapOfKind(IMPRECISION_MAP_TIMING),
        imprecisionDynamics: dated.getMapOfKind(IMPRECISION_MAP_DYNAMICS),
        imprecisionToneduration: dated.getMapOfKind(IMPRECISION_MAP_TONEDURATION),
        imprecisionTuning: dated.getMapOfKind(IMPRECISION_MAP_TUNING),
        dynamics: dated.getMapOfKind(DYNAMICS_MAP),
        movement: dated.getMapOfKind(MOVEMENT_MAP),
        metricalAccentuation: dated.getMapOfKind(METRICAL_ACCENTUATION_MAP),
        ornamentation: dated.getMapOfKind(ORNAMENTATION_MAP),
        articulation: dated.getMapOfKind(ARTICULATION_MAP),
      },
    };
  }

  /**
   * Stage 3. The MSM's *global* maps, as a fold of three stages over {@link CollectedMaps}:
   * they get their `.perf` attributes, global ornamentation is distributed to the parts it
   * affects, rubato and tempo turn symbolic dates into milliseconds, and asynchrony and timing
   * imprecision then shift them.
   *
   * The projection at the end is what stage 4 requires: see {@link GlobalRender}.
   */
  private renderGlobal(state: WithGlobalMaps): WithGlobalRender {
    const { clone, globalMaps: mpm, ctx } = state;
    // `Msm.getGlobal()` answers null for an MSM with no `<global>`, and that null flows on
    // into `collectGlobalMaps`, which takes `Element | null`.
    const globalElt = clone.getGlobal();
    const globalDated = globalElt === null ? null : firstChildElement('dated', globalElt);

    const rendered = pipe(
      Performance.collectGlobalMaps(globalDated),
      (collected) => this.distributeGlobalOrnamentation(collected, clone, mpm.ornamentation, ctx),
      (collected) => this.renderGlobalTiming(collected, mpm),
      (collected) => Performance.renderGlobalMilliseconds(collected, mpm, ctx),
    );

    return { ...state, global: { timeSignatureMap: rendered.timeSignatureMap } };
  }

  /**
   * The MSM's global maps, in collection order — `addMsmMapToList` appends in call order and
   * the rubato and tempo loops walk that list, so this order is the order they are processed
   * in. The two named handles **alias entries of the same list**; they are named because later
   * stages address them individually as well.
   */
  private static collectGlobalMaps(globalDated: Element | null): At<CollectedMaps, 'symbolic'> {
    const maps: GenericMap[] = [];
    Performance.addMsmMapToList('keySignatureMap', globalDated, maps);
    const timeSignatureMap = Performance.addMsmMapToList('timeSignatureMap', globalDated, maps);
    Performance.addMsmMapToList('sectionMap', globalDated, maps);
    Performance.addMsmMapToList('sequencingMap', globalDated, maps);
    Performance.addMsmMapToList('markerMap', globalDated, maps);
    const pedalMap = Performance.addMsmMapToList('pedalMap', globalDated, maps);
    // Entering the first phase: `addPerformanceTimingAttributes` has just copied every `date`
    // into `date.perf`, so the performed dates are exactly the symbolic ones.
    return { maps, timeSignatureMap, pedalMap } as CollectedMaps as At<CollectedMaps, 'symbolic'>;
  }

  /**
   * Global ornamentation, inlined from OrnamentationMap.renderGlobalOrnamentationToParts
   * because this file only type-imports the map classes (see the class comment). It adds
   * modifier attributes to the affected parts' notes; those become performance attributes
   * in the per-part processing further down.
   *
   * It reads nothing from the folded state and returns it untouched, hence generic in the state
   * rather than tied to a phase. Its effect is on the *parts*' scores, and what keeps the part
   * stages downstream of it is {@link GlobalRender}, not this return value.
   *
   * PARITY NOTE (divergence, benign, do not "fix" without a decision): the reference guard is
   * `(ornamentationMap == null) || ornamentationMap.isEmpty()` (OrnamentationMap.java:215);
   * this tests only for null, so an *empty* global ornamentationMap reaches
   * `renderGlobalOrnamentationMap` where Java returns early. The reachable behaviour is
   * identical — with no ornament entries the apply loop runs zero times — and the one
   * observable difference, an error logged when neither header is set, cannot occur for a
   * global map, since a `Global` always has a `Header`. Java also evaluates
   * `getAllMsmPartsAffectedByGlobalMap` unconditionally where this skips it for a null map;
   * that method only reads.
   */
  private distributeGlobalOrnamentation<S>(
    collected: S,
    clone: Msm,
    ornamentationMap: OrnamentationMap | null,
    ctx: RenderContext,
  ): S {
    if (ornamentationMap !== null) {
      const affectedParts = this.getAllMsmPartsAffectedByGlobalMap(clone, ORNAMENTATION_MAP);
      const mapsToOrnament = filterMap(affectedParts, (part) => {
        const score = firstChildElement('score', firstChildElement('dated', part));
        return score === null ? null : unwrapOr(GenericMap.createGenericMap(score), null);
      });
      ornamentationMap.renderGlobalOrnamentationMap(mapsToOrnament, ctx);
    }
    return collected;
  }

  /**
   * The global symbolic → millisecond crossing. Rubato and tempo are interleaved in one pass
   * over the collected maps, exactly as the reference has them: rubato shifts a map's symbolic
   * dates and tempo immediately converts that map.
   *
   * The interleave is a shape preserved, not a dependency. Each pass reads and writes only the
   * map it is handed and keeps no state between calls (`RubatoMap.renderRubatoToMap` and
   * `TempoMap.renderTempoToMap` are local-variable-only over `this.elements`), and the maps
   * collected here are disjoint, so splitting the loop in two is equivalent by construction — a
   * negative control that split it produced byte-identical output on all 20 traced scenarios.
   * It stays interleaved because this is a parity-frozen path and the reference's shape is the
   * shape.
   *
   * The interleaving is why this stage's signature skips a phase: each map passes through
   * `displaced` alone inside the loop body, so the state as a whole goes from `symbolic`
   * straight to `milliseconds`. The part scope, where the two passes run over different map
   * sets, does rest in `displaced` — {@link renderPartRubato} to {@link renderPartTiming}.
   */
  private renderGlobalTiming(
    collected: At<CollectedMaps, 'symbolic'>,
    mpm: MpmMaps,
  ): At<CollectedMaps, 'milliseconds'> {
    for (const m of collected.maps) {
      if (mpm.rubato !== null) mpm.rubato.renderRubatoToMap(m);
      Performance.renderTempoToMap(m, this.getPPQ(), mpm.tempo);
    }
    return collected as CollectedMaps as At<CollectedMaps, 'milliseconds'>;
  }

  /** The global millisecond-domain passes: both act on the pedal map, in this order. */
  private static renderGlobalMilliseconds(
    collected: At<CollectedMaps, 'milliseconds'>,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): At<CollectedMaps, 'milliseconds'> {
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(collected.pedalMap);
    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(collected.pedalMap, true, ctx);
    return collected;
  }

  /**
   * Stage 4. Every MSM part in document order. A part with no MPM counterpart is still
   * performed — it just falls back to the global maps throughout — but a part with no
   * `<dated>` is skipped entirely, since there is nothing to render into.
   */
  private renderParts(state: WithGlobalRender): WithGlobalRender {
    for (const msmPart of state.clone.getParts()) {
      const mpmPart = this.getCorrespondingPart(msmPart);
      if (mpmPart === null)
        console.error(
          `No MPM part found that corresponds to MSM part ${getAttributeValue('number', msmPart)} "${getAttributeValue('name', msmPart)}"`,
        );

      const dated = firstChildElement('dated', msmPart);
      if (dated === null) continue;
      this.renderPart(dated, mpmPart, state);
    }
    return state;
  }

  /**
   * One part, as a fold of seven stages over {@link PartMaps}: three passes that commute with
   * rubato, then the one that does not, then rubato, then the millisecond side.
   *
   * The chain returns nothing. Everything it produced is in the clone's XML, which the maps in
   * the folded state are views onto.
   */
  private renderPart(dated: Element, mpmPart: Part | null, state: WithGlobalRender): void {
    const mpm = Performance.resolvePartMaps(mpmPart, state.globalMaps);
    const { ctx, global } = state;
    pipe(
      Performance.collectPartMaps(dated),
      (part) => this.renderPartVoices(part, dated, mpm, ctx),
      (part) => this.renderPartAccentuation(part, mpm, global),
      (part) => Performance.renderPartArticulation(part, mpm),
      (part) => Performance.renderPartRubato(part, mpm),
      (part) => Performance.renderPartOrnamentation(part, mpm, ctx),
      (part) => this.renderPartTiming(part, mpm),
      (part) => this.renderPartMilliseconds(part, mpm, ctx),
    );
  }

  /**
   * The instruction maps in effect for one part: its own where it has them, the global one
   * of that type otherwise. A part with no MPM counterpart at all inherits the global set
   * wholesale, which is what the per-field fallback degenerates to.
   *
   * The lookups keep the reference's per-part order, which differs from
   * {@link resolveGlobalMaps}'s in putting the imprecision maps last. `Dated.getMap` is a map
   * read with no side effects, so that order is a readability matter only.
   */
  private static resolvePartMaps(mpmPart: Part | null, globalMaps: MpmMaps): MpmMaps {
    if (mpmPart === null) return globalMaps;
    const dated = mpmPart.requireDated();
    return {
      rubato: dated.getMapOfKind(RUBATO_MAP) ?? globalMaps.rubato,
      tempo: dated.getMapOfKind(TEMPO_MAP) ?? globalMaps.tempo,
      asynchrony: dated.getMapOfKind(ASYNCHRONY_MAP) ?? globalMaps.asynchrony,
      dynamics: dated.getMapOfKind(DYNAMICS_MAP) ?? globalMaps.dynamics,
      movement: dated.getMapOfKind(MOVEMENT_MAP) ?? globalMaps.movement,
      metricalAccentuation:
        dated.getMapOfKind(METRICAL_ACCENTUATION_MAP) ?? globalMaps.metricalAccentuation,
      ornamentation: dated.getMapOfKind(ORNAMENTATION_MAP) ?? globalMaps.ornamentation,
      articulation: dated.getMapOfKind(ARTICULATION_MAP) ?? globalMaps.articulation,
      imprecisionTiming: dated.getMapOfKind(IMPRECISION_MAP_TIMING) ?? globalMaps.imprecisionTiming,
      imprecisionDynamics:
        dated.getMapOfKind(IMPRECISION_MAP_DYNAMICS) ?? globalMaps.imprecisionDynamics,
      imprecisionToneduration:
        dated.getMapOfKind(IMPRECISION_MAP_TONEDURATION) ?? globalMaps.imprecisionToneduration,
      imprecisionTuning: dated.getMapOfKind(IMPRECISION_MAP_TUNING) ?? globalMaps.imprecisionTuning,
    };
  }

  /**
   * The part's MSM maps, registered for timing processing and primed with the `.perf` and
   * `modified` attributes. `score` comes first because {@link addMsmMapToList} appends in
   * call order and the render passes walk that list.
   */
  private static collectPartMaps(dated: Element): At<PartMaps, 'symbolic'> {
    const maps: GenericMap[] = [];
    const score = Performance.addMsmMapToList('score', dated, maps);
    Performance.addMsmMapToList('keySignatureMap', dated, maps);
    const timeSignatureMap = Performance.addMsmMapToList('timeSignatureMap', dated, maps);
    Performance.addMsmMapToList('sectionMap', dated, maps);
    Performance.addMsmMapToList('sequencingMap', dated, maps);
    Performance.addMsmMapToList('markerMap', dated, maps);
    Performance.addMsmMapToList('programChangeMap', dated, maps);
    const pedalMap = Performance.addMsmMapToList('pedalMap', dated, maps);
    // Entering the first phase, as in {@link collectGlobalMaps}: `date.perf` has just been
    // seeded from `date`, so nothing has displaced a performance date yet.
    return { maps, score, timeSignatureMap, pedalMap } as PartMaps as At<PartMaps, 'symbolic'>;
  }

  /**
   * The part's two *voices*: the sub-note control curves, which are the only passes that make a
   * new map rather than annotating one. Dynamics yields the `channelVolumeMap`, movement the
   * `positionMap`, and each is appended to the part's `<dated>` and primed like a collected map.
   * With no dynamicsMap anywhere, every note gets the default velocity instead.
   *
   * This is the stage that widens {@link PartMaps} into {@link PartRender}, and that widening
   * carries an ordering edge on its own: see {@link RenderInput}.
   *
   * Neither new map is added to `state.maps`, deliberately, so that neither the rubato loop of
   * {@link renderPartRubato} nor the tempo loop of {@link renderPartTiming} reaches them;
   * {@link renderPartMilliseconds} gives them their own treatment.
   *
   * Generic in the phase because it is indifferent to it: both passes read the maps' *symbolic
   * keys* — `GenericMap` keys its entries on `@date`, which no render pass ever writes — and
   * neither reads a performance date. What places it first is that Java places it first, not
   * anything rubato could disturb.
   */
  private renderPartVoices<P extends Phase>(
    state: At<PartMaps, P>,
    dated: Element,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): At<PartRender, P> {
    const { score } = state;

    let channelVolumeMap: GenericMap | null;
    if (mpm.dynamics !== null) {
      channelVolumeMap = mpm.dynamics.renderDynamicsToMap(score);
    } else {
      if (score !== null) {
        // `getAllElements()` returns the live entry index by reference; the body only adds an
        // attribute and does not touch the index it is walking.
        for (const entry of score.getAllElements()) {
          const e = entry.value;
          if (e.getLocalName() === 'note') e.addAttribute(new Attribute('velocity', '100.0'));
        }
      }
      channelVolumeMap = null;
    }
    if (channelVolumeMap !== null) {
      dated.appendChild(channelVolumeMap.getXml());
      Performance.addPerformanceTimingAttributes(channelVolumeMap);
      Performance.addModifiedAttributes(channelVolumeMap);
    }

    const positionMap = mpm.movement !== null ? mpm.movement.renderMovementToMap(ctx) : null;
    if (positionMap !== null) {
      dated.appendChild(positionMap.getXml());
      Performance.addPerformanceTimingAttributes(positionMap);
      Performance.addModifiedAttributes(positionMap);
    }

    return { ...state, channelVolumeMap, positionMap };
  }

  /**
   * Metrical accentuation: the beat position of every note, turned into a velocity offset. The
   * part's own `timeSignatureMap` if it brought one, the global one otherwise — which is the
   * one thing this stage needs from {@link GlobalRender}.
   *
   * Generic in the phase, because this stage and rubato commute:
   * `renderMetricalAccentuationToMap` measures the beat from `mapEntry.key`, and a
   * `GenericMap`'s key is `@date` — the symbolic date, which rubato does not touch (rubato
   * rewrites `date.perf` and `date.end.perf`). It reads and writes `velocity`; rubato reads and
   * writes neither. A negative control that ran this stage *after* rubato left the suite green
   * and every byte of all twenty traced render scenarios unchanged. The real edge is the one
   * above it — dynamics must have run — and {@link PartRender} enforces that one.
   */
  private renderPartAccentuation<P extends Phase>(
    state: At<PartRender, P>,
    mpm: MpmMaps,
    global: GlobalRender,
  ): At<PartRender, P> {
    if (mpm.metricalAccentuation !== null)
      mpm.metricalAccentuation.renderMetricalAccentuationToMap(
        state.score,
        state.timeSignatureMap !== null ? state.timeSignatureMap : global.timeSignatureMap,
        this.getPPQ(),
      );
    return state;
  }

  /**
   * Articulation, first half: everything that can be expressed in the symbolic domain. It
   * shifts `date.perf`, scales `duration.perf` and changes `velocity`, and parks the
   * millisecond-domain modifiers on the notes as `articulation.*Ms` attributes for
   * {@link renderPartMilliseconds} to consume once milliseconds exist. That split is the reason
   * `ArticulationMap` has two entry points.
   *
   * Unlike the two stages above it, this one is pinned to the `symbolic` phase, in both
   * directions. It must not sink below rubato: rubato's transformation of `date.perf` is
   * non-linear in the date, so articulating before and after it give different numbers. And its
   * millisecond half must not rise above the tempo pass — the same constraint one phase later.
   * Both are compile errors.
   */
  private static renderPartArticulation(
    state: At<PartRender, 'symbolic'>,
    mpm: MpmMaps,
  ): At<PartRender, 'symbolic'> {
    if (mpm.articulation !== null)
      mpm.articulation.renderArticulationToMap_noMillisecondModifiers(state.score);
    return state;
  }

  /**
   * Rubato, over every map collected for timing processing — the stage that displaces the
   * performed dates, and the reason the `symbolic` phase ends here.
   */
  private static renderPartRubato(
    state: At<PartRender, 'symbolic'>,
    mpm: MpmMaps,
  ): At<PartRender, 'displaced'> {
    for (const m of state.maps) if (mpm.rubato !== null) mpm.rubato.renderRubatoToMap(m);
    return state as PartRender as At<PartRender, 'displaced'>;
  }

  /**
   * Ornamentation, still in the symbolic domain: it writes the `ornament.*` modifier attributes
   * that {@link renderMillisecondsModifiersToMap} turns into real `milliseconds.*` values once
   * the tempo pass has run — the same two-half arrangement articulation has.
   *
   * Placed after rubato because Java places it there, and it is not indifferent to that: the
   * v3 ornament instantiation reads and writes `date.perf`, which rubato has just moved.
   */
  private static renderPartOrnamentation(
    state: At<PartRender, 'displaced'>,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): At<PartRender, 'displaced'> {
    if (mpm.ornamentation !== null) mpm.ornamentation.renderOrnamentationToMap(state.score, ctx);
    return state;
  }

  /**
   * The part's symbolic → millisecond crossing: where symbolic time finally becomes
   * `milliseconds.date` / `milliseconds.date.end`. Everything after this point works in
   * milliseconds, which is what the phase in the return type states.
   */
  private renderPartTiming(
    state: At<PartRender, 'displaced'>,
    mpm: MpmMaps,
  ): At<PartRender, 'milliseconds'> {
    for (const m of state.maps) Performance.renderTempoToMap(m, this.getPPQ(), mpm.tempo);
    return state as PartRender as At<PartRender, 'milliseconds'>;
  }

  /**
   * The part's millisecond-domain passes. Every one of them reads `milliseconds.date`, so
   * none may run before {@link renderPartTiming} — hence the phase in the parameter type.
   *
   * - *pedal, channelVolume and position maps* get their own tempo/asynchrony treatment. The
   *   last two deliberately skip rubato, which would put its high-frequency wobble into the
   *   dynamics and position curves.
   * - *score*: asynchrony, then articulation's millisecond modifiers, then ornamentation's
   *   ({@link renderMillisecondsModifiersToMap}) — the deferred halves, in that order — and
   *   finally the four imprecision maps.
   *
   * A part with no `<score>` still gets its pedal/volume/position maps rendered; only the
   * score block is skipped.
   */
  private renderPartMilliseconds(
    rendered: At<PartRender, 'milliseconds'>,
    mpm: MpmMaps,
    ctx: RenderContext,
  ): void {
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.pedalMap);
    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(rendered.pedalMap, true, ctx);

    Performance.renderTempoToMap(rendered.channelVolumeMap, this.getPPQ(), mpm.tempo);
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.channelVolumeMap);

    Performance.renderTempoToMap(rendered.positionMap, this.getPPQ(), mpm.tempo);
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(rendered.positionMap);

    const { score } = rendered;
    if (score === null) return;
    if (mpm.asynchrony !== null) mpm.asynchrony.renderAsynchronyToMap(score);
    if (mpm.articulation !== null)
      mpm.articulation.renderArticulationToMap_millisecondModifiers(score);
    Performance.renderMillisecondsModifiersToMap(score, mpm.ornamentation);

    if (mpm.imprecisionTiming !== null)
      mpm.imprecisionTiming.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionDynamics !== null)
      mpm.imprecisionDynamics.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionToneduration !== null)
      mpm.imprecisionToneduration.renderImprecisionToMap(score, true, ctx);
    if (mpm.imprecisionTuning !== null)
      mpm.imprecisionTuning.renderImprecisionToMap(score, true, ctx);
  }

  /**
   * The MSM parts a *global* map of `mapType` actually reaches: all of them, minus those
   * whose MPM part declares its own map of that type (a local map shadows the global one).
   * Read-only — it builds a new list and touches neither the MSM nor this performance.
   */
  private getAllMsmPartsAffectedByGlobalMap(msm: Msm, mapType: string): Element[] {
    // A copy of the part list, which the splices below whittle down.
    const msmPartsWithoutLocalMap: Element[] = msm.getParts().toArray();

    for (const part of this.getAllParts()) {
      if (part.requireDated().getMap(mapType) !== null) {
        const msmPart = msm.getPart(
          part.getNumber(),
          part.getName(),
          part.getMidiChannel(),
          part.getMidiPort(),
        );
        if (msmPart !== null) {
          const idx = msmPartsWithoutLocalMap.indexOf(msmPart);
          if (idx !== -1) msmPartsWithoutLocalMap.splice(idx, 1);
        }
      }
    }
    return msmPartsWithoutLocalMap;
  }

  /**
   * Mirrors `TempoMap.renderTempoToMap(map, ppq, tempoMap)` (TempoMap.java:450-478),
   * re-implemented here because this file only type-imports the map classes.
   *
   * With a tempoMap it just delegates. Without one the fallback is **1 MIDI tick = 1
   * millisecond**: `date.perf` is copied verbatim into `milliseconds.date`, so the numbers
   * are the symbolic ones and only the attribute name changes. `milliseconds.date.end`
   * comes from `date.end.perf` if present; otherwise, and only if both `duration.perf` and
   * `date.perf` exist, it is computed as their sum — and that sum is written back to
   * `date.end.perf` as well, so an element that arrived with only a duration leaves with an
   * end date. Elements with no `date.perf` are left untouched rather than defaulted.
   */
  private static renderTempoToMap(
    map: GenericMap | null,
    ppq: number,
    tempoMap: TempoMap | null,
  ): void {
    if (tempoMap !== null) {
      tempoMap.renderTempoToMap(map, ppq);
      return;
    }
    if (map === null) return;
    for (const entry of map.getAllElements()) {
      const e = entry.value;
      const dateAtt = attribute('date.perf', e);
      if (dateAtt !== null) e.addAttribute(new Attribute('milliseconds.date', dateAtt.getValue()));
      const endAtt = attribute('date.end.perf', e);
      if (endAtt !== null)
        e.addAttribute(new Attribute('milliseconds.date.end', endAtt.getValue()));
      else {
        const durAtt = attribute('duration.perf', e);
        if (durAtt !== null && dateAtt !== null) {
          const dateEnd = parseFloat(dateAtt.getValue()) + parseFloat(durAtt.getValue());
          e.addAttribute(new Attribute('date.end.perf', String(dateEnd)));
          e.addAttribute(new Attribute('milliseconds.date.end', String(dateEnd)));
        }
      }
    }
  }

  /**
   * OrnamentationMap milliseconds modifiers — mirrors
   * `OrnamentationMap.renderMillisecondsModifiersToMap` (OrnamentationMap.java:477-509),
   * inlined because this file only type-imports the map classes.
   *
   * ⚠ PARITY-CRITICAL. Do not restructure, rename or reorder anything inside this method; the
   * arithmetic below is required to be bit-identical to the reference, and a divergence here
   * has been found and fixed once already.
   *
   * It turns the three `ornament.*` modifier attributes that the ornamentation pass left on
   * a note into the real `milliseconds.*` performance attributes. Notes without
   * `milliseconds.date` are skipped — that attribute is the reference point every branch
   * below is measured from, so there is nothing to transform without it.
   *
   * 1. `ornament.milliseconds.date.offset` shifts `milliseconds.date` by the offset.
   *    `millisecondsDate` keeps the value read *before* that write, and every case below
   *    uses that pre-shift value plus the offset — never the re-read attribute.
   * 1b. `ornament.milliseconds.fromend.offset` — the one addition MPM v3 makes to this pass. It
   *    states the onset relative to the note's millisecond END, which is the only way to express
   *    a frame aligned `at end` in a domain that does not exist yet when the ornament is
   *    rendered. It resolves to an ordinary onset shift, so cases 2–4 are untouched by it. The
   *    branch is character-identical to `OrnamentationMap`'s copy, and a test pins that.
   * 2. `ornament.milliseconds.duration` sets an **absolute** end:
   *    `date + offset + duration`, written to `milliseconds.date.end` if it exists and
   *    *added* to the note if it does not. This is the add-attribute-if-absent case; the
   *    single `millisecondsDateEnd` local here is the same expression Java evaluates twice,
   *    in the same operand order, so the sum is bit-identical either way.
   * 3. Otherwise `ornament.noteoff.shift`, which the ornamentation pass only ever creates
   *    with the value `"true"`, so its mere presence is the signal: the end date shifts by
   *    the same offset as the start, leaving the sounding duration unchanged. The end is
   *    re-read from the attribute here rather than recomputed.
   * 4. Neither modifier present: `milliseconds.date.end` is left exactly as it was.
   */
  private static renderMillisecondsModifiersToMap(
    map: GenericMap | null,
    ornamentationMap: OrnamentationMap | null,
  ): void {
    if (ornamentationMap === null || map === null) return;
    for (const e of map.getAllElementsOfType('note')) {
      const note = e.value;
      const millisecondsDateAtt = attribute('milliseconds.date', note);
      if (millisecondsDateAtt === null) continue;
      const millisecondsDate = parseFloat(millisecondsDateAtt.getValue());
      const ornamentMillisecondsDateAtt = attribute('ornament.milliseconds.date.offset', note);
      let ornamentMillisecondsDateOffset = 0.0;
      if (ornamentMillisecondsDateAtt !== null) {
        ornamentMillisecondsDateOffset = parseFloat(ornamentMillisecondsDateAtt.getValue());
        millisecondsDateAtt.setValue(String(millisecondsDate + ornamentMillisecondsDateOffset));
      }

      // MPM v3: a millisecond frame aligned "at end" is anchored at
      // this note's millisecond END, which the symbolic phase cannot know, so it writes an
      // end-anchored marker instead of an onset offset. Resolving it into
      // ornamentMillisecondsDateOffset keeps the rest of this method v2. The end is read
      // BEFORE anything writes to it; a note without one cannot be placed from its end at all.
      const ornamentMillisecondsFromEndAtt = attribute(
        'ornament.milliseconds.fromend.offset',
        note,
      );
      if (ornamentMillisecondsFromEndAtt !== null) {
        const millisecondsDateEndBeforeAtt = attribute('milliseconds.date.end', note);
        if (millisecondsDateEndBeforeAtt !== null) {
          const millisecondsDateFromEnd =
            parseFloat(millisecondsDateEndBeforeAtt.getValue()) +
            parseFloat(ornamentMillisecondsFromEndAtt.getValue());
          ornamentMillisecondsDateOffset = millisecondsDateFromEnd - millisecondsDate;
          millisecondsDateAtt.setValue(String(millisecondsDateFromEnd));
        }
      }

      const millisecondsDateEndAtt = attribute('milliseconds.date.end', note);
      const ornamentMillisecondsDurationAtt = attribute('ornament.milliseconds.duration', note);
      if (ornamentMillisecondsDurationAtt !== null) {
        const millisecondsDateEnd = String(
          millisecondsDate +
            ornamentMillisecondsDateOffset +
            parseFloat(ornamentMillisecondsDurationAtt.getValue()),
        );
        if (millisecondsDateEndAtt !== null) millisecondsDateEndAtt.setValue(millisecondsDateEnd);
        else note.addAttribute(new Attribute('milliseconds.date.end', millisecondsDateEnd));
      } else {
        // The attribute exists only when it is "true": present shifts the end and preserves
        // the duration, absent leaves the end unaltered so the duration absorbs the shift.
        const ornamentNoteoffShiftAtt = attribute('ornament.noteoff.shift', note);
        if (ornamentNoteoffShiftAtt !== null) {
          if (millisecondsDateEndAtt !== null)
            millisecondsDateEndAtt.setValue(
              String(
                parseFloat(millisecondsDateEndAtt.getValue()) + ornamentMillisecondsDateOffset,
              ),
            );
        }
      }
    }
  }
}

import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { elementAt } from '../../../prelude/index.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import type { MetricalAccentuation } from './data/metricalAccentuation.js';
import {
  patchAttribute,
  readBoolean,
  readId,
  readNumber,
  readString,
} from './instructionAttributes.js';

/**
 * Everything an `<accentuationPattern>` element can say, for
 * {@link MetricalAccentuationMap.addAccentuationPattern} (RULE F5's named-parameter shape,
 * applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): an attribute nobody supplied is an
 * attribute that is not written.
 */
export interface AddAccentuationPatternOptions {
  /** `@date`, in ticks. Always written. */
  readonly date: number;
  /**
   * `@name.ref` — the `accentuationPatternDef` holding the per-beat values. Always written,
   * and required, because {@link MetricalAccentuationMap.getMetricalAccentuationDataOf}
   * rejects an `<accentuationPattern>` that lacks it.
   */
  readonly accentuationPatternDefName: string;
  /** `@scale`, the factor the def's accentuations are multiplied by. Always written. */
  readonly scale: number;
  /** `@loop`; absent means the pattern stops after one length of it. */
  readonly loop?: boolean;
  /** `@stickToMeasures`; absent is the reader's `true`, re-aligning the pattern at each barline. */
  readonly stickToMeasures?: boolean;
  /** `xml:id` of the accentuationPattern element. */
  readonly id?: string;
}

/**
 * An MPM `metricalAccentuationMap`: the emphasis pattern of the metre — the reason a
 * downbeat sounds stronger than an offbeat.
 *
 * Each `<accentuationPattern>` points at an `accentuationPatternDef` holding the actual
 * per-beat accentuation values, and this map only places that pattern on the timeline.
 * Rendering adds `accentuation * scale` to each note's existing `velocity`, so it must
 * run *after* the dynamics map has established one.
 *
 * Port of meico.mpm.elements.maps.MetricalAccentuationMap
 */
export class MetricalAccentuationMap extends GenericMap {
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<metricalAccentuationMap>`, or one read from an existing element. The
   * empty form is total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createMetricalAccentuationMap(): MetricalAccentuationMap;
  static createMetricalAccentuationMap(
    xml: Element,
  ): Result<MetricalAccentuationMap, MpmParseError>;
  static createMetricalAccentuationMap(
    xml?: Element,
  ): MetricalAccentuationMap | Result<MetricalAccentuationMap, MpmParseError> {
    return xml === undefined
      ? new MetricalAccentuationMap(GenericMap.emptyMapElement('metricalAccentuationMap'))
      : GenericMap.makeMap(
          xml,
          'MetricalAccentuationMap',
          (elt) => new MetricalAccentuationMap(elt),
        );
  }

  /**
   * Add an `<accentuationPattern>`.
   *
   * Attribute order is `date`, `name.ref`, `scale`, `loop`, `stickToMeasures`, `xml:id`, the
   * last three omitted where the caller supplied nothing. `loop="false"` and
   * `stickToMeasures="false"` are written where they are supplied as `false`, which is not the
   * same document as leaving them out even though it renders the same.
   *
   * The positional form is the older one and writes exactly what the options form writes; only
   * the options form can carry an `xml:id`.
   */
  addAccentuationPattern(options: AddAccentuationPatternOptions): number;
  addAccentuationPattern(
    date: number,
    accentuationPatternDefName: string,
    scale: number,
    loop?: boolean,
    stickToMeasures?: boolean,
  ): number;
  addAccentuationPattern(
    ...args:
      | [options: AddAccentuationPatternOptions]
      | [
          date: number,
          accentuationPatternDefName: string,
          scale: number,
          loop?: boolean,
          stickToMeasures?: boolean,
        ]
  ): number {
    const options: AddAccentuationPatternOptions =
      args.length === 1
        ? args[0]
        : {
            date: args[0],
            accentuationPatternDefName: args[1],
            scale: args[2],
            loop: args[3],
            stickToMeasures: args[4],
          };

    const e = new Element('accentuationPattern', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(options.date)));
    e.addAttribute(new Attribute('name.ref', options.accentuationPatternDefName));
    e.addAttribute(new Attribute('scale', String(options.scale)));
    if (options.loop !== undefined) e.addAttribute(new Attribute('loop', String(options.loop)));
    if (options.stickToMeasures !== undefined)
      e.addAttribute(new Attribute('stickToMeasures', String(options.stickToMeasures)));
    if (options.id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', options.id));
    return this.insertElement({ key: options.date, value: e }, false);
  }

  /**
   * Read the accentuation instruction at `index` into a {@link MetricalAccentuation}.
   * Returns null unless the entry is an `<accentuationPattern>` with both `name.ref` and
   * `scale`, and a metrical-accentuation style is in scope.
   *
   * Note what is NOT required: a def the style can actually resolve. An instruction naming
   * a def that does not exist comes back with `accentuationPatternDef` null and aborts the
   * render on first use, which is Java's behaviour and is measured as such — see the header
   * of {@link MetricalAccentuation}. The no-style case above it is the skip.
   */
  getMetricalAccentuationDataOf(index: number): MetricalAccentuation | null {
    const i = this.resolveEntryIndex(index, 'accentuationPattern');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.value;

    const nameRefAtt = attribute('name.ref', e);
    if (nameRefAtt === null) return null;
    const scaleAtt = attribute('scale', e);
    if (scaleAtt === null) return null;
    const style = this.getStyle('metricalAccentuation', this.findStyleNameAt(i));
    if (style === null) return null;

    const accentuationPatternDefName = nameRefAtt.getValue();
    const loopAtt = attribute('loop', e);
    const stmAtt = attribute('stickToMeasures', e);

    return {
      startDate: entry.key,
      endDate: this.nextDateOfType(i, 'accentuationPattern'),
      accentuationPatternDefName,
      accentuationPatternDef: style.getDef(accentuationPatternDefName) ?? null,
      scale: parseFloat(scaleAtt.getValue()),
      loop: loopAtt !== null && loopAtt.getValue() === 'true',
      stickToMeasures: stmAtt === null || stmAtt.getValue() === 'true',
    };
  }

  /**
   * The accentuation instruction at `index` as the options that would write it — the document
   * as it stands, with nothing defaulted. Null if the entry is not an `<accentuationPattern>`,
   * or carries neither `@name.ref` nor `@scale`.
   *
   * The complement of {@link getMetricalAccentuationDataOf}, not a variant of it: that one
   * answers what the renderer will do, this one what the document says. An absent
   * `@stickToMeasures` and `stickToMeasures="true"` render identically and are not the same
   * instruction to rewrite. It also asks for no style — an instruction naming a def nothing
   * defines is still an instruction, and is readable and patchable as one.
   */
  getAccentuationPatternOptionsOf(index: number): AddAccentuationPatternOptions | null {
    const i = this.resolveEntryIndex(index, 'accentuationPattern');
    if (i < 0) return null;

    const entry = this.entryAt(i);
    const e = entry.value;
    const accentuationPatternDefName = readString(e, 'name.ref');
    const scale = readNumber(e, 'scale');
    if (accentuationPatternDefName === undefined || scale === undefined) return null;

    return {
      date: readNumber(e, 'date') ?? entry.key,
      accentuationPatternDefName,
      scale,
      loop: readBoolean(e, 'loop'),
      stickToMeasures: readBoolean(e, 'stickToMeasures'),
      id: readId(e),
    };
  }

  /**
   * Patch the `<accentuationPattern>` at `index` in place: a field the patch omits is left
   * alone, one it carries as `undefined` has its attribute removed, anything else is written.
   *
   * Patching `@date` re-keys and re-sorts the map, which is the one thing writing the attribute
   * alone would not do — {@link GenericMap.elements} keys on the date read when the element was
   * added, and a stale key makes every later lookup answer from the wrong position.
   *
   * @returns false if the entry is not an `<accentuationPattern>`, in which case nothing was
   *   written.
   */
  updateAccentuationPatternAt(
    index: number,
    patch: Partial<AddAccentuationPatternOptions>,
  ): boolean {
    const i = this.resolveEntryIndex(index, 'accentuationPattern');
    if (i < 0) return false;

    const e = this.entryAt(i).value;
    patchAttribute(e, patch, 'date');
    patchAttribute(e, patch, 'accentuationPatternDefName', 'name.ref');
    patchAttribute(e, patch, 'scale');
    patchAttribute(e, patch, 'loop');
    patchAttribute(e, patch, 'stickToMeasures');
    patchAttribute(e, patch, 'id', 'xml:id');

    if ('date' in patch) this.sort();
    return true;
  }

  /**
   * Add each note's metrical accentuation to its `velocity`, in place.
   *
   * The work is in locating the note's beat. That needs the time signature in force, tracked
   * incrementally: `timeSignIndex` only ever moves forward, and whenever it does the derived
   * quantities are recomputed together — `ticksPerBeat`, the measure length, and the pattern
   * length, which depends on the denominator too. The initial values (4/4, one beat per
   * quarter) are what applies when there is no time signature map at all.
   *
   * `stickToMeasures` picks what the beat count is relative to: the current measure (the
   * default, so the pattern re-aligns at every barline) or the pattern's own length,
   * letting it float free of the metre. Beats are 1-based, hence the `1.0 +`.
   *
   * RENDERING MATH — `velocity + accentuation * md.scale` and the two beat formulas must
   * keep their exact form and order.
   */
  renderMetricalAccentuationToMap(
    map: GenericMap | null,
    timeSignatureMap: GenericMap | null,
    ppq: number,
  ): void {
    if (map === null || this.elements.length === 0) return;
    const ppq4 = 4.0 * ppq;
    let timeSignIndex = -1,
      tsDate = 0.0,
      tsNumerator = 4.0,
      tsDenominator = 4;
    let ticksPerBeat = ppq,
      tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
    let mapIndex = 0;
    for (let accIndex = 0; accIndex < this.size(); ++accIndex) {
      const md = this.getMetricalAccentuationDataOf(accIndex);
      if (md === null) continue;
      // PARITY — the abort is deliberate. Java reads a datum whose `accentuationPatternDef` is
      // null when the style is in scope but names no def by this name, and then dereferences
      // it unguarded: the render dies with a NullPointerException. Skipping the instruction
      // instead would render a document the reference refuses, and
      // `src/comparison/accentuationCurve.ts` measures the difference between the two.
      // The comparison layer quotes this error text verbatim, so do not "improve" it without reading
      // that module first.
      const def = md.accentuationPatternDef;
      if (def === null) throw new TypeError("Cannot read properties of null (reading 'getLength')");
      let patternLengthTicks = (def.getLength() * ppq4) / tsDenominator;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        if (mapEntry.key < md.startDate) continue;
        const velocityAtt = attribute('velocity', mapEntry.value);
        if (velocityAtt === null) continue;
        if (timeSignatureMap !== null) {
          const timeSignatures = timeSignatureMap.getAllElements();
          let update = false;
          for (let tsIndex = timeSignIndex + 1; tsIndex < timeSignatures.length; ++tsIndex) {
            if (elementAt(timeSignatures, tsIndex, 'time signature').key > mapEntry.key) break;
            timeSignIndex = tsIndex;
            update = true;
          }
          if (update) {
            const timeSign = elementAt(timeSignatures, timeSignIndex, 'time signature');
            tsDate = timeSign.key;
            tsNumerator = parseFloat(getAttributeValue('numerator', timeSign.value));
            tsDenominator = parseInt(getAttributeValue('denominator', timeSign.value));
            ticksPerBeat = ppq4 / tsDenominator;
            tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
            patternLengthTicks = (def.getLength() * ppq4) / tsDenominator;
          }
        }
        if (
          mapEntry.key >= md.endDate ||
          (!md.loop && mapEntry.key >= md.startDate + patternLengthTicks)
        )
          break;
        let beat: number;
        if (md.stickToMeasures)
          beat = 1.0 + ((mapEntry.key - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;
        else beat = 1.0 + ((mapEntry.key - tsDate) % patternLengthTicks) / ticksPerBeat;
        const velocity = parseFloat(velocityAtt.getValue());
        const accentuation = def.getAccentuationAt(beat);
        velocityAtt.setValue(String(velocity + accentuation * md.scale));
      }
    }
  }

  static renderMetricalAccentuationToMap(
    map: GenericMap,
    metricalAccentuationMap: MetricalAccentuationMap,
    timeSignatureMap: GenericMap,
    ppq: number,
  ): void {
    metricalAccentuationMap.renderMetricalAccentuationToMap(map, timeSignatureMap, ppq);
  }
}

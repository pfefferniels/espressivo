import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { elementAt } from '../../../prelude/index.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import type { MetricalAccentuation } from './data/metricalAccentuation.js';

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
   * A fresh, empty `<metricalAccentuationMap>`, or one read from an existing element.
   *
   * The two overloads return different things and that is the point. Building an empty
   * map consults nothing the caller supplied, so it cannot fail and says so; reading an
   * element can, and returns the reason instead of printing it. See
   * {@link GenericMap.emptyMapElement}.
   */
  static createMetricalAccentuationMap(): MetricalAccentuationMap;
  static createMetricalAccentuationMap(
    xml: Element,
  ): Result<MetricalAccentuationMap, MpmParseError>;
  static createMetricalAccentuationMap(
    xml?: Element | null,
  ): MetricalAccentuationMap | Result<MetricalAccentuationMap, MpmParseError> {
    return xml === undefined
      ? new MetricalAccentuationMap(GenericMap.emptyMapElement('metricalAccentuationMap'))
      : GenericMap.makeMap(
          xml,
          'MetricalAccentuationMap',
          (elt) => new MetricalAccentuationMap(elt),
        );
  }

  addAccentuationPattern(
    date: number,
    accentuationPatternDefName: string,
    scale: number,
    loop?: boolean,
    stickToMeasures?: boolean,
  ): number {
    const e = new Element('accentuationPattern', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('name.ref', accentuationPatternDefName));
    e.addAttribute(new Attribute('scale', String(scale)));
    if (loop !== undefined) e.addAttribute(new Attribute('loop', String(loop)));
    if (stickToMeasures !== undefined)
      e.addAttribute(new Attribute('stickToMeasures', String(stickToMeasures)));
    return this.insertElement(new KeyValue(date, e), false);
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
    const e = entry.getValue();

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
      startDate: entry.getKey(),
      endDate: this.nextDateOfType(i, 'accentuationPattern'),
      accentuationPatternDefName,
      accentuationPatternDef: style.getDef(accentuationPatternDefName) ?? null,
      scale: parseFloat(scaleAtt.getValue()),
      loop: loopAtt !== null && loopAtt.getValue() === 'true',
      stickToMeasures: stmAtt === null || stmAtt.getValue() === 'true',
    };
  }

  /**
   * Add each note's metrical accentuation to its `velocity`, in place.
   *
   * The work is in locating the note's beat. That needs the time signature in force,
   * which is tracked incrementally: `timeSignIndex` only ever moves forward as the map
   * is walked, and whenever it does, the derived quantities are all recomputed together
   * — `ticksPerBeat`, the measure length, and the pattern length, which depends on the
   * denominator too. The initial values (4/4, one beat per quarter) are what applies
   * when there is no time signature map at all.
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
      // PARITY — the ONE assertion in this file, and it is deliberate. Java reads a datum
      // whose `accentuationPatternDef` is null when the style is in scope but names no def
      // by this name, and then dereferences it unguarded: the render aborts with a
      // NullPointerException. Skipping the instruction instead would render a document the
      // reference refuses, and `src/comparison/accentuationCurve.ts` (R21) measures the
      // difference between the two. Binding the null to a non-null-typed local rather than
      // asserting at each of the three uses keeps the throw where it was — on the
      // `getLength()` below, and with `getLength` in the TypeError's message, which that
      // module quotes.
      const def = md.accentuationPatternDef!;
      let patternLengthTicks = (def.getLength() * ppq4) / tsDenominator;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        if (mapEntry.getKey() < md.startDate) continue;
        const velocityAtt = attribute('velocity', mapEntry.getValue());
        if (velocityAtt === null) continue;
        if (timeSignatureMap !== null) {
          const timeSignatures = timeSignatureMap.getAllElements();
          let update = false;
          for (let tsIndex = timeSignIndex + 1; tsIndex < timeSignatures.length; ++tsIndex) {
            if (elementAt(timeSignatures, tsIndex, 'time signature').getKey() > mapEntry.getKey())
              break;
            timeSignIndex = tsIndex;
            update = true;
          }
          if (update) {
            const timeSign = elementAt(timeSignatures, timeSignIndex, 'time signature');
            tsDate = timeSign.getKey();
            tsNumerator = parseFloat(getAttributeValue('numerator', timeSign.getValue()));
            tsDenominator = parseInt(getAttributeValue('denominator', timeSign.getValue()));
            ticksPerBeat = ppq4 / tsDenominator;
            tickLengthOfOneMeasure = ticksPerBeat * tsNumerator;
            patternLengthTicks = (def.getLength() * ppq4) / tsDenominator;
          }
        }
        if (
          mapEntry.getKey() >= md.endDate ||
          (!md.loop && mapEntry.getKey() >= md.startDate + patternLengthTicks)
        )
          break;
        let beat: number;
        if (md.stickToMeasures)
          beat = 1.0 + ((mapEntry.getKey() - tsDate) % tickLengthOfOneMeasure) / ticksPerBeat;
        else beat = 1.0 + ((mapEntry.getKey() - tsDate) % patternLengthTicks) / ticksPerBeat;
        const velocity = parseFloat(velocityAtt.getValue());
        const accentuation = def.getAccentuationAt(beat);
        velocityAtt.setValue(String(velocity + accentuation * md.scale));
      }
    }
  }

  static renderMetricalAccentuationToMap(
    map: GenericMap | null,
    metricalAccentuationMap: MetricalAccentuationMap | null,
    timeSignatureMap: GenericMap | null,
    ppq: number,
  ): void {
    if (metricalAccentuationMap !== null)
      metricalAccentuationMap.renderMetricalAccentuationToMap(map, timeSignatureMap, ppq);
  }
}

import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { elementAt } from '../../../prelude/index.js';
import { GenericMap } from './GenericMap.js';
import { TempoData } from './data/TempoData.js';
import {
  resolveTempo,
  type ConstantTempo,
  type Tempo,
  type TransitioningTempo,
} from './data/tempo.js';

/**
 * An MPM `tempoMap`: the tempo in force across the timeline, and the map that converts
 * symbolic ticks into milliseconds for everything downstream.
 *
 * This is the pivot of the whole rendering pipeline. Maps that run before it work in
 * ticks; maps that run after it (asynchrony, imprecision, the millisecond half of
 * articulation) work in milliseconds and depend on the `milliseconds.date` /
 * `milliseconds.date.end` attributes written here. Nothing may reorder that.
 *
 * A `<tempo>` is either constant or a transition from `bpm` to `transition.to`, bent by
 * `meanTempoAt` — the fraction of the span at which the mean tempo is reached, which
 * becomes the exponent of a power curve. Converting a transition to milliseconds has no
 * closed form (the duration is the integral of 1/tempo), so
 * {@link computeMillisecondsForTempoTransition} integrates numerically with Simpson's
 * rule.
 *
 * Port of meico.mpm.elements.maps.TempoMap
 */
export class TempoMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createTempoMap(xml?: Element): TempoMap | null {
    try {
      return xml !== undefined ? new TempoMap(xml) : new TempoMap('tempoMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addTempo(date: number, bpm: string, beatLength: number): number;
  addTempo(
    date: number,
    bpm: string,
    transitionTo: string,
    beatLength: number,
    meanTempoAt: number,
    id?: string,
  ): number;
  addTempo(data: TempoData): number;
  addTempo(
    dateOrData: number | TempoData,
    bpm?: string,
    transitionToOrBeatLength?: string | number,
    beatLength?: number,
    meanTempoAt?: number,
    id?: string,
  ): number {
    if (typeof dateOrData !== 'number') {
      const data = dateOrData;
      const e = new Element('tempo', MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', String(data.startDate)));
      if (data.bpmString !== null) e.addAttribute(new Attribute('bpm', data.bpmString));
      else if (data.bpm !== null) e.addAttribute(new Attribute('bpm', String(data.bpm)));
      else {
        console.error('Cannot add tempo, bpm not specified.');
        return -1;
      }
      if (data.transitionToString !== null)
        e.addAttribute(new Attribute('transition.to', data.transitionToString));
      else if (data.transitionTo !== null)
        e.addAttribute(new Attribute('transition.to', String(data.transitionTo)));
      if (data.meanTempoAt !== null)
        e.addAttribute(new Attribute('meanTempoAt', String(data.meanTempoAt)));
      e.addAttribute(new Attribute('beatLength', String(data.beatLength)));
      if (data.xmlId !== null)
        e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
      return this.insertElement(new KeyValue(data.startDate, e), false);
    }
    const date = dateOrData;
    const e = new Element('tempo', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    // `String(bpm)` and not `bpm!`: both numeric overloads declare `bpm` required, so it is
    // present on every reachable call, and the three sibling lines below already spell the
    // same fact as `String(beatLength)` / `String(meanTempoAt)` / `String(...)`.
    e.addAttribute(new Attribute('bpm', String(bpm)));
    if (typeof transitionToOrBeatLength === 'string') {
      e.addAttribute(new Attribute('transition.to', transitionToOrBeatLength));
      e.addAttribute(new Attribute('beatLength', String(beatLength)));
      e.addAttribute(new Attribute('meanTempoAt', String(meanTempoAt)));
      if (id !== undefined)
        e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    } else {
      e.addAttribute(new Attribute('beatLength', String(transitionToOrBeatLength)));
    }
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Read the tempo instruction at `index` into the {@link Tempo} arm it names, resolving
   * its style-relative names and normalising away the transitions that are not really
   * transitions. Returns null if the entry is not a usable `<tempo>`.
   *
   * The style in scope is found by scanning *backwards* from `index` for the nearest
   * preceding `<style>` — style switches are ordinary dated entries in the same map.
   *
   * All this method does is pull the four attributes out of the element and hand them to
   * {@link resolveTempo}, which owns the three normalisations and the choice of arm; the
   * commentary that used to sit here now sits there, next to the code it describes.
   */
  getTempoDataOf(index: number): Tempo | null {
    const i = this.resolveEntryIndex(index, 'tempo');
    if (i < 0) return null;

    const entry = this.entryAt(i);
    const e = entry.getValue();
    const bpmAtt = attribute('bpm', e);
    if (bpmAtt === null) return null;
    const beatLengthAtt = attribute('beatLength', e);
    if (beatLengthAtt === null) return null;

    const transitionToAtt = attribute('transition.to', e);
    const meanTempoAtAtt = attribute('meanTempoAt', e);

    return resolveTempo(
      {
        startDate: entry.getKey(),
        endDate: this.nextDateOfType(i, 'tempo'),
        beatLength: parseFloat(beatLengthAtt.getValue()),
      },
      bpmAtt.getValue(),
      transitionToAtt === null ? null : transitionToAtt.getValue(),
      meanTempoAtAtt === null ? null : meanTempoAtAtt.getValue(),
      this.getStyle('tempo', this.findStyleNameAt(i)),
    );
  }

  getTempoAt(date: number): number {
    const td = this.getTempoDataAt(date);
    return TempoMap.getTempoAtStatic(date, td);
  }

  /**
   * The tempo governing `date`: the nearest preceding entry that yields usable tempo
   * data, skipping style switches and malformed entries.
   *
   * PARITY NOTE — the loop runs down to `-1`, not to `0` (TempoMap.java:181). The extra
   * round calls {@link getTempoDataOf} with -1, which returns null immediately, so it is
   * one wasted call rather than a bug. Kept as-is for parity.
   */
  private getTempoDataAt(date: number): Tempo | null {
    for (let i = this.getElementIndexBefore(date); i >= -1; --i) {
      const td = this.getTempoDataOf(i);
      if (td !== null) return td;
    }
    return null;
  }

  /**
   * The instantaneous tempo in bpm at `date`, given the tempo instruction covering it.
   * With no tempo data at all the answer is 100.0 bpm, MPM's default.
   *
   * RENDERING MATH — do not reorder. The position within the span is raised to
   * `exponent` and the result interpolates between `bpm` and `transitionTo`; the
   * `result * (to - bpm) + bpm` form is not interchangeable with the algebraically equal
   * `bpm * (1 - result) + to * result` in floating point.
   *
   * The lazy `exponent` fill-in that used to sit between those two lines — "if the
   * exponent is still null, derive it from `meanTempoAt`, or take 1.0" — is gone, and with
   * it the mutation of the argument it performed. It was dead: {@link resolveTempo} puts an
   * exponent on every {@link TransitioningTempo} it builds, and a `TransitioningTempo` is
   * the only thing that reaches this line. Its stated purpose, not recomputing a logarithm
   * at each of Simpson's sample points, is served better by computing it once at read time.
   */
  private static getTempoAtStatic(date: number, tempo: Tempo | null): number {
    if (tempo === null) return 100.0;
    if (tempo.kind === 'constant') return tempo.bpm;
    if (date === tempo.endDate) return tempo.transitionTo;
    let result = (date - tempo.startDate) / (tempo.endDate - tempo.startDate);
    result = Math.pow(result, tempo.exponent);
    return result * (tempo.transitionTo - tempo.bpm) + tempo.bpm;
  }

  /**
   * Write `milliseconds.date` and `milliseconds.date.end` onto every entry of `map`.
   * This is the tick ⇒ millisecond conversion the rest of the pipeline builds on.
   *
   * With no tempo instructions at all, everything is timed at MPM's default 100 bpm via
   * {@link computeMillisecondsForNoTempo} and the method returns early.
   *
   * Otherwise both the tempo map and the target map are walked **once**, together:
   * `mapIndex` is declared outside the tempo loop and never rewound, so each map entry
   * is timed by exactly one tempo instruction. Milliseconds accumulate — a tempo
   * instruction's own start is the previous instruction's start plus the elapsed
   * duration of that previous span (`computeDiffTiming` returns a *difference*, hence
   * the name), so the running sum in `startDateMilliseconds` is what keeps successive
   * tempi continuous. Do not restructure this into two independent passes.
   *
   * That running sum used to be written into a `startDateMilliseconds` field on the datum
   * and pushed onto a `tempi` array whose only ever-read element was its last. It is a
   * `previous` local now: the same two values, held for the same one iteration, but no
   * longer a nullable field on a type that has nothing else to do with rendering. Java's
   * own `clone()` refused to copy it for exactly this reason.
   *
   * `pendingDurations` exists because a note can start under one tempo and end under a
   * later one. Such notes are parked and retried against each subsequent instruction;
   * entries are removed as they resolve, which is why that loop decrements `i` after
   * splicing. The `continue` for an end date beyond the current span leaves the entry
   * pending for the next round.
   */
  renderTempoToMap(map: GenericMap | null, ppq: number): void {
    if (map === null) return;

    let mapIndex = 0;

    if (this.elements.length === 0) {
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        const date = parseFloat(getAttributeValue('date.perf', mapEntry.getValue()));
        const ms = TempoMap.computeMillisecondsForNoTempo(date, ppq);
        mapEntry.getValue().addAttribute(new Attribute('milliseconds.date', String(ms)));
        const durAtt = attribute('duration.perf', mapEntry.getValue());
        if (durAtt === null) continue;
        const endDate = date + parseFloat(durAtt.getValue());
        mapEntry
          .getValue()
          .addAttribute(
            new Attribute(
              'milliseconds.date.end',
              String(TempoMap.computeMillisecondsForNoTempo(endDate, ppq)),
            ),
          );
      }
      return;
    }

    // process the map elements on the basis of this non-empty tempoMap
    let previous: { readonly tempo: Tempo; readonly startDateMilliseconds: number } | null = null;
    const pendingDurations: KeyValue<number, number>[] = [];

    for (let tempoIndex = 0; tempoIndex < this.size(); ++tempoIndex) {
      const td = this.getTempoDataOf(tempoIndex);
      if (td === null) continue;

      // compute the milliseconds date of the tempo instruction. The `: number` is load
      // bearing for the compiler, not for the reader: `previous` is reassigned from this
      // very value one line down, so inferring the type here would be circular.
      const startDateMilliseconds: number =
        previous === null
          ? TempoMap.computeDiffTiming(td.startDate, ppq, null)
          : TempoMap.computeDiffTiming(td.startDate, ppq, previous.tempo) +
            previous.startDateMilliseconds;
      previous = { tempo: td, startDateMilliseconds };

      // compute the milliseconds dates of all map elements that fall under this tempo instruction
      let milliseconds: number;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        if (mapEntry.getKey() > td.endDate) break;

        const date = parseFloat(getAttributeValue('date.perf', mapEntry.getValue()));
        if (mapEntry.getKey() <= td.startDate)
          milliseconds = TempoMap.computeDiffTiming(date, ppq, null);
        else milliseconds = TempoMap.computeDiffTiming(date, ppq, td) + startDateMilliseconds;
        mapEntry.getValue().addAttribute(new Attribute('milliseconds.date', String(milliseconds)));

        const dateEndAtt = attribute('date.end.perf', mapEntry.getValue());
        if (dateEndAtt !== null) {
          const endDate = parseFloat(dateEndAtt.getValue());
          pendingDurations.push(new KeyValue(endDate, mapIndex));
          continue;
        }
        const durAtt = attribute('duration.perf', mapEntry.getValue());
        if (durAtt !== null) {
          const endDate = date + parseFloat(durAtt.getValue());
          mapEntry.getValue().addAttribute(new Attribute('date.end.perf', String(endDate)));
          pendingDurations.push(new KeyValue(endDate, mapIndex));
        }
      }

      // Check pending durations to fall under this tempo instruction, resolving the ones
      // that do and leaving the rest pending.
      //
      // A remove-if, written as a compaction: every entry is examined, the unresolved ones
      // are packed back down to the front in their old order and the length is cut to what
      // survived. The loop this replaces spliced each resolved entry out and stepped `i`
      // back — the same removals, but each shifting the whole remainder, which is quadratic
      // in the number of notes still waiting on a later tempo. Note that this one is NOT a
      // prefix drain like `RubatoMap`'s: `continue` leaves an entry pending and goes on to
      // the ones behind it, because a note ending past this span may sit in front of one
      // ending inside it.
      let kept = 0;
      for (const pd of pendingDurations) {
        const endDate = pd.getKey();
        if (endDate > td.endDate) {
          pendingDurations[kept++] = pd;
          continue;
        }
        if (endDate <= td.startDate) milliseconds = TempoMap.computeDiffTiming(endDate, ppq, null);
        else milliseconds = TempoMap.computeDiffTiming(endDate, ppq, td) + startDateMilliseconds;
        elementAt(map.elements, pd.getValue(), 'target entry')
          .getValue()
          .addAttribute(new Attribute('milliseconds.date.end', String(milliseconds)));
      }
      pendingDurations.length = kept;

      if (mapIndex >= map.size() && pendingDurations.length === 0) break;
    }
  }

  static renderTempoToMap(map: GenericMap | null, ppq: number, tempoMap: TempoMap | null): void {
    if (tempoMap !== null) {
      tempoMap.renderTempoToMap(map, ppq);
      return;
    }
    if (map === null) return;
    // Walking the index directly rather than `map.getElement(i)!` over `0 ..< map.size()`:
    // same entries in the same order, and no assertion contradicting an accessor about a
    // range the loop itself established.
    for (const entry of map.getAllElements()) {
      const e = entry.getValue();
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
   * The elapsed milliseconds from the start of `tempo`'s span to `date` — a *difference*,
   * not an absolute position on the timeline.
   *
   * The three-way split is the whole reason {@link Tempo} is a sum: a constant tempo is one
   * division, a transition is Simpson's rule over the span, and no tempo at all is MPM's
   * default 100 quarter-bpm. Dispatching on the arm rather than on an `isConstantTempo()`
   * predicate also closes the hole that predicate left open — it answered *true* for a
   * datum whose `bpm` was null, which sent a null into the divisor below.
   */
  static computeDiffTiming(date: number, ppq: number, tempo: Tempo | null): number {
    if (tempo === null) return TempoMap.computeMillisecondsForNoTempo(date, ppq);
    return tempo.kind === 'constant'
      ? TempoMap.computeMillisecondsForConstantTempo(date, ppq, tempo)
      : TempoMap.computeMillisecondsForTempoTransition(date, ppq, tempo);
  }

  private static computeMillisecondsForNoTempo(date: number, ppq: number): number {
    return (600.0 * date) / ppq;
  }
  private static computeMillisecondsForConstantTempo(
    date: number,
    ppq: number,
    tempo: ConstantTempo,
  ): number {
    return (15000.0 * (date - tempo.startDate)) / (tempo.bpm * tempo.beatLength * ppq);
  }
  /**
   * The elapsed milliseconds from the start of a *transitioning* tempo instruction to
   * `date`, by numerical integration of 1/tempo — there is no closed form.
   *
   * This is Simpson's rule: `N` sub-intervals chosen from the span (one per sixteenth
   * note, floored to an even count, minimum 2), the two endpoints weighted 1, the
   * interior even-indexed points weighted 2, the odd-indexed points weighted 4, and the
   * whole sum scaled by `resultConst`.
   *
   * RENDERING MATH — the most order-sensitive code in the cluster, and every millisecond
   * date in the output flows through it. `resultSum` is accumulated in a fixed sequence
   * of `+=` steps; floating-point addition is not associative, so merging the two loops,
   * reversing either, hoisting `2 * k * x`, or replacing the running sum with a
   * `reduce` will silently change the low bits of every timestamp downstream. The `N`
   * computation likewise: `2.0 * Math.floor(... / (ppq / 4))` must keep its exact
   * grouping. Leave all of it alone.
   */
  private static computeMillisecondsForTempoTransition(
    date: number,
    ppq: number,
    tempo: TransitioningTempo,
  ): number {
    let N = 2.0 * Math.floor((date - tempo.startDate) / (ppq / 4));
    if (N === 0.0) N = 2.0;
    const n = N / 2.0;
    const x = (date - tempo.startDate) / N;
    const resultConst = ((date - tempo.startDate) * 5000.0) / (N * tempo.beatLength * ppq);
    let resultSum = 1.0 / tempo.bpm + 1.0 / TempoMap.getTempoAtStatic(date, tempo);
    for (let k = 1; k < n; ++k)
      resultSum += 2.0 / TempoMap.getTempoAtStatic(tempo.startDate + 2 * k * x, tempo);
    for (let k = 1; k <= n; ++k)
      resultSum += 4.0 / TempoMap.getTempoAtStatic(tempo.startDate + (2 * k - 1) * x, tempo);
    return resultConst * resultSum;
  }
}

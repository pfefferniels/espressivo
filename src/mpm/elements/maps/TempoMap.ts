import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { TempoData } from './data/TempoData.js';
import { TempoStyle } from '../styles/TempoStyle.js';

export class TempoMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createTempoMap(): TempoMap | null;
  static createTempoMap(xml: Element): TempoMap | null;
  static createTempoMap(xml?: Element): TempoMap | null {
    try {
      return xml !== undefined ? new TempoMap(xml) : new TempoMap('tempoMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
  }

  addTempo(date: number, bpm: string, beatLength: number): number;
  addTempo(
    date: number,
    bpm: string,
    transitionTo: string,
    beatLength: number,
    meanTempoAt: number,
  ): number;
  addTempo(
    date: number,
    bpm: string,
    transitionTo: string,
    beatLength: number,
    meanTempoAt: number,
    id: string,
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
      const e = new Element('tempo', Mpm.MPM_NAMESPACE);
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
    const e = new Element('tempo', Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('bpm', bpm!));
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

  getTempoDataOf(index: number): TempoData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const e = this.elements[index].getValue();
    if (e.getLocalName() === 'tempo') {
      const td = new TempoData();
      const bpmAtt = Helper.getAttribute('bpm', e);
      if (bpmAtt === null) return null;
      const beatLengthAtt = Helper.getAttribute('beatLength', e);
      if (beatLengthAtt === null) return null;
      td.startDate = this.elements[index].getKey();
      td.endDate = this.getEndDate(index);
      td.xml = e;
      td.beatLength = parseFloat(beatLengthAtt.getValue());
      const att = Helper.getAttribute('id', e);
      if (att !== null) td.xmlId = att.getValue();
      for (let j = index; j >= 0; --j) {
        const s = this.elements[j].getValue();
        if (s.getLocalName() === 'style') {
          td.styleName = Helper.getAttributeValue('name.ref', s);
          break;
        }
      }
      const gStyle = this.getStyle(Mpm.TEMPO_STYLE, td.styleName) as TempoStyle | null;
      if (gStyle !== null) td.style = gStyle;
      td.bpmString = bpmAtt.getValue();
      td.bpm = TempoStyle.getNumericBpmValueStatic(td.bpmString, td.style);
      const ttAtt = Helper.getAttribute('transition.to', e);
      if (ttAtt !== null) {
        td.transitionToString = ttAtt.getValue();
        td.transitionTo = TempoStyle.getNumericBpmValueStatic(td.transitionToString, td.style);
        if (td.transitionTo === td.bpm) {
          td.transitionToString = null;
          td.transitionTo = null;
        } else {
          const mtaAtt = Helper.getAttribute('meanTempoAt', e);
          if (mtaAtt !== null) {
            td.meanTempoAt = parseFloat(mtaAtt.getValue());
            if (td.meanTempoAt <= 0.0) {
              td.bpmString = td.transitionToString;
              td.bpm = td.transitionTo;
              td.transitionToString = null;
              td.transitionTo = null;
            } else if (td.meanTempoAt >= 1.0) {
              td.transitionToString = null;
              td.transitionTo = null;
            } else {
              td.exponent = TempoMap.computeExponent(td.meanTempoAt);
            }
          } else {
            td.meanTempoAt = 0.5;
            td.exponent = 1.0;
          }
        }
      }
      return td;
    }
    return null;
  }

  private getEndDate(index: number): number {
    let endDate = Number.MAX_VALUE;
    for (let j = index + 1; j < this.elements.length; ++j) {
      if (this.elements[j].getValue().getLocalName() === 'tempo') {
        endDate = this.elements[j].getKey();
        break;
      }
    }
    return endDate;
  }

  private static computeExponent(meanTempoAt: number): number {
    return Math.log(0.5) / Math.log(meanTempoAt);
  }

  getTempoAt(date: number): number {
    const td = this.getTempoDataAt(date);
    return TempoMap.getTempoAtStatic(date, td);
  }

  private getTempoDataAt(date: number): TempoData | null {
    for (let i = this.getElementIndexBefore(date); i >= -1; --i) {
      const td = this.getTempoDataOf(i);
      if (td !== null) return td;
    }
    return null;
  }

  private static getTempoAtStatic(date: number, tempoData: TempoData | null): number {
    if (tempoData === null) return 100.0;
    if (tempoData.isConstantTempo()) return tempoData.bpm!;
    if (date === tempoData.endDate) return tempoData.transitionTo!;
    let result = (date - tempoData.startDate) / (tempoData.endDate! - tempoData.startDate);
    if (tempoData.exponent === null)
      tempoData.exponent =
        tempoData.meanTempoAt === null ? 1.0 : TempoMap.computeExponent(tempoData.meanTempoAt);
    result = Math.pow(result, tempoData.exponent);
    return result * (tempoData.transitionTo! - tempoData.bpm!) + tempoData.bpm!;
  }

  renderTempoToMap(map: GenericMap | null, ppq: number): void {
    if (map === null) return;

    let mapIndex = 0;

    if (this.elements.length === 0) {
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        const date = parseFloat(Helper.getAttributeValue('date.perf', mapEntry.getValue()));
        const ms = TempoMap.computeMillisecondsForNoTempo(date, ppq);
        mapEntry.getValue().addAttribute(new Attribute('milliseconds.date', String(ms)));
        const durAtt = Helper.getAttribute('duration.perf', mapEntry.getValue());
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
    const tempi: TempoData[] = [];
    const pendingDurations: KeyValue<number, number>[] = [];

    for (let tempoIndex = 0; tempoIndex < this.size(); ++tempoIndex) {
      const td = this.getTempoDataOf(tempoIndex);
      if (td === null) continue;

      // compute the milliseconds date of the tempo instruction
      if (tempi.length === 0) {
        td.startDateMilliseconds = TempoMap.computeDiffTiming(td.startDate, ppq, null);
      } else {
        const prevTd = tempi[tempi.length - 1];
        td.startDateMilliseconds = TempoMap.computeDiffTiming(td.startDate, ppq, prevTd);
        td.startDateMilliseconds += tempi[tempi.length - 1].startDateMilliseconds!;
      }
      tempi.push(td);

      // compute the milliseconds dates of all map elements that fall under this tempo instruction
      let milliseconds: number;
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];
        if (mapEntry.getKey() > td.endDate!) break;

        const date = parseFloat(Helper.getAttributeValue('date.perf', mapEntry.getValue()));
        if (mapEntry.getKey() <= td.startDate)
          milliseconds = TempoMap.computeDiffTiming(date, ppq, null);
        else milliseconds = TempoMap.computeDiffTiming(date, ppq, td) + td.startDateMilliseconds!;
        mapEntry.getValue().addAttribute(new Attribute('milliseconds.date', String(milliseconds)));

        const dateEndAtt = Helper.getAttribute('date.end.perf', mapEntry.getValue());
        if (dateEndAtt !== null) {
          const endDate = parseFloat(dateEndAtt.getValue());
          pendingDurations.push(new KeyValue(endDate, mapIndex));
          continue;
        }
        const durAtt = Helper.getAttribute('duration.perf', mapEntry.getValue());
        if (durAtt !== null) {
          const endDate = date + parseFloat(durAtt.getValue());
          mapEntry.getValue().addAttribute(new Attribute('date.end.perf', String(endDate)));
          pendingDurations.push(new KeyValue(endDate, mapIndex));
        }
      }

      // check pending durations to fall under this tempo instruction
      for (let i = 0; i < pendingDurations.length; ++i) {
        const pd = pendingDurations[i];
        const endDate = pd.getKey();
        if (endDate > td.endDate!) continue;
        if (endDate <= td.startDate) milliseconds = TempoMap.computeDiffTiming(endDate, ppq, null);
        else
          milliseconds = TempoMap.computeDiffTiming(endDate, ppq, td) + td.startDateMilliseconds!;
        map.elements[pd.getValue()]
          .getValue()
          .addAttribute(new Attribute('milliseconds.date.end', String(milliseconds)));
        pendingDurations.splice(i, 1);
        --i;
      }

      if (mapIndex >= map.size() && pendingDurations.length === 0) break;
    }
  }

  static renderTempoToMap(map: GenericMap | null, ppq: number, tempoMap: TempoMap | null): void {
    if (tempoMap !== null) {
      tempoMap.renderTempoToMap(map, ppq);
      return;
    }
    if (map === null) return;
    for (let i = 0; i < map.size(); ++i) {
      const e = map.getElement(i)!;
      const dateAtt = Helper.getAttribute('date.perf', e);
      if (dateAtt !== null) e.addAttribute(new Attribute('milliseconds.date', dateAtt.getValue()));
      const endAtt = Helper.getAttribute('date.end.perf', e);
      if (endAtt !== null)
        e.addAttribute(new Attribute('milliseconds.date.end', endAtt.getValue()));
      else {
        const durAtt = Helper.getAttribute('duration.perf', e);
        if (durAtt !== null && dateAtt !== null) {
          const dateEnd = parseFloat(dateAtt.getValue()) + parseFloat(durAtt.getValue());
          e.addAttribute(new Attribute('date.end.perf', String(dateEnd)));
          e.addAttribute(new Attribute('milliseconds.date.end', String(dateEnd)));
        }
      }
    }
  }

  static computeDiffTiming(date: number, ppq: number, tempoData: TempoData | null): number {
    if (tempoData === null) return TempoMap.computeMillisecondsForNoTempo(date, ppq);
    if (tempoData.isConstantTempo())
      return TempoMap.computeMillisecondsForConstantTempo(date, ppq, tempoData);
    return TempoMap.computeMillisecondsForTempoTransition(date, ppq, tempoData);
  }

  private static computeMillisecondsForNoTempo(date: number, ppq: number): number {
    return (600.0 * date) / ppq;
  }
  private static computeMillisecondsForConstantTempo(
    date: number,
    ppq: number,
    tempoData: TempoData,
  ): number {
    return (15000.0 * (date - tempoData.startDate)) / (tempoData.bpm! * tempoData.beatLength * ppq);
  }
  private static computeMillisecondsForTempoTransition(
    date: number,
    ppq: number,
    tempoData: TempoData,
  ): number {
    let N = 2.0 * Math.floor((date - tempoData.startDate) / (ppq / 4));
    if (N === 0.0) N = 2.0;
    const n = N / 2.0;
    const x = (date - tempoData.startDate) / N;
    const resultConst = ((date - tempoData.startDate) * 5000.0) / (N * tempoData.beatLength * ppq);
    let resultSum = 1.0 / tempoData.bpm! + 1.0 / TempoMap.getTempoAtStatic(date, tempoData);
    for (let k = 1; k < n; ++k)
      resultSum += 2.0 / TempoMap.getTempoAtStatic(tempoData.startDate + 2 * k * x, tempoData);
    for (let k = 1; k <= n; ++k)
      resultSum +=
        4.0 / TempoMap.getTempoAtStatic(tempoData.startDate + (2 * k - 1) * x, tempoData);
    return resultConst * resultSum;
  }
}

GenericMap.registerMapFactory('tempoMap', (xml) => TempoMap.createTempoMap(xml));

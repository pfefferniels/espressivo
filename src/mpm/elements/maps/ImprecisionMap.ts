import { Attribute, Element } from '../../../xml/XomTypes.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { RandomNumberProvider } from '../../../supplementary/RandomNumberProvider.js';
import { GenericMap } from './GenericMap.js';
import { DistributionData } from './data/DistributionData.js';

export class ImprecisionMap extends GenericMap {
  private static readonly TIMING = 1;
  private static readonly DYNAMICS = 2;
  private static readonly TONEDURATION = 3;
  private static readonly TUNING = 4;

  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createImprecisionMap(domain: string): ImprecisionMap | null;
  static createImprecisionMap(xml: Element): ImprecisionMap | null;
  static createImprecisionMap(domainOrXml: string | Element): ImprecisionMap | null {
    try {
      if (typeof domainOrXml === 'string') {
        const name = `imprecisionMap${domainOrXml === '' ? '' : `.${domainOrXml}`}`;
        return new ImprecisionMap(name);
      }
      return new ImprecisionMap(domainOrXml);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  protected parseData(xml: Element): void {
    super.parseData(xml);
    const localname = this.getXml()!.getLocalName();
    if (!localname.includes('imprecisionMap'))
      throw new Error(
        `Cannot generate ImprecisionMap object. Local name "${xml.getLocalName()}" must contain "imprecisionMap".`,
      );
  }

  setDomain(domain: string | null): void {
    if (domain === null || domain === '') {
      /* would set local name */ return;
    }
    // Note: setLocalName not available in our XOM port
  }

  getDomain(): string {
    const parts = this.getXml()!.getLocalName().split('.');
    return parts.length < 2 ? '' : parts[1];
  }

  setDetuneUnit(unit: string): void {
    if (unit === 'Hertz') unit = 'Hz';
    this.getXml()!.addAttribute(new Attribute('detuneUnit', unit));
  }

  getDetuneUnit(): string {
    return this.getXml()!.getAttributeValue('detuneUnit') ?? '';
  }

  addDistributionUniform(
    date: number,
    lowerLimit: number,
    upperLimit: number,
    seed?: number | null,
  ): number {
    const e = new Element(DistributionData.UNIFORM, Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionGaussian(
    date: number,
    standardDeviation: number,
    lowerLimit: number,
    upperLimit: number,
    seed?: number | null,
  ): number {
    const e = new Element(DistributionData.GAUSSIAN, Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('deviation.standard', String(standardDeviation)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionTriangular(
    date: number,
    lowerLimit: number,
    upperLimit: number,
    mode: number,
    lowerClip: number,
    upperClip: number,
    seed?: number | null,
  ): number {
    const e = new Element(DistributionData.TRIANGULAR, Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('mode', String(mode)));
    e.addAttribute(new Attribute('clip.lower', String(lowerClip)));
    e.addAttribute(new Attribute('clip.upper', String(upperClip)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionBrownianNoise(
    date: number,
    maxStepWidth: number,
    lowerLimit: number,
    upperLimit: number,
    millisecondsTimingBasis: number,
    seed?: number | null,
  ): number {
    const e = new Element(DistributionData.BROWNIAN, Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('stepWidth.max', String(maxStepWidth)));
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionCompensatingTriangle(
    date: number,
    degreeOfCorrelation: number,
    lowerLimit: number,
    upperLimit: number,
    lowerClip: number,
    upperClip: number,
    millisecondsTimingBasis: number,
    seed?: number | null,
  ): number {
    const e = new Element(DistributionData.COMPENSATING_TRIANGLE, Mpm.MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(
      new Attribute('degreeOfCorrelation', String(Math.max(degreeOfCorrelation, 0.0))),
    );
    e.addAttribute(new Attribute('limit.lower', String(lowerLimit)));
    e.addAttribute(new Attribute('limit.upper', String(upperLimit)));
    e.addAttribute(new Attribute('clip.lower', String(lowerClip)));
    e.addAttribute(new Attribute('clip.upper', String(upperClip)));
    e.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    if (seed !== undefined && seed !== null) e.addAttribute(new Attribute('seed', String(seed)));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDistributionList(date: number, list: Element, millisecondsTimingBasis: number): number {
    list.addAttribute(new Attribute('date', String(date)));
    list.addAttribute(new Attribute('milliseconds.timingBasis', String(millisecondsTimingBasis)));
    return this.insertElement(new KeyValue(date, list), false);
  }

  getDistributionDataOf(index: number): DistributionData | null {
    if (this.elements.length === 0 || index < 0) return null;
    if (index >= this.elements.length) index = this.elements.length - 1;
    const e = this.getElement(index);
    if (e !== null && e.getLocalName().startsWith('distribution.')) {
      const dd = new DistributionData(e);
      dd.endDate = index < this.size() - 1 ? this.elements[index + 1].getKey() : Number.MAX_VALUE;
      return dd;
    }
    return null;
  }

  renderImprecisionToMap(map: GenericMap | null, shakePolyphonicPart: boolean): void {
    if (map === null || this.elements.length === 0) return;

    let domain: number;
    switch (this.getDomain()) {
      case 'timing':
        domain = ImprecisionMap.TIMING;
        break;
      case 'dynamics':
        domain = ImprecisionMap.DYNAMICS;
        break;
      case 'toneduration':
        domain = ImprecisionMap.TONEDURATION;
        break;
      case 'tuning':
        domain = ImprecisionMap.TUNING;
        break;
      default:
        return;
    }

    const pendingDurations: { endDate: number; msDateEnd: number; attribute: Attribute }[] = [];
    const offsets = new Map<number, KeyValue<number, Attribute>[]>();
    let mapIndex = 0;
    let dd: DistributionData | null = null;
    let random: RandomNumberProvider | null = null;

    for (let impIndex = 0; impIndex < this.size(); ++impIndex) {
      const ddPrev: DistributionData | null = dd;

      dd = this.getDistributionDataOf(impIndex);
      if (dd === null) {
        dd = ddPrev;
        continue;
      }

      // initialize the seed, generate correlated distribution functions
      switch (dd.type) {
        case DistributionData.UNIFORM:
          random = RandomNumberProvider.createRandomNumberProvider_uniformDistribution(
            dd.lowerLimit!,
            dd.upperLimit!,
          );
          break;
        case DistributionData.GAUSSIAN:
          random = RandomNumberProvider.createRandomNumberProvider_gaussianDistribution(
            dd.standardDeviation!,
            dd.lowerLimit!,
            dd.upperLimit!,
          );
          break;
        case DistributionData.TRIANGULAR:
          random = RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
            dd.lowerLimit!,
            dd.upperLimit!,
            dd.mode!,
            dd.lowerClip!,
            dd.upperClip!,
          );
          break;
        case DistributionData.BROWNIAN: {
          const imprecisionValueHandover = ImprecisionMap.getHandoverValue(random, ddPrev, dd);
          random = RandomNumberProvider.createRandomNumberProvider_brownianNoiseDistribution(
            dd.maxStepWidth!,
            dd.lowerLimit!,
            dd.upperLimit!,
          );
          ImprecisionMap.doHandover(imprecisionValueHandover, random);
          break;
        }
        case DistributionData.COMPENSATING_TRIANGLE: {
          const imprecisionValueHandover = ImprecisionMap.getHandoverValue(random, ddPrev, dd);
          random = RandomNumberProvider.createRandomNumberProvider_compensatingTriangleDistribution(
            dd.degreeOfCorrelation!,
            dd.lowerLimit!,
            dd.upperLimit!,
            dd.lowerClip!,
            dd.upperClip!,
          );
          ImprecisionMap.doHandover(imprecisionValueHandover, random);
          break;
        }
        case DistributionData.LIST:
          random = RandomNumberProvider.createRandomNumberProvider_distributionList(
            dd.distributionList,
          );
          break;
        default:
          continue;
      }

      if (dd.seed !== null) random.setSeed(dd.seed);

      // make sure that the timing resolution is specified, and if not, compute a reasonable value
      if (dd.millisecondsTimingBasis === null) {
        if (domain === ImprecisionMap.TIMING) {
          switch (dd.type) {
            case DistributionData.UNIFORM:
            case DistributionData.GAUSSIAN:
            case DistributionData.BROWNIAN:
              dd.millisecondsTimingBasis = dd.upperLimit! - dd.lowerLimit!;
              break;
            case DistributionData.TRIANGULAR:
            case DistributionData.COMPENSATING_TRIANGLE:
              dd.millisecondsTimingBasis = dd.upperClip! - dd.lowerClip!;
              break;
            case DistributionData.LIST: {
              const minMax = dd.getMinAndMaxValueInDistributionList();
              if (minMax !== null) dd.millisecondsTimingBasis = minMax.getValue() - minMax.getKey();
              break;
            }
            default:
              break;
          }
        }
        if (dd.millisecondsTimingBasis === null || dd.millisecondsTimingBasis <= 0.0)
          dd.millisecondsTimingBasis = 100.0;
      }

      // apply distribution to map elements
      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = map.elements[mapIndex];

        if (mapEntry.getKey() < dd.startDate) continue;

        if (mapEntry.getKey() >= dd.endDate!) break;

        const msDateAtt = Helper.getAttribute('milliseconds.date', mapEntry.getValue());
        if (msDateAtt === null) continue;

        let msDate: number;
        let index: number;
        let offset: KeyValue<number, Attribute>;

        switch (domain) {
          case ImprecisionMap.TIMING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / dd.millisecondsTimingBasis;
            offset = new KeyValue(random.getValue(index), msDateAtt);

            const msEndAtt = Helper.getAttribute('milliseconds.date.end', mapEntry.getValue());
            if (msEndAtt !== null) {
              const msDateEnd = parseFloat(msEndAtt.getValue());
              pendingDurations.push({
                endDate: parseFloat(
                  Helper.getAttributeValue('milliseconds.date.end', mapEntry.getValue()),
                ),
                msDateEnd: msDateEnd,
                attribute: msEndAtt,
              });
            }
            break;
          }
          case ImprecisionMap.TONEDURATION: {
            const msEndAtt = Helper.getAttribute('milliseconds.date.end', mapEntry.getValue());
            if (msEndAtt !== null) {
              msDate = parseFloat(msEndAtt.getValue());
              index = msDate / dd.millisecondsTimingBasis;
              offset = new KeyValue(random.getValue(index), msEndAtt);
            } else {
              continue;
            }
            break;
          }
          case ImprecisionMap.DYNAMICS: {
            const velAtt = Helper.getAttribute('velocity', mapEntry.getValue());
            if (velAtt === null) continue;
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / dd.millisecondsTimingBasis;
            offset = new KeyValue(random.getValue(index), velAtt);
            break;
          }
          case ImprecisionMap.TUNING: {
            msDate = parseFloat(msDateAtt.getValue());
            index = msDate / dd.millisecondsTimingBasis;
            let tuneAtt = Helper.getAttribute('tuning.offset', mapEntry.getValue());
            if (tuneAtt === null) {
              tuneAtt = new Attribute('tuning.offset', '0.0');
              mapEntry.getValue().addAttribute(tuneAtt);
            }
            offset = new KeyValue(random.getValue(index), tuneAtt);
            break;
          }
          default:
            continue;
        }

        ImprecisionMap.addToOffsetsMap(offsets, msDate!, offset!);
      }

      // offset the milliseconds.date.end attributes
      for (let i = 0; i < pendingDurations.length; ++i) {
        const pd = pendingDurations[i];

        if (pd.endDate >= dd.endDate!) break;

        const msDate = pd.msDateEnd;
        const endIndex = msDate / dd.millisecondsTimingBasis;
        const offset = new KeyValue(random.getValue(endIndex), pd.attribute);
        ImprecisionMap.addToOffsetsMap(offsets, msDate, offset);

        pendingDurations.splice(i, 1);
        --i;
      }
    }

    if (shakePolyphonicPart) {
      if (domain === ImprecisionMap.TIMING) ImprecisionMap.shakeTimingOffsets(offsets);
      else ImprecisionMap.shakeOffsets(offsets);
    }

    ImprecisionMap.addOffsetsToAttributes(offsets, domain);
  }

  private static addToOffsetsMap(
    offsetsMap: Map<number, KeyValue<number, Attribute>[]>,
    millisecondsDate: number,
    offsetAndAttribute: KeyValue<number, Attribute>,
  ): void {
    let list = offsetsMap.get(millisecondsDate);
    if (list === undefined) {
      list = [];
      list.push(offsetAndAttribute);
      offsetsMap.set(millisecondsDate, list);
    } else {
      list.push(offsetAndAttribute);
    }
  }

  private static getHandoverValue(
    randomPrev: RandomNumberProvider | null,
    ddPrev: DistributionData | null,
    ddNext: DistributionData,
  ): number | null {
    if (ddPrev === null || randomPrev === null) return null;

    const ddMsDateEndAtt = Helper.getAttribute('milliseconds.date', ddNext.xml);
    if (ddMsDateEndAtt === null) return null;

    const ddMsDateEnd = parseFloat(ddMsDateEndAtt.getValue());
    const endIndex = ddMsDateEnd / ddPrev.millisecondsTimingBasis!;
    return randomPrev.getValue(endIndex);
  }

  private static doHandover(value: number | null, random: RandomNumberProvider): void {
    if (value !== null) {
      random.setInitialValue(value);
    } else {
      const scaleFactor = (random.getUpperLimit() - random.getLowerLimit()) * 0.5;
      const firstValue = Math.random() * scaleFactor + random.getLowerLimit() + scaleFactor * 0.5;
      random.setInitialValue(firstValue);
    }
  }

  private static shakeOffsets(offsets: Map<number, KeyValue<number, Attribute>[]>): void {
    for (const [, entries] of offsets) {
      if (entries.length < 2) continue;

      const keepOffset = Math.floor(Math.random() * entries.length);

      for (let i = 0; i < entries.length; ++i) {
        if (i === keepOffset) continue;

        entries[i].setKey(ImprecisionMap.shake(entries[i].getKey()));
      }
    }
  }

  private static shakeTimingOffsets(offsets: Map<number, KeyValue<number, Attribute>[]>): void {
    for (const [, entries] of offsets) {
      if (entries.length < 2) continue;

      const keepOffset = Math.floor(Math.random() * entries.length);
      const pitchOffsetTuplet = new Map<number, number>();

      // as this applies also to the element that keeps its offset, it should be added to the hashmap first
      const keeper = entries[keepOffset];
      const keeperParent = keeper.getValue().getParent();
      if (keeperParent !== null) {
        const pitchAtt = Helper.getAttribute('midi.pitch', keeperParent);
        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, keeper.getKey());
        }
      }

      for (let i = 0; i < entries.length; ++i) {
        if (i === keepOffset) continue;

        const entry = entries[i];

        // check whether we have already an offset value for this pitch
        const entryParent = entry.getValue().getParent();
        let pitchAtt: Attribute | null = null;
        if (entryParent !== null) {
          pitchAtt = Helper.getAttribute('midi.pitch', entryParent);
          if (pitchAtt !== null) {
            const pitch = parseFloat(pitchAtt.getValue());
            const existingOffset = pitchOffsetTuplet.get(pitch);
            if (existingOffset !== undefined) {
              entry.setKey(existingOffset);
              continue;
            }
          }
        }

        entry.setKey(ImprecisionMap.shake(entry.getKey()));

        if (pitchAtt !== null) {
          const pitch = parseFloat(pitchAtt.getValue());
          pitchOffsetTuplet.set(pitch, entry.getKey());
        }
      }
    }
  }

  private static shake(offset: number): number {
    const of_ = offset * 0.5;
    if (offset < 0.0)
      return RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
        offset,
        of_,
        of_,
        offset,
        of_,
      ).getValue(0);
    return RandomNumberProvider.createRandomNumberProvider_triangularDistribution(
      of_,
      offset,
      offset,
      of_,
      offset,
    ).getValue(0);
  }

  private static addOffsetsToAttributes(
    offsets: Map<number, KeyValue<number, Attribute>[]>,
    domain: number,
  ): void {
    for (const [, entries] of offsets) {
      for (const entry of entries) {
        const attValue = parseFloat(entry.getValue().getValue());
        if (domain === ImprecisionMap.TIMING)
          entry.getValue().setValue(String(Math.max(0.0, attValue + entry.getKey())));
        else entry.getValue().setValue(String(attValue + entry.getKey()));
      }
    }
  }

  static renderImprecisionToMap(
    map: GenericMap | null,
    imprecisionMap: ImprecisionMap | null,
    shakePolyphonicPart: boolean,
  ): void {
    if (imprecisionMap !== null) imprecisionMap.renderImprecisionToMap(map, shakePolyphonicPart);
  }
}

GenericMap.registerMapFactory('imprecisionMap', (xml) => ImprecisionMap.createImprecisionMap(xml));
GenericMap.registerMapFactory('imprecisionMap.timing', (xml) =>
  ImprecisionMap.createImprecisionMap(xml),
);
GenericMap.registerMapFactory('imprecisionMap.dynamics', (xml) =>
  ImprecisionMap.createImprecisionMap(xml),
);
GenericMap.registerMapFactory('imprecisionMap.toneduration', (xml) =>
  ImprecisionMap.createImprecisionMap(xml),
);
GenericMap.registerMapFactory('imprecisionMap.tuning', (xml) =>
  ImprecisionMap.createImprecisionMap(xml),
);

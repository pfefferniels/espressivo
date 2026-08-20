import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { DynamicsData } from './data/DynamicsData.js';
import {
  resolveDynamics,
  dynamicsAt,
  subNoteDynamicsSegment,
  type Dynamics,
} from './data/dynamics.js';
import { numericDynamicsValue } from '../styles/style.js';
import { elementAt, mapPresent, unwrapOr } from '../../../prelude/index.js';

/**
 * An MPM `dynamicsMap`: loudness over the timeline, as constant levels and as
 * crescendo/diminuendo transitions.
 *
 * Rendering has two modes and they use different MIDI mechanisms. Ordinarily each note
 * simply gets the `velocity` its date calls for. But a `<dynamics>` marked
 * `subNoteDynamics` needs loudness to change *while a note sounds*, which velocity
 * cannot express — so those spans instead pin every note to velocity 100 and emit the
 * shape as a channel-volume curve. That is why
 * {@link DynamicsMap.renderDynamicsToMap} returns a second map: the `channelVolumeMap`
 * the MIDI export turns into CC 7 events.
 *
 * Port of meico.mpm.elements.maps.DynamicsMap
 */
export class DynamicsMap extends GenericMap {
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<dynamicsMap>`, or one read from an existing element.
   *
   * The two overloads return different things and that is the point. Building an empty
   * map consults nothing the caller supplied, so it cannot fail and says so; reading an
   * element can, and returns the reason instead of printing it. See
   * {@link GenericMap.emptyMapElement}.
   */
  static createDynamicsMap(): DynamicsMap;
  static createDynamicsMap(xml: Element): Result<DynamicsMap, MpmParseError>;
  static createDynamicsMap(xml?: Element | null): DynamicsMap | Result<DynamicsMap, MpmParseError> {
    return xml === undefined
      ? new DynamicsMap(GenericMap.emptyMapElement('dynamicsMap'))
      : GenericMap.makeMap(xml, 'DynamicsMap', (elt) => new DynamicsMap(elt));
  }

  addDynamics(
    date: number,
    volume: string,
    transitionTo?: string,
    curvature?: number,
    protraction?: number,
    subNoteDynamics?: boolean,
    id?: string,
  ): number {
    const e = new Element('dynamics', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('volume', volume));
    if (transitionTo !== undefined) e.addAttribute(new Attribute('transition.to', transitionTo));
    if (curvature !== undefined)
      e.addAttribute(new Attribute('curvature', String(DynamicsMap.clampCurvature(curvature))));
    if (protraction !== undefined)
      e.addAttribute(
        new Attribute('protraction', String(DynamicsMap.clampProtraction(protraction))),
      );
    if (subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  addDynamicsFromData(data: DynamicsData): number {
    const e = new Element('dynamics', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.startDate)));
    if (data.volumeString !== null) e.addAttribute(new Attribute('volume', data.volumeString));
    else if (data.volume !== null) e.addAttribute(new Attribute('volume', String(data.volume)));
    else {
      console.error('Cannot add dynamics, volume not specified.');
      return -1;
    }
    if (data.transitionToString !== null)
      e.addAttribute(new Attribute('transition.to', data.transitionToString));
    else if (data.transitionTo !== null)
      e.addAttribute(new Attribute('transition.to', String(data.transitionTo)));
    // The clamped values are written back into `data`, so a caller that reuses the object
    // sees the correction rather than keeping a value the document does not carry.
    if (data.curvature !== null) {
      data.curvature = DynamicsMap.clampCurvature(data.curvature);
      e.addAttribute(new Attribute('curvature', String(data.curvature)));
    }
    if (data.protraction !== null) {
      data.protraction = DynamicsMap.clampProtraction(data.protraction);
      e.addAttribute(new Attribute('protraction', String(data.protraction)));
    }
    if (data.subNoteDynamics) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (data.xmlId !== null)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
    return this.insertElement(new KeyValue(data.startDate, e), false);
  }

  /**
   * Curvature is a fraction of the segment's own extent, so only `[0, 1]` denotes
   * anything; a value outside it is corrected and reported rather than let through into
   * the Bézier's control points. Both boundary guards are applied wherever a curve
   * parameter enters or leaves the map — {@link DynamicsMap.getDynamicsDataOf} on the way
   * in, {@link DynamicsMap.addDynamics} and {@link DynamicsMap.addDynamicsFromData} on
   * the way out — so an out-of-range value can neither be written to a document nor be
   * read back out of one.
   */
  private static clampCurvature(curvature: number): number {
    if (curvature < 0.0) {
      console.error(`Invalid curvature value: ${String(curvature)} < 0.0. Setting it to 0.0.`);
      return 0.0;
    }
    if (curvature > 1.0) {
      console.error(`Invalid curvature value: ${String(curvature)} > 1.0. Setting it to 1.0.`);
      return 1.0;
    }
    return curvature;
  }

  /** Protraction skews the curve towards one end; `[-1, 1]`. See {@link clampCurvature}. */
  private static clampProtraction(protraction: number): number {
    if (protraction < -1.0) {
      console.error(
        `Invalid protraction value: ${String(protraction)} < -1.0. Setting it to -1.0.`,
      );
      return -1.0;
    }
    if (protraction > 1.0) {
      console.error(`Invalid protraction value: ${String(protraction)} > 1.0. Setting it to 1.0.`);
      return 1.0;
    }
    return protraction;
  }

  getDynamicsDataAt(date: number): Dynamics | null {
    for (let i = this.getElementIndexBeforeAt(date); i >= 0; --i) {
      const dd = this.getDynamicsDataOf(i);
      if (dd !== null) return dd;
    }
    return null;
  }

  /**
   * Read the dynamics instruction at `index` into a {@link Dynamics}, resolving
   * style-relative names such as `"forte"` through the style in scope (found by scanning
   * backwards for the nearest preceding `<style>`). Returns null if the entry is not a
   * usable `<dynamics>`.
   *
   * The two curve parameters are read only in the transition branch: a constant
   * instruction has no curve for them to shape. Each is clamped to its valid range on the
   * way in (see {@link DynamicsMap.clampCurvature}).
   *
   * What the declared shape leaves out, {@link resolveDynamics} fills in — an absent
   * `transition.to` becomes a target equal to `volume`, and absent curve parameters become
   * 0.0. That is the incumbent's behaviour with the substitutions gathered into one place:
   * the constant branch used to spell all four out here, while an absent `@curvature` on a
   * *transition* was left null and defaulted to 0.0 much later, in place, by the method
   * that computed the control points.
   */
  getDynamicsDataOf(index: number): Dynamics | null {
    const i = this.resolveEntryIndex(index, 'dynamics');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.getValue();

    const volAtt = attribute('volume', e);
    if (volAtt === null) return null;
    const volumeString = volAtt.getValue();
    const style = this.getStyle('dynamics', this.findStyleNameAt(i));

    const ttAtt = attribute('transition.to', e);
    const transitionToString = ttAtt === null ? null : ttAtt.getValue();
    const sndAtt = attribute('subNoteDynamics', e);

    return resolveDynamics({
      startDate: entry.getKey(),
      endDate: this.nextDateOfType(i, 'dynamics'),
      volumeString,
      volume: numericDynamicsValue(volumeString, style),
      transitionToString,
      transitionTo:
        transitionToString === null ? null : numericDynamicsValue(transitionToString, style),
      // Read only in the transition branch, exactly as before: a constant instruction's
      // curve parameters are 0.0 whatever the element says.
      curvature:
        transitionToString === null
          ? null
          : mapPresent(attribute('curvature', e), (a) =>
              DynamicsMap.clampCurvature(parseFloat(a.getValue())),
            ),
      protraction:
        transitionToString === null
          ? null
          : mapPresent(attribute('protraction', e), (a) =>
              DynamicsMap.clampProtraction(parseFloat(a.getValue())),
            ),
      subNoteDynamics: sndAtt !== null && sndAtt.getValue() === 'true',
    });
  }

  /**
   * Write a `velocity` onto every note of `map` and return the `channelVolumeMap`
   * needed for the sub-note spans (see the class doc), or null if there is nothing to
   * do.
   *
   * As in {@link TempoMap.renderTempoToMap}, `mapIndex` lives outside the instruction
   * loop and is never rewound, so the two maps are walked once in lockstep.
   *
   * The channel volume is pinned back to 100.0 at the start of every non-sub-note span,
   * but only when it is not already there — otherwise a run of ordinary instructions
   * would emit a redundant CC 7 event apiece. Those entries carry `mandatory="true"`,
   * which stops the MIDI export from optimising them away; without it, the reset after
   * a sub-note curve could be dropped and the curve's final volume would leak into the
   * following notes.
   *
   * Note the asymmetry in the two inner loops: notes *before* the current instruction
   * get a flat 100.0 (nothing has defined their dynamics yet), while a sub-note span
   * skips them instead — its notes are handled by the volume curve, not by velocity.
   */
  renderDynamicsToMap(map: GenericMap | null): GenericMap | null {
    if (map === null || this.elements.length === 0) return null;
    // `'channelVolumeMap'` contains "Map", so this cannot fail; `unwrapOr` keeps the `null`
    // the guards below already test for rather than asserting the fact with a `!`.
    const chanVolMap = unwrapOr(GenericMap.createGenericMap('channelVolumeMap'), null);
    let mapIndex = 0;
    for (let dynamicsIndex = 0; dynamicsIndex < this.size(); ++dynamicsIndex) {
      const dd = this.getDynamicsDataOf(dynamicsIndex);
      if (dd === null) continue;

      if (chanVolMap !== null) {
        if (dd.subNoteDynamics && dynamicsIndex < this.size() - 1) {
          // sub-note dynamics: generate volume curve events
          DynamicsMap.generateSubNoteDynamics(dd, chanVolMap);
          for (; mapIndex < map.size(); ++mapIndex) {
            const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
            if (mapEntry.getKey() < dd.startDate || mapEntry.getValue().getLocalName() !== 'note')
              continue;
            if (mapEntry.getKey() >= dd.endDate) break;
            mapEntry.getValue().addAttribute(new Attribute('velocity', '100.0'));
          }
          continue;
        }
        // non-sub-note dynamics: add a volume=100 entry to channelVolumeMap
        if (
          chanVolMap.isEmpty() ||
          getAttributeValue('value', chanVolMap.getLastElement()) !== '100.0'
        ) {
          const volE = new Element('volume', chanVolMap.getXml().getNamespaceURI());
          volE.addAttribute(new Attribute('date', String(dd.startDate)));
          volE.addAttribute(new Attribute('value', '100.0'));
          volE.addAttribute(new Attribute('mandatory', 'true'));
          chanVolMap.addElement(volE);
        }
      }

      for (; mapIndex < map.size(); ++mapIndex) {
        const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
        if (mapEntry.getValue().getLocalName() !== 'note') continue;
        if (mapEntry.getKey() < dd.startDate) {
          mapEntry.getValue().addAttribute(new Attribute('velocity', '100.0'));
          continue;
        }
        if (mapEntry.getKey() >= dd.endDate) break;
        mapEntry
          .getValue()
          .addAttribute(new Attribute('velocity', String(dynamicsAt(dd, mapEntry.getKey()))));
      }
    }
    return chanVolMap;
  }

  private static generateSubNoteDynamics(
    dynamicsData: Dynamics,
    channelVolumeMap: GenericMap,
  ): void {
    const segment = subNoteDynamicsSegment(dynamicsData, 2.0);
    // Only the first event is ever read back, so it is remembered rather than the whole array
    // being kept to index `[0]` out of once — which is also what removes the second
    // allocation this method used to make per sub-note transition.
    let first: Element | null = null;
    for (const event of segment) {
      const e = new Element('volume', channelVolumeMap.getXml().getNamespaceURI());
      e.addAttribute(new Attribute('date', String(event[0])));
      e.addAttribute(new Attribute('value', String(event[1])));
      channelVolumeMap.addElement(e);
      first ??= e;
    }
    first?.addAttribute(new Attribute('mandatory', 'true'));
  }

  static renderDynamicsToMap(
    map: GenericMap | null,
    dynamicsMap: DynamicsMap | null,
  ): GenericMap | null {
    if (dynamicsMap !== null) return dynamicsMap.renderDynamicsToMap(map);
    if (map === null) return null;
    // Walking the index directly rather than `map.getElement(i)!` over `0 ..< map.size()`:
    // same entries in the same order, and the map's own accessor stops having to be
    // contradicted about the range its caller just established.
    for (const entry of map.getAllElements()) {
      const e = entry.getValue();
      if (e.getLocalName() === 'note') e.addAttribute(new Attribute('velocity', '100.0'));
    }
    return null;
  }
}

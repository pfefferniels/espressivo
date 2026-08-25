import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, getAttributeValue } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import {
  resolveDynamics,
  dynamicsAt,
  subNoteDynamicsSegment,
  type Dynamics,
} from './data/dynamics.js';
import { numericDynamicsValue } from '../styles/style.js';
import { elementAt, mapPresent, unwrapOr } from '../../../prelude/index.js';
import {
  patchAttribute,
  readBoolean,
  readId,
  readNumber,
  readNumberOrString,
} from '../../../xml/attributes.js';

/**
 * Everything a `<dynamics>` element can say, for {@link DynamicsMap.addDynamics} (RULE F5's
 * named-parameter shape, applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): an attribute nobody supplied is an
 * attribute that is not written.
 */
export interface AddDynamicsOptions {
  /** `@date`, in ticks. Always written. */
  readonly date: number;
  /**
   * `@volume`. A number, a style-relative name, or one of the MEI exporter's placeholders — a
   * string is written verbatim, so the wording a document used round-trips.
   */
  readonly volume: number | string;
  /** `@transition.to`, spelled as {@link volume} is; absent means a constant instruction. */
  readonly transitionTo?: number | string;
  /** `@curvature`, clamped into `[0, 1]` on the way out. */
  readonly curvature?: number;
  /** `@protraction`, clamped into `[-1, 1]` on the way out. */
  readonly protraction?: number;
  /** `@subNoteDynamics`; written only when true, which is the only value the schema uses. */
  readonly subNoteDynamics?: boolean;
  /** `xml:id` of the dynamics element. */
  readonly id?: string;
}

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
   * A fresh, empty `<dynamicsMap>`, or one read from an existing element. The empty form is
   * total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createDynamicsMap(): DynamicsMap;
  static createDynamicsMap(xml: Element): Result<DynamicsMap, MpmParseError>;
  static createDynamicsMap(xml?: Element): DynamicsMap | Result<DynamicsMap, MpmParseError> {
    return xml === undefined
      ? new DynamicsMap(GenericMap.emptyMapElement('dynamicsMap'))
      : GenericMap.makeMap(xml, 'DynamicsMap', (elt) => new DynamicsMap(elt));
  }

  /**
   * Add a `<dynamics>`.
   *
   * Attribute order is `date`, `volume`, `transition.to`, `curvature`, `protraction`,
   * `subNoteDynamics`, `xml:id`, each omitted where the caller supplied nothing.
   *
   * The clamps correct the element, not the caller's object. The `addDynamicsFromData` arm this
   * replaces wrote the clamped values back into the payload it was handed, which is Java's
   * behaviour and an argument mutation RULE I1 does not sanction; nothing in `src/` read the
   * payload again afterwards.
   */
  addDynamics(dynamics: AddDynamicsOptions): number {
    const e = new Element('dynamics', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(dynamics.date)));
    e.addAttribute(new Attribute('volume', String(dynamics.volume)));
    if (dynamics.transitionTo !== undefined)
      e.addAttribute(new Attribute('transition.to', String(dynamics.transitionTo)));
    if (dynamics.curvature !== undefined)
      e.addAttribute(
        new Attribute('curvature', String(DynamicsMap.clampCurvature(dynamics.curvature))),
      );
    if (dynamics.protraction !== undefined)
      e.addAttribute(
        new Attribute('protraction', String(DynamicsMap.clampProtraction(dynamics.protraction))),
      );
    if (dynamics.subNoteDynamics === true) e.addAttribute(new Attribute('subNoteDynamics', 'true'));
    if (dynamics.id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', dynamics.id));
    return this.insertElement({ key: dynamics.date, value: e }, false);
  }

  /**
   * Curvature is a fraction of the segment's own extent, so only `[0, 1]` denotes anything; a
   * value outside it is corrected and reported rather than let through into the Bézier's
   * control points. Both guards run wherever a curve parameter enters or leaves the map —
   * {@link DynamicsMap.getDynamicsDataOf} on the way in, {@link DynamicsMap.addDynamics} and
   * {@link DynamicsMap.addDynamicsFromData} on the way out — so an out-of-range value can
   * neither be written to a document nor read back out of one.
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
   * 0.0.
   */
  getDynamicsDataOf(index: number): Dynamics | null {
    const i = this.resolveEntryIndex(index, 'dynamics');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.value;

    const volAtt = attribute('volume', e);
    if (volAtt === null) return null;
    const volumeString = volAtt.getValue();
    const style = this.getStyle('dynamics', this.findStyleNameAt(i));

    const ttAtt = attribute('transition.to', e);
    const transitionToString = ttAtt === null ? null : ttAtt.getValue();
    const sndAtt = attribute('subNoteDynamics', e);

    return resolveDynamics({
      startDate: entry.key,
      endDate: this.nextDateOfType(i, 'dynamics'),
      volumeString,
      volume: numericDynamicsValue(volumeString, style),
      transitionToString,
      transitionTo:
        transitionToString === null ? null : numericDynamicsValue(transitionToString, style),
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
   * The dynamics instruction at `index` as the options that would write it — the document as it
   * stands, with nothing resolved and nothing defaulted. Null if the entry is not a
   * `<dynamics>`, or carries no `@volume`, which is the one {@link addDynamics} requires.
   *
   * The complement of {@link getDynamicsDataOf}, not a variant of it: that one answers what the
   * renderer will do, this one what the document says. An absent `@curvature` and
   * `curvature="0"` render identically and are not the same instruction to rewrite.
   *
   * The curve parameters are reported as written, out-of-range values included, where
   * {@link getDynamicsDataOf} clamps them — a document saying `curvature="5"` is a document
   * that has to be told so. {@link addDynamics} and {@link updateDynamicsAt} still refuse to
   * write one, so the clamp holds on every path out.
   */
  getDynamicsOptionsOf(index: number): AddDynamicsOptions | null {
    const i = this.resolveEntryIndex(index, 'dynamics');
    if (i < 0) return null;

    const entry = this.entryAt(i);
    const e = entry.value;
    const volume = readNumberOrString(e, 'volume');
    if (volume === undefined) return null;

    return {
      date: readNumber(e, 'date') ?? entry.key,
      volume,
      transitionTo: readNumberOrString(e, 'transition.to'),
      curvature: readNumber(e, 'curvature'),
      protraction: readNumber(e, 'protraction'),
      subNoteDynamics: readBoolean(e, 'subNoteDynamics'),
      id: readId(e),
    };
  }

  /**
   * Patch the `<dynamics>` at `index` in place: a field the patch omits is left alone, one it
   * carries as `undefined` has its attribute removed, anything else is written.
   *
   * `curvature` and `protraction` are clamped exactly as {@link addDynamics} clamps them, so
   * this is not a way past {@link clampCurvature}'s invariant.
   *
   * `subNoteDynamics: false` writes `subNoteDynamics="false"`, which {@link addDynamics} would
   * spell by omitting the attribute. The two render alike; pass `undefined` to get the bytes.
   *
   * Patching `@date` re-keys and re-sorts the map, which is the one thing writing the attribute
   * alone would not do — {@link GenericMap.elements} keys on the date read when the element was
   * added, and a stale key makes every later lookup answer from the wrong position.
   *
   * @returns false if the entry is not a `<dynamics>`, in which case nothing was written.
   */
  updateDynamicsAt(index: number, patch: Partial<AddDynamicsOptions>): boolean {
    const i = this.resolveEntryIndex(index, 'dynamics');
    if (i < 0) return false;

    const clamped: { -readonly [K in keyof AddDynamicsOptions]?: AddDynamicsOptions[K] } = {
      ...patch,
    };
    if (clamped.curvature !== undefined)
      clamped.curvature = DynamicsMap.clampCurvature(clamped.curvature);
    if (clamped.protraction !== undefined)
      clamped.protraction = DynamicsMap.clampProtraction(clamped.protraction);

    const e = this.entryAt(i).value;
    patchAttribute(e, clamped, 'date');
    patchAttribute(e, clamped, 'volume');
    patchAttribute(e, clamped, 'transitionTo', 'transition.to');
    patchAttribute(e, clamped, 'curvature');
    patchAttribute(e, clamped, 'protraction');
    patchAttribute(e, clamped, 'subNoteDynamics');
    patchAttribute(e, clamped, 'id', 'xml:id');

    if ('date' in clamped) this.sort();
    return true;
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
    // `'channelVolumeMap'` contains "Map", so this cannot fail.
    const chanVolMap = unwrapOr(GenericMap.createGenericMap('channelVolumeMap'), null);
    let mapIndex = 0;
    for (let dynamicsIndex = 0; dynamicsIndex < this.size(); ++dynamicsIndex) {
      const dd = this.getDynamicsDataOf(dynamicsIndex);
      if (dd === null) continue;

      if (chanVolMap !== null) {
        if (dd.subNoteDynamics && dynamicsIndex < this.size() - 1) {
          DynamicsMap.generateSubNoteDynamics(dd, chanVolMap);
          for (; mapIndex < map.size(); ++mapIndex) {
            const mapEntry = elementAt(map.elements, mapIndex, 'target entry');
            if (mapEntry.key < dd.startDate || mapEntry.value.getLocalName() !== 'note') continue;
            if (mapEntry.key >= dd.endDate) break;
            mapEntry.value.addAttribute(new Attribute('velocity', '100.0'));
          }
          continue;
        }
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
        if (mapEntry.value.getLocalName() !== 'note') continue;
        if (mapEntry.key < dd.startDate) {
          mapEntry.value.addAttribute(new Attribute('velocity', '100.0'));
          continue;
        }
        if (mapEntry.key >= dd.endDate) break;
        mapEntry.value.addAttribute(
          new Attribute('velocity', String(dynamicsAt(dd, mapEntry.key))),
        );
      }
    }
    return chanVolMap;
  }

  private static generateSubNoteDynamics(
    dynamicsData: Dynamics,
    channelVolumeMap: GenericMap,
  ): void {
    const segment = subNoteDynamicsSegment(dynamicsData, 2.0);
    // Only the first event of the curve is marked mandatory.
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
    for (const entry of map.getAllElements()) {
      const e = entry.value;
      if (e.getLocalName() === 'note') e.addAttribute(new Attribute('velocity', '100.0'));
    }
    return null;
  }
}

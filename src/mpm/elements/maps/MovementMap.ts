import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { MovementData } from './data/MovementData.js';
import { DEFAULT_MOVEMENT_SAMPLE_MAX_STEP } from '../../RenderOptions.js';
import type { RenderContext } from '../../RenderOptions.js';
import type { Normalized } from '../../../units.js';

/**
 * An MPM `movementMap`: continuous controller movement, most commonly the sustain
 * pedal, expressed as smooth transitions between positions.
 *
 * Rendering does not modify the score. Instead
 * {@link MovementMap.renderMovementToMap} builds and returns a *new* `positionMap`
 * whose `<position>` elements are the sampled curve, which the MIDI export then turns
 * into controller events. Each `<movement>` runs until the next one.
 *
 * Port of meico.mpm.elements.maps.MovementMap
 */
export class MovementMap extends GenericMap {
  private constructor(typeOrXml: string | Element) {
    super(typeOrXml);
  }

  static createMovementMap(xml?: Element): MovementMap | null {
    try {
      return xml !== undefined ? new MovementMap(xml) : new MovementMap('movementMap');
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  addMovement(
    date: number,
    controller: string,
    position: number,
    transitionTo: number,
    id: string,
  ): number;
  addMovement(data: MovementData): number;
  addMovement(
    dateOrData: number | MovementData,
    controller?: string,
    position?: number,
    transitionTo?: number,
    id?: string,
  ): number {
    if (typeof dateOrData !== 'number') {
      const data = dateOrData;
      const e = new Element('movement', MPM_NAMESPACE);
      e.addAttribute(new Attribute('date', String(data.startDate)));
      if (data.position !== null) e.addAttribute(new Attribute('position', String(data.position)));
      if (data.transitionTo !== null)
        e.addAttribute(new Attribute('transition.to', String(data.transitionTo)));
      if (data.curvature !== null)
        e.addAttribute(new Attribute('curvature', String(data.curvature)));
      if (data.protraction !== null)
        e.addAttribute(new Attribute('protraction', String(data.protraction)));
      // Serialized since 2026-08-08 (MovementMap.java:120-121); before that this overload
      // silently dropped the controller, so a round-tripped movement always came back as
      // "sustain". Attribute order is byte-visible: after protraction, before xml:id.
      // Java guards on `data.controller != null`; the field is non-nullable here.
      e.addAttribute(new Attribute('controller', data.controller));
      if (data.xmlId !== null)
        e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', data.xmlId));
      return this.insertElement(new KeyValue(data.startDate, e), false);
    }
    const date = dateOrData;
    const e = new Element('movement', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('position', String(position)));
    e.addAttribute(new Attribute('transition.to', String(transitionTo)));
    e.addAttribute(new Attribute('controller', controller!));
    e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id!));
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Read the movement at `index` into a {@link MovementData}, or null if that entry is
   * not a `<movement>`. An out-of-range index is clamped to the last entry rather than
   * rejected, matching the reference.
   *
   * A `<movement>` without a `position` inherits where the previous one ended, so that
   * a chain of movements is continuous by default.
   */
  getMovementDataOf(index: number): MovementData | null {
    if (this.elements.length === 0 || index < 0) return null;
    const i = index >= this.elements.length ? this.elements.length - 1 : index;
    const e = this.elements[i].getValue();
    if (e.getLocalName() !== 'movement') return null;
    const md = new MovementData();
    md.startDate = this.elements[i].getKey();
    md.endDate = this.getEndDate(i);
    md.xml = e;
    const att = attribute('id', e);
    if (att !== null) md.xmlId = att.getValue();
    const posAtt = attribute('position', e);
    if (posAtt === null) md.position = this.getPreviousPosition(i) as Normalized;
    else md.position = parseFloat(posAtt.getValue()) as Normalized;
    const ttAtt = attribute('transition.to', e);
    if (ttAtt !== null) md.transitionTo = parseFloat(ttAtt.getValue()) as Normalized;
    // Parsed since 2026-08-08 (MovementMap.java:182-192). Previously the shape and the
    // target controller written into a `<movement>` were ignored on the way back out, so
    // every rendered movement used the MovementData defaults (curvature 0.4, protraction
    // 0, controller "sustain") regardless of the XML.
    const curvatureAtt = attribute('curvature', e);
    if (curvatureAtt !== null) md.curvature = parseFloat(curvatureAtt.getValue());
    const protractionAtt = attribute('protraction', e);
    if (protractionAtt !== null) md.protraction = parseFloat(protractionAtt.getValue());
    const controllerAtt = attribute('controller', e);
    if (controllerAtt !== null) md.controller = controllerAtt.getValue();
    return md;
  }

  /**
   * The end position of the nearest preceding `<movement>`, or 0 if there is none.
   *
   * PARITY NOTE — the loop condition is `j > 0`, not `j >= 0`, so **entry 0 is never
   * examined**: a movement that inherits its position from the very first entry in the
   * map gets 0 instead of that entry's `transition.to`. This is faithful to the Java
   * reference (MovementMap.java:200). Also unlike the reference, a preceding movement
   * with no `transition.to` leaves `finalPosition` at 0 here, where Java throws a
   * NullPointerException — a difference confined to the malformed-input path.
   */
  private getPreviousPosition(index: number): number {
    let finalPosition = 0;
    for (let j = index - 1; j > 0; --j) {
      if (this.elements[j].getValue().getLocalName() === 'movement') {
        const ttAtt = this.elements[j].getValue().getAttribute('transition.to');
        if (ttAtt !== null) finalPosition = parseFloat(ttAtt.getValue());
        break;
      }
    }
    return finalPosition;
  }

  private getEndDate(index: number): number {
    for (let j = index + 1; j < this.elements.length; ++j) {
      if (this.elements[j].getValue().getLocalName() === 'movement')
        return this.elements[j].getKey();
    }
    return Number.MAX_VALUE;
  }

  /**
   * Sample every movement into a fresh `positionMap` of `<position>` elements.
   *
   * The **last** movement in the map is deliberately not rendered
   * (`movementIndex < this.size() - 1`): a movement is a transition *towards* the next
   * one, so the final entry has no span to cover and only serves as the target the
   * previous transition aims at. Movements at a negative date are skipped as well.
   *
   * @param ctx supplies {@link RenderOptions.movementSampleMaxStep}; omitting it samples
   *   at {@link DEFAULT_MOVEMENT_SAMPLE_MAX_STEP}, which is what every fixture is
   *   generated with.
   */
  renderMovementToMap(ctx?: RenderContext): GenericMap | null {
    const movementMap = GenericMap.createGenericMap('positionMap');
    for (let movementIndex = 0; movementIndex < this.size(); ++movementIndex) {
      const md = this.getMovementDataOf(movementIndex);
      if (md === null) continue;
      if (movementMap !== null && movementIndex < this.size() - 1 && md.startDate >= 0) {
        MovementMap.generateMovement(md, movementMap, ctx);
      }
    }
    return movementMap;
  }

  static renderMovementToMap(
    movementMap: MovementMap | null,
    ctx?: RenderContext,
  ): GenericMap | null {
    if (movementMap === null) return null;
    return movementMap.renderMovementToMap(ctx);
  }

  private static generateMovement(
    movementData: MovementData,
    movementMap: GenericMap,
    ctx?: RenderContext,
  ): void {
    // The default is resolved here, at the point of use inside `src/mpm/`, never by a
    // caller — `src/msm/` may only `import type` from this layer (RULE M1), so it cannot
    // reach the constant. The `as` is RULE U3a's single boundary cast: options are plain
    // numbers on the way in, branded where they are consumed.
    const maxStepSize = (ctx?.options.movementSampleMaxStep ??
      DEFAULT_MOVEMENT_SAMPLE_MAX_STEP) as Normalized;
    const movementSegment = movementData.getMovementSegment(maxStepSize);
    for (const event of movementSegment) {
      const e = new Element('position', movementMap.getXml()!.getNamespaceURI());
      e.addAttribute(new Attribute('date', String(event[0])));
      e.addAttribute(new Attribute('value', String(event[1])));
      e.addAttribute(new Attribute('controller', movementData.controller));
      movementMap.addElement(e);
    }
  }
}

GenericMap.registerMapFactory('movementMap', (xml) => MovementMap.createMovementMap(xml));

import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { KeyValue } from '../../../supplementary/KeyValue.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import { MovementData } from './data/MovementData.js';
import { movementSegment, resolveMovement, type Movement } from './data/movement.js';
import { mapPresent, unwrapOr } from '../../../prelude/index.js';
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
  private constructor(xml: Element) {
    super(xml);
  }

  /**
   * A fresh, empty `<movementMap>`, or one read from an existing element.
   *
   * The two overloads return different things and that is the point. Building an empty
   * map consults nothing the caller supplied, so it cannot fail and says so; reading an
   * element can, and returns the reason instead of printing it. See
   * {@link GenericMap.emptyMapElement}.
   */
  static createMovementMap(): MovementMap;
  static createMovementMap(xml: Element): Result<MovementMap, MpmParseError>;
  static createMovementMap(xml?: Element | null): MovementMap | Result<MovementMap, MpmParseError> {
    return xml === undefined
      ? new MovementMap(GenericMap.emptyMapElement('movementMap'))
      : GenericMap.makeMap(xml, 'MovementMap', (elt) => new MovementMap(elt));
  }

  /**
   * Add a `<movement>` from a {@link MovementData}.
   *
   * This and {@link addMovement} were one overloaded name whose arms both returned `number`,
   * so the overload said nothing at the type level while hiding a real difference: only this
   * form writes `curvature` and `protraction`, and the two write their attributes in
   * different orders. Attribute order is byte-visible, so which writer a call selects is not
   * a detail — and it used to be selected by whether the first argument happened to be a
   * number.
   */
  addMovementData(data: MovementData): number {
    const e = new Element('movement', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(data.startDate)));
    if (data.position !== null) e.addAttribute(new Attribute('position', String(data.position)));
    if (data.transitionTo !== null)
      e.addAttribute(new Attribute('transition.to', String(data.transitionTo)));
    if (data.curvature !== null) e.addAttribute(new Attribute('curvature', String(data.curvature)));
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

  /**
   * Add a `<movement>` from its values. See {@link addMovementData} for the other writer and
   * why they are two names.
   *
   * The five parameters are all required and now say so. They were `controller?`,
   * `position?`, `transitionTo?`, `id?` in the implementation signature only because the
   * data-holder arm shared it, which is also why `String(controller)` needed a comment
   * explaining that it was not a disguised `controller!`. It no longer needs one.
   */
  addMovement(
    date: number,
    controller: string,
    position: number,
    transitionTo: number,
    id: string,
  ): number {
    const e = new Element('movement', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(date)));
    e.addAttribute(new Attribute('position', String(position)));
    e.addAttribute(new Attribute('transition.to', String(transitionTo)));
    e.addAttribute(new Attribute('controller', controller));
    e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', id));
    return this.insertElement(new KeyValue(date, e), false);
  }

  /**
   * Read the movement at `index` into the {@link Movement} arm it names, or null if that
   * entry is not a `<movement>`. An out-of-range index is clamped to the last entry rather
   * than rejected, matching the reference.
   *
   * A `<movement>` without a `position` inherits where the previous one ended, so that a
   * chain of movements is continuous by default; where there is nothing to inherit, the
   * instruction is logged and skipped (see {@link getPreviousPosition}).
   *
   * Everything else is handed to {@link resolveMovement}, which picks the arm and applies
   * the defaults. Note that it branches on the *absence* of `@transition.to`, not on the
   * usability of its value: `parseFloat('x')` is `NaN`, which is not null, so a malformed
   * target still builds the transitioning arm and the span travels towards `NaN`.
   */
  getMovementDataOf(index: number): Movement | null {
    const i = this.resolveEntryIndex(index, 'movement');
    if (i < 0) return null;
    const entry = this.entryAt(i);
    const e = entry.getValue();

    const posAtt = attribute('position', e);
    let position: number;
    if (posAtt === null) {
      const inherited = this.getPreviousPosition(i);
      if (inherited === null) {
        console.error(
          `Cannot read movement at index ${String(i)}: it has no position attribute and the preceding movement has no transition.to to inherit one from. Skipping it.`,
        );
        return null;
      }
      position = inherited;
    } else position = parseFloat(posAtt.getValue());

    // Parsed since 2026-08-08 (MovementMap.java:182-192). Previously the shape and the
    // target controller written into a `<movement>` were ignored on the way back out, so
    // every rendered movement used the defaults (curvature 0.4, protraction 0, controller
    // "sustain") regardless of the XML.
    return resolveMovement({
      startDate: entry.getKey(),
      endDate: this.nextDateOfType(i, 'movement'),
      position: position as Normalized,
      transitionTo: mapPresent(
        attribute('transition.to', e),
        (a) => parseFloat(a.getValue()) as Normalized,
      ),
      curvature: mapPresent(attribute('curvature', e), (a) => parseFloat(a.getValue())),
      protraction: mapPresent(attribute('protraction', e), (a) => parseFloat(a.getValue())),
      controller: mapPresent(attribute('controller', e), (a) => a.getValue()),
    });
  }

  /**
   * The end position of the nearest preceding `<movement>`; 0 if there is none, and null if
   * the one found cannot supply a position.
   *
   * PARITY NOTE — the loop condition is `j > 0`, not `j >= 0`, so **entry 0 is never
   * examined**: a movement that inherits its position from the very first entry in the
   * map gets 0 instead of that entry's `transition.to`. This is faithful to the Java
   * reference (MovementMap.java:200) and is deliberately kept.
   *
   * The null return is not: a preceding `<movement>` with no `transition.to` used to leave
   * `finalPosition` at 0, silently placing the movement at "fully released" — a wrong
   * position rendered as if it were a real one. Java throws a NullPointerException at
   * `MovementMap.java:200` (`getAttribute("transition.to").getValue()`) and aborts the
   * whole render instead. Neither is right, so this reports "no position available" and
   * {@link getMovementDataOf} logs and skips just that movement, which is the interior's
   * house policy for malformed input (ARCHITECTURE.md RULE E1, logs-and-returns-null) and
   * the same shape the def factories use. See PARITY.md, "Fixed bugs", P2.
   */
  private getPreviousPosition(index: number): number | null {
    for (let j = index - 1; j > 0; --j) {
      const previous = this.entryAt(j).getValue();
      if (previous.getLocalName() === 'movement') {
        const ttAtt = previous.getAttribute('transition.to');
        return ttAtt === null ? null : parseFloat(ttAtt.getValue());
      }
    }
    return 0;
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
    // As in `DynamicsMap.renderDynamicsToMap`: `'positionMap'` contains "Map", so the only
    // arm this can take is the value, and the `!== null` guard below stays a guard.
    const movementMap = unwrapOr(GenericMap.createGenericMap('positionMap'), null);
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
    movementData: Movement,
    movementMap: GenericMap,
    ctx?: RenderContext,
  ): void {
    // The default is resolved here, at the point of use inside `src/mpm/`, never by a
    // caller — `src/msm/` may only `import type` from this layer (RULE M1), so it cannot
    // reach the constant. The `as` is RULE U3a's single boundary cast: options are plain
    // numbers on the way in, branded where they are consumed.
    const maxStepSize = (ctx?.options.movementSampleMaxStep ??
      DEFAULT_MOVEMENT_SAMPLE_MAX_STEP) as Normalized;
    const segment = movementSegment(movementData, maxStepSize);
    for (const event of segment) {
      const e = new Element('position', movementMap.getXml().getNamespaceURI());
      e.addAttribute(new Attribute('date', String(event[0])));
      e.addAttribute(new Attribute('value', String(event[1])));
      e.addAttribute(new Attribute('controller', movementData.controller));
      movementMap.addElement(e);
    }
  }
}

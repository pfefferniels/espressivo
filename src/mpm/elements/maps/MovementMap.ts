import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute } from '../../../xml/tree.js';
import { MPM_NAMESPACE } from '../../names.js';
import { GenericMap } from './GenericMap.js';
import { type Result } from '../../../prelude/index.js';
import { type MpmParseError } from '../parseError.js';
import {
  DEFAULT_CONTROLLER,
  movementSegment,
  resolveMovement,
  type Movement,
} from './data/movement.js';
import { mapPresent, unwrapOr } from '../../../prelude/index.js';
import { DEFAULT_MOVEMENT_SAMPLE_MAX_STEP } from '../../RenderOptions.js';
import type { RenderContext } from '../../RenderOptions.js';
import type { Normalized } from '../../../units.js';

/**
 * Everything a `<movement>` element can say, for {@link MovementMap.addMovement} (RULE F5's
 * named-parameter shape, applied inside the library).
 *
 * Optional properties are `?:` and never `null` (RULE N1): an attribute nobody supplied is an
 * attribute that is not written, and {@link resolveMovement} then applies its default — 0.4
 * for `curvature`, 0.0 for `protraction`, and for an absent `transition.to` the constant arm.
 * Absent `position` is the one that is not merely a default: the reader inherits it from the
 * preceding movement's `transition.to`, and rejects the instruction where there is none.
 */
export interface AddMovementOptions {
  /** `@date`, in ticks. Always written. */
  readonly date: number;
  /** `@position`, normalized 0..1. */
  readonly position?: Normalized;
  /** `@transition.to`, normalized 0..1; absent means a constant movement. */
  readonly transitionTo?: Normalized;
  /** `@curvature`. */
  readonly curvature?: number;
  /** `@protraction`. */
  readonly protraction?: number;
  /** `@controller` — the MIDI controller the movement drives. Always written. */
  readonly controller?: string;
  /** `xml:id` of the movement element. */
  readonly id?: string;
}

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
   * A fresh, empty `<movementMap>`, or one read from an existing element. The empty form is
   * total, the parsing one is not; see {@link GenericMap.emptyMapElement}.
   */
  static createMovementMap(): MovementMap;
  static createMovementMap(xml: Element): Result<MovementMap, MpmParseError>;
  static createMovementMap(xml?: Element): MovementMap | Result<MovementMap, MpmParseError> {
    return xml === undefined
      ? new MovementMap(GenericMap.emptyMapElement('movementMap'))
      : GenericMap.makeMap(xml, 'MovementMap', (elt) => new MovementMap(elt));
  }

  /**
   * Add a `<movement>`.
   *
   * Attribute order is `date`, `position`, `transition.to`, `curvature`, `protraction`,
   * `controller`, `xml:id`, each omitted where the caller supplied nothing. Order is
   * byte-visible; `controller` in particular goes after `protraction` and before `xml:id`
   * (MovementMap.java:120-121).
   *
   * `date` and `controller` are unconditional, `controller` defaulting to `sustain` — which is
   * also {@link resolveMovement}'s default for an absent one, so writing it out and leaving it
   * off render the same.
   */
  addMovement(movement: AddMovementOptions): number {
    const e = new Element('movement', MPM_NAMESPACE);
    e.addAttribute(new Attribute('date', String(movement.date)));
    if (movement.position !== undefined)
      e.addAttribute(new Attribute('position', String(movement.position)));
    if (movement.transitionTo !== undefined)
      e.addAttribute(new Attribute('transition.to', String(movement.transitionTo)));
    if (movement.curvature !== undefined)
      e.addAttribute(new Attribute('curvature', String(movement.curvature)));
    if (movement.protraction !== undefined)
      e.addAttribute(new Attribute('protraction', String(movement.protraction)));
    e.addAttribute(new Attribute('controller', movement.controller ?? DEFAULT_CONTROLLER));
    if (movement.id !== undefined)
      e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', movement.id));
    return this.insertElement({ key: movement.date, value: e }, false);
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
    const e = entry.value;

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
      startDate: entry.key,
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
   * The null return is a deliberate divergence: for a preceding `<movement>` with no
   * `transition.to` Java dereferences null and aborts the whole render, and leaving the
   * position at 0 instead would silently place the movement at "fully released". So this
   * reports "no position available" and {@link getMovementDataOf} logs and skips just that
   * movement (ARCHITECTURE.md RULE E1, logs-and-returns-null). PARITY.md §1, P2.
   */
  private getPreviousPosition(index: number): number | null {
    for (let j = index - 1; j >= 0; --j) {
      const previous = this.entryAt(j).value;
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
    // `'positionMap'` contains "Map", so this cannot fail.
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
    // The default is resolved at the point of use inside `src/mpm/`, never by a caller:
    // `src/msm/` may only `import type` from this layer (RULE M1), so it cannot reach the
    // constant. The `as` is RULE U3a's single boundary cast — options are plain numbers on the
    // way in, branded where they are consumed.
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

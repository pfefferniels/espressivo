import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../../xml/ids.js';
import { attribute } from '../../../../xml/tree.js';
import type { ArticulationDef } from '../../styles/defs/ArticulationDef.js';

/**
 * One `<articulation>` as the renderer applies it: the def it names, resolved against the
 * style in scope, plus the twelve modifiers the element may carry itself.
 *
 * The modifiers come in two flavours that must not be mixed up. The tick modifiers
 * (`absoluteDuration`, `relativeDuration`, `absoluteDelay`, the velocity and detune fields)
 * are applied here and now, by {@link articulateNote}. The ms modifiers
 * (`absoluteDurationMs`, `absoluteDurationChangeMs`, `absoluteDelayMs`) cannot be:
 * milliseconds do not exist yet at articulation time, because the tempo map has not run. So
 * `articulateNote` only parks them on the note as `articulation.absoluteXMs` attributes, and
 * `ArticulationMap.renderArticulationToMap_millisecondModifiers` consumes and removes them in
 * a later pass. That two-phase split is why the pipeline calls ArticulationMap twice.
 *
 * Build these with `ArticulationMap.getArticulationDataOf`. It is the only reader that
 * resolves the `articulationDef`, and it strips the leading `#` off `@noteid` — the map is
 * keyed by bare ids, so a `noteid` that keeps its `#` targets a note that cannot exist.
 *
 * `xml`, `styleName`, `style`, `defaultArticulation` and `defaultArticulationDef` are not
 * here: the reader set all five and nothing read them afterwards. The style is an input to
 * resolution, and the default articulation is applied by walking the style switches
 * (`renderArticulationToMap_noMillisecondModifiers`), not by consulting a datum that was
 * matched to a note.
 *
 * Port of the read half of meico.mpm.elements.maps.data.ArticulationData.
 */
export interface Articulation {
  /** `xml:id` of the articulation element; the value written into each note's `modified` list. */
  readonly xmlId: string | null;
  /** `@date`, in ticks. */
  readonly date: number;
  /** `@noteid` with its leading `#` stripped, or null where the articulation names no note. */
  readonly noteid: string | null;
  /**
   * `@name.ref` — the `articulationDef` this instruction asks for.
   *
   * Kept beside the resolved {@link articulationDef} rather than folded into it, because when
   * the def is null the name is the only record of what was asked for.
   */
  readonly articulationDefName: string | null;
  /**
   * The def {@link articulationDefName} resolved to, or null where there is no style in scope
   * or it carries no def by that name. {@link articulateNote} then applies the local modifiers
   * alone.
   */
  readonly articulationDef: ArticulationDef | null;

  /** `@absoluteDuration`, in ticks; null where the element does not carry one. */
  readonly absoluteDuration: number | null;
  /** `@absoluteDurationChange`, in ticks. */
  readonly absoluteDurationChange: number;
  /** `@absoluteDurationMs`; null where absent. Parked for the millisecond pass. */
  readonly absoluteDurationMs: number | null;
  /** `@absoluteDurationChangeMs`. Parked for the millisecond pass. */
  readonly absoluteDurationChangeMs: number;
  /** `@relativeDuration`, a factor; 1.0 is the neutral. */
  readonly relativeDuration: number;
  /** `@absoluteDelay`, in ticks. */
  readonly absoluteDelay: number;
  /** `@absoluteDelayMs`. Parked for the millisecond pass. */
  readonly absoluteDelayMs: number;
  /** `@absoluteVelocity`; null where absent. */
  readonly absoluteVelocity: number | null;
  /** `@absoluteVelocityChange`. */
  readonly absoluteVelocityChange: number;
  /** `@relativeVelocity`, a factor; 1.0 is the neutral. */
  readonly relativeVelocity: number;
  /** `@detuneCents`. */
  readonly detuneCents: number;
  /** `@detuneHz`. */
  readonly detuneHz: number;
}

/**
 * The neutral value of every modifier — what an articulation that names nothing but a def
 * renders as, which is that def alone.
 */
export const NEUTRAL_ARTICULATION_MODIFIERS = {
  absoluteDuration: null,
  absoluteDurationChange: 0.0,
  absoluteDurationMs: null,
  absoluteDurationChangeMs: 0.0,
  relativeDuration: 1.0,
  absoluteDelay: 0.0,
  absoluteDelayMs: 0.0,
  absoluteVelocity: null,
  absoluteVelocityChange: 0.0,
  relativeVelocity: 1.0,
  detuneCents: 0.0,
  detuneHz: 0.0,
} as const;

/**
 * Apply `articulation` to `note`, in place. Returns whether the note's date moved, which the
 * caller needs because a moved note may have to be re-sorted into the map.
 *
 * The referenced `articulationDef` is applied first, then the local modifiers on top, so a
 * local value always wins over the def's. Within the duration block the write order is
 * load-bearing: `duration` is read once, up front, and every branch computes from that
 * original value rather than from what the previous branch wrote — so `absoluteDuration`,
 * `relativeDuration` and `absoluteDurationChange` do not compose, the last one to fire simply
 * overwrites. `absoluteDurationMs` short-circuits the entire tick-domain branch (see the
 * header on the two-phase split).
 *
 * PARITY NOTE — the `absoluteDurationChange` branch is the one place where this port knowingly
 * does not reproduce the Java reference: Java's loop there never terminates. See DELIBERATE
 * DIVERGENCE #1 at the site below.
 */
export function articulateNote(articulation: Articulation, note: Element | null): boolean {
  if (note === null) return false;
  const { xmlId } = articulation;

  let dateChanged = false;
  if (articulation.articulationDef !== null)
    dateChanged = articulation.articulationDef.articulateNote(note);

  const dateAtt = attribute('date.perf', note);
  if (dateAtt !== null) {
    if (articulation.absoluteDelay !== 0.0) {
      dateAtt.setValue(String(parseFloat(dateAtt.getValue()) + articulation.absoluteDelay));
      addToListAttribute(note, 'modified', xmlId);
      dateChanged = true;
    }
    if (articulation.absoluteDelayMs !== 0.0) {
      note.addAttribute(
        new Attribute('articulation.absoluteDelayMs', String(articulation.absoluteDelayMs)),
      );
      addToListAttribute(note, 'modified', xmlId);
    }
  }

  const durationAtt = attribute('duration.perf', note);
  if (durationAtt !== null) {
    const duration = parseFloat(durationAtt.getValue());
    if (articulation.absoluteDurationMs !== null) {
      note.addAttribute(
        new Attribute('articulation.absoluteDurationMs', String(articulation.absoluteDurationMs)),
      );
      addToListAttribute(note, 'modified', xmlId);
    } else {
      if (articulation.absoluteDuration !== null) {
        durationAtt.setValue(String(articulation.absoluteDuration));
        addToListAttribute(note, 'modified', xmlId);
      }
      if (articulation.relativeDuration !== 1.0) {
        durationAtt.setValue(String(duration * articulation.relativeDuration));
        addToListAttribute(note, 'modified', xmlId);
      }
      // DELIBERATE DIVERGENCE #1 — ARCHITECTURE.md the row P3.
      // Java writes this loop as `for (double reduce = 2.0; durNew >= 0.0; reduce *= 2.0)`
      // with no guard (ArticulationData.java:197), and that never terminates: `reduce`
      // doubles to Infinity, `durNew` converges back to the unchanged `duration`, and
      // `>= 0.0` stays true forever — the inverse of the test the comment on that same Java
      // line describes. We use the spelling Java's own ArticulationDef.java:420-423 gives
      // the same computation: the `> 0.0` guard AND `durNew <= 0.0`. Both are needed — with
      // `<=` but no guard, a note whose `duration.perf` is 0 or negative plus a negative
      // change still spins forever, since `durNew` converges to a `duration` that is itself
      // `<= 0.0`. And a zero `duration.perf` is not hypothetical: the reference output
      // tests/integration/fixtures/performance-reference/composite_advanced_augmented.msm
      // carries one.
      //
      // Second observable consequence, beyond termination: the `modified` bookkeeping sits
      // inside the guard too, so a note with `duration.perf <= 0` gets no `modified` list
      // entry. ArticulationDef has no such bookkeeping to copy, and keeping the write
      // outside the guard would announce a modification that did not happen.
      if (articulation.absoluteDurationChange !== 0.0) {
        if (duration > 0.0) {
          let durNew = duration + articulation.absoluteDurationChange;
          for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)
            durNew = duration + articulation.absoluteDurationChange / reduce;
          durationAtt.setValue(String(durNew));
          addToListAttribute(note, 'modified', xmlId);
        }
      }
    }
    if (articulation.absoluteDurationChangeMs !== 0.0) {
      note.addAttribute(
        new Attribute(
          'articulation.absoluteDurationChangeMs',
          String(articulation.absoluteDurationChangeMs),
        ),
      );
      addToListAttribute(note, 'modified', xmlId);
    }
  }

  const velocityAtt = attribute('velocity', note);
  if (velocityAtt !== null) {
    if (articulation.absoluteVelocity !== null) {
      velocityAtt.setValue(String(articulation.absoluteVelocity));
      addToListAttribute(note, 'modified', xmlId);
    }
    if (articulation.relativeVelocity !== 1.0) {
      velocityAtt.setValue(
        String(parseFloat(velocityAtt.getValue()) * articulation.relativeVelocity),
      );
      addToListAttribute(note, 'modified', xmlId);
    }
    if (articulation.absoluteVelocityChange !== 0.0) {
      velocityAtt.setValue(
        String(parseFloat(velocityAtt.getValue()) + articulation.absoluteVelocityChange),
      );
      addToListAttribute(note, 'modified', xmlId);
    }
  }

  if (articulation.detuneCents !== 0.0) {
    note.addAttribute(new Attribute('detuneCents', String(articulation.detuneCents)));
    addToListAttribute(note, 'modified', xmlId);
  }
  if (articulation.detuneHz !== 0.0) {
    note.addAttribute(new Attribute('detuneHz', String(articulation.detuneHz)));
    addToListAttribute(note, 'modified', xmlId);
  }

  return dateChanged;
}

import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { addToListAttribute } from '../../../../xml/ids.js';
import { attribute } from '../../../../xml/tree.js';
import type { ArticulationStyle } from '../../styles/ArticulationStyle.js';
import type { ArticulationDef } from '../../styles/defs/ArticulationDef.js';

/**
 * All data needed to articulate one note — a single MPM `<articulation>` element plus
 * the style context only {@link ArticulationMap} knows.
 *
 * The modifier fields come in two flavours that must not be mixed up. The **tick**
 * modifiers (`absoluteDuration`, `relativeDuration`, `absoluteDelay`, the velocity and
 * detune fields) are applied here and now, in {@link articulateNote}. The **ms**
 * modifiers (`absoluteDurationMs`, `absoluteDurationChangeMs`, `absoluteDelayMs`) can
 * not be: milliseconds do not exist yet at articulation time, because the tempo map has
 * not run. So `articulateNote` only *parks* them on the note as
 * `articulation.absoluteXMs` attributes, and
 * {@link ArticulationMap.renderArticulationToMap_millisecondModifiers} consumes and
 * removes them in a later pass. This two-phase split is why the pipeline calls
 * ArticulationMap twice.
 *
 * Port of meico.mpm.elements.maps.data.ArticulationData
 */
export class ArticulationData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: ArticulationStyle | null = null;
  defaultArticulation: string | null = null;
  defaultArticulationDef: ArticulationDef | null = null;
  articulationDefName: string | null = null;
  articulationDef: ArticulationDef | null = null;

  date = 0.0;
  noteid: string | null = null;

  absoluteDuration: number | null = null;
  absoluteDurationChange = 0.0;
  absoluteDurationMs: number | null = null;
  absoluteDurationChangeMs = 0.0;
  relativeDuration = 1.0;
  absoluteDelay = 0.0;
  absoluteDelayMs = 0.0;
  absoluteVelocity: number | null = null;
  absoluteVelocityChange = 0.0;
  relativeVelocity = 1.0;
  detuneCents = 0.0;
  detuneHz = 0.0;

  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.date = parseFloat(xml.getAttributeValue('date')!);

    const nameRef = xml.getAttribute('name.ref');
    if (nameRef !== null) this.articulationDefName = nameRef.getValue();

    const noteId = xml.getAttribute('noteid');
    if (noteId !== null) this.noteid = noteId.getValue();

    const absoluteDurationAttr = xml.getAttribute('absoluteDuration');
    if (absoluteDurationAttr !== null)
      this.absoluteDuration = parseFloat(absoluteDurationAttr.getValue());

    const absoluteDurationChangeAttr = xml.getAttribute('absoluteDurationChange');
    if (absoluteDurationChangeAttr !== null)
      this.absoluteDurationChange = parseFloat(absoluteDurationChangeAttr.getValue());

    const absoluteDurationMsAttr = xml.getAttribute('absoluteDurationMs');
    if (absoluteDurationMsAttr !== null)
      this.absoluteDurationMs = parseFloat(absoluteDurationMsAttr.getValue());

    const absoluteDurationChangeMsAttr = xml.getAttribute('absoluteDurationChangeMs');
    if (absoluteDurationChangeMsAttr !== null)
      this.absoluteDurationChangeMs = parseFloat(absoluteDurationChangeMsAttr.getValue());

    const relativeDurationAttr = xml.getAttribute('relativeDuration');
    if (relativeDurationAttr !== null)
      this.relativeDuration = parseFloat(relativeDurationAttr.getValue());

    const absoluteDelayAttr = xml.getAttribute('absoluteDelay');
    if (absoluteDelayAttr !== null) this.absoluteDelay = parseFloat(absoluteDelayAttr.getValue());

    const absoluteDelayMsAttr = xml.getAttribute('absoluteDelayMs');
    if (absoluteDelayMsAttr !== null)
      this.absoluteDelayMs = parseFloat(absoluteDelayMsAttr.getValue());

    const absoluteVelocityAttr = xml.getAttribute('absoluteVelocity');
    if (absoluteVelocityAttr !== null)
      this.absoluteVelocity = parseFloat(absoluteVelocityAttr.getValue());

    const absoluteVelocityChangeAttr = xml.getAttribute('absoluteVelocityChange');
    if (absoluteVelocityChangeAttr !== null)
      this.absoluteVelocityChange = parseFloat(absoluteVelocityChangeAttr.getValue());

    const relativeVelocityAttr = xml.getAttribute('relativeVelocity');
    if (relativeVelocityAttr !== null)
      this.relativeVelocity = parseFloat(relativeVelocityAttr.getValue());

    const detuneCentsAttr = xml.getAttribute('detuneCents');
    if (detuneCentsAttr !== null) this.detuneCents = parseFloat(detuneCentsAttr.getValue());

    const detuneHzAttr = xml.getAttribute('detuneHz');
    if (detuneHzAttr !== null) this.detuneHz = parseFloat(detuneHzAttr.getValue());

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();
  }

  clone(): ArticulationData {
    const c = new ArticulationData();
    c.xml = this.xml === null ? null : this.xml.copy();
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.defaultArticulation = this.defaultArticulation;
    c.defaultArticulationDef = this.defaultArticulationDef;
    c.articulationDefName = this.articulationDefName;
    c.articulationDef = this.articulationDef;
    c.date = this.date;
    c.noteid = this.noteid;
    c.absoluteDuration = this.absoluteDuration;
    c.absoluteDurationChange = this.absoluteDurationChange;
    c.relativeDuration = this.relativeDuration;
    c.absoluteDurationMs = this.absoluteDurationMs;
    c.absoluteDurationChangeMs = this.absoluteDurationChangeMs;
    c.absoluteVelocityChange = this.absoluteVelocityChange;
    c.absoluteVelocity = this.absoluteVelocity;
    c.relativeVelocity = this.relativeVelocity;
    c.absoluteDelayMs = this.absoluteDelayMs;
    c.absoluteDelay = this.absoluteDelay;
    c.detuneCents = this.detuneCents;
    c.detuneHz = this.detuneHz;
    return c;
  }

  /**
   * Apply this articulation to `note`, in place. Returns whether the note's date moved,
   * which the caller needs because a moved note may have to be re-sorted into the map.
   *
   * The referenced `articulationDef` is applied **first**, then these local modifiers on
   * top, so a local value always wins over the def's. Within the duration block the
   * write order is load-bearing: `duration` is read once, up front, and every branch
   * computes from that original value rather than from what the previous branch wrote —
   * so `absoluteDuration`, `relativeDuration` and `absoluteDurationChange` do not
   * compose, the last one to fire simply overwrites. `absoluteDurationMs` short-circuits
   * the entire tick-domain branch (see the class doc on the two-phase split).
   *
   * PARITY NOTE — the `absoluteDurationChange` branch is the one place where this port
   * knowingly does not reproduce the Java reference: Java's loop there never terminates.
   * See DELIBERATE DIVERGENCE #1 at the site below for the full account.
   */
  articulateNote(note: Element | null): boolean {
    if (note === null) return false;

    let dateChanged = false;
    if (this.articulationDef !== null) dateChanged = this.articulationDef.articulateNote(note);

    const dateAtt = attribute('date.perf', note);
    if (dateAtt !== null) {
      if (this.absoluteDelay !== 0.0) {
        dateAtt.setValue(String(parseFloat(dateAtt.getValue()) + this.absoluteDelay));
        addToListAttribute(note, 'modified', this.xmlId);
        dateChanged = true;
      }
      if (this.absoluteDelayMs !== 0.0) {
        note.addAttribute(
          new Attribute('articulation.absoluteDelayMs', String(this.absoluteDelayMs)),
        );
        addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    const durationAtt = attribute('duration.perf', note);
    if (durationAtt !== null) {
      const duration = parseFloat(durationAtt.getValue());
      if (this.absoluteDurationMs !== null) {
        note.addAttribute(
          new Attribute('articulation.absoluteDurationMs', String(this.absoluteDurationMs)),
        );
        addToListAttribute(note, 'modified', this.xmlId);
      } else {
        if (this.absoluteDuration !== null) {
          durationAtt.setValue(String(this.absoluteDuration));
          addToListAttribute(note, 'modified', this.xmlId);
        }
        if (this.relativeDuration !== 1.0) {
          durationAtt.setValue(String(duration * this.relativeDuration));
          addToListAttribute(note, 'modified', this.xmlId);
        }
        // DELIBERATE DIVERGENCE #1 — refactor item TD1; ARCHITECTURE.md §6.3 row P3, §8.0.
        // Java writes this loop as `for (double reduce = 2.0; durNew >= 0.0; reduce *= 2.0)`
        // with no guard (ArticulationData.java:197), and that never terminates: `reduce`
        // doubles to Infinity, `durNew` converges back to the unchanged `duration`, and
        // `>= 0.0` stays true forever. The comment on that same Java line — "as long as the
        // duration change causes the duration to become 0.0 or negative" — describes the
        // inverse test, so the code contradicts its author's stated intent. We therefore use
        // the spelling Java's own ArticulationDef.java:420-423 gives the same computation:
        // the `> 0.0` guard AND `durNew <= 0.0`. Both are needed — with `<=` but no guard, a
        // note whose `duration.perf` is 0 or negative plus a negative change still spins
        // forever, since `durNew` converges to a `duration` that is itself `<= 0.0`. And a
        // zero `duration.perf` is not hypothetical: the reference output
        // tests/integration/fixtures/performance-reference/composite_advanced_augmented.msm
        // carries one.
        //
        // Second observable consequence, beyond termination: the `modified` bookkeeping now
        // sits inside the guard too, so a note with `duration.perf <= 0` no longer gets its
        // `modified` list entry. ArticulationDef has no such bookkeeping to copy; keeping the
        // write outside the guard would announce a modification that did not happen.
        if (this.absoluteDurationChange !== 0.0) {
          if (duration > 0.0) {
            let durNew = duration + this.absoluteDurationChange;
            for (let reduce = 2.0; durNew <= 0.0; reduce *= 2.0)
              durNew = duration + this.absoluteDurationChange / reduce;
            durationAtt.setValue(String(durNew));
            addToListAttribute(note, 'modified', this.xmlId);
          }
        }
      }
      if (this.absoluteDurationChangeMs !== 0.0) {
        note.addAttribute(
          new Attribute(
            'articulation.absoluteDurationChangeMs',
            String(this.absoluteDurationChangeMs),
          ),
        );
        addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    const velocityAtt = attribute('velocity', note);
    if (velocityAtt !== null) {
      if (this.absoluteVelocity !== null) {
        velocityAtt.setValue(String(this.absoluteVelocity));
        addToListAttribute(note, 'modified', this.xmlId);
      }
      if (this.relativeVelocity !== 1.0) {
        velocityAtt.setValue(String(parseFloat(velocityAtt.getValue()) * this.relativeVelocity));
        addToListAttribute(note, 'modified', this.xmlId);
      }
      if (this.absoluteVelocityChange !== 0.0) {
        velocityAtt.setValue(
          String(parseFloat(velocityAtt.getValue()) + this.absoluteVelocityChange),
        );
        addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    if (this.detuneCents !== 0.0) {
      note.addAttribute(new Attribute('detuneCents', String(this.detuneCents)));
      addToListAttribute(note, 'modified', this.xmlId);
    }
    if (this.detuneHz !== 0.0) {
      note.addAttribute(new Attribute('detuneHz', String(this.detuneHz)));
      addToListAttribute(note, 'modified', this.xmlId);
    }

    return dateChanged;
  }
}

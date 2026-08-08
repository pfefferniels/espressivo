import { Attribute, Element } from '../../../../xml/XomTypes.js';
import { Helper } from '../../../../mei/Helper.js';
import type { ArticulationStyle } from '../../styles/ArticulationStyle.js';
import type { ArticulationDef } from '../../styles/defs/ArticulationDef.js';

/**
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

  constructor();
  constructor(xml: Element);
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
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
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

  articulateNote(note: Element | null): boolean {
    if (note === null) return false;

    let dateChanged = false;
    if (this.articulationDef !== null) dateChanged = this.articulationDef.articulateNote(note);

    const dateAtt = Helper.getAttribute('date.perf', note);
    if (dateAtt !== null) {
      if (this.absoluteDelay !== 0.0) {
        dateAtt.setValue(String(parseFloat(dateAtt.getValue()) + this.absoluteDelay));
        Helper.addToListAttribute(note, 'modified', this.xmlId);
        dateChanged = true;
      }
      if (this.absoluteDelayMs !== 0.0) {
        note.addAttribute(
          new Attribute('articulation.absoluteDelayMs', String(this.absoluteDelayMs)),
        );
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    const durationAtt = Helper.getAttribute('duration.perf', note);
    if (durationAtt !== null) {
      const duration = parseFloat(durationAtt.getValue());
      if (this.absoluteDurationMs !== null) {
        note.addAttribute(
          new Attribute('articulation.absoluteDurationMs', String(this.absoluteDurationMs)),
        );
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      } else {
        if (this.absoluteDuration !== null) {
          durationAtt.setValue(String(this.absoluteDuration));
          Helper.addToListAttribute(note, 'modified', this.xmlId);
        }
        if (this.relativeDuration !== 1.0) {
          durationAtt.setValue(String(duration * this.relativeDuration));
          Helper.addToListAttribute(note, 'modified', this.xmlId);
        }
        if (this.absoluteDurationChange !== 0.0) {
          let durNew = duration + this.absoluteDurationChange;
          for (let reduce = 2.0; durNew >= 0.0; reduce *= 2.0)
            durNew = duration + this.absoluteDurationChange / reduce;
          durationAtt.setValue(String(durNew));
          Helper.addToListAttribute(note, 'modified', this.xmlId);
        }
      }
      if (this.absoluteDurationChangeMs !== 0.0) {
        note.addAttribute(
          new Attribute(
            'articulation.absoluteDurationChangeMs',
            String(this.absoluteDurationChangeMs),
          ),
        );
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    const velocityAtt = Helper.getAttribute('velocity', note);
    if (velocityAtt !== null) {
      if (this.absoluteVelocity !== null) {
        velocityAtt.setValue(String(this.absoluteVelocity));
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      }
      if (this.relativeVelocity !== 1.0) {
        velocityAtt.setValue(String(parseFloat(velocityAtt.getValue()) * this.relativeVelocity));
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      }
      if (this.absoluteVelocityChange !== 0.0) {
        velocityAtt.setValue(
          String(parseFloat(velocityAtt.getValue()) + this.absoluteVelocityChange),
        );
        Helper.addToListAttribute(note, 'modified', this.xmlId);
      }
    }

    if (this.detuneCents !== 0.0) {
      note.addAttribute(new Attribute('detuneCents', String(this.detuneCents)));
      Helper.addToListAttribute(note, 'modified', this.xmlId);
    }
    if (this.detuneHz !== 0.0) {
      note.addAttribute(new Attribute('detuneHz', String(this.detuneHz)));
      Helper.addToListAttribute(note, 'modified', this.xmlId);
    }

    return dateChanged;
  }
}

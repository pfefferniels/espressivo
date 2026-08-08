import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { OrnamentationStyle } from '../../styles/OrnamentationStyle.js';
import type { OrnamentDef } from '../../styles/defs/OrnamentDef.js';

/**
 * Port of meico.mpm.elements.maps.data.OrnamentData
 */
export class OrnamentData {
  xml: Element | null = null;
  xmlId: string | null = null;

  styleName = '';
  style: OrnamentationStyle | null = null;
  ornamentDefName: string | null = null;
  ornamentDef: OrnamentDef | null = null;

  date = 0.0;
  scale = 0.0;
  noteOrder: string[] | null = null;

  constructor();
  constructor(xml: Element);
  constructor(xml?: Element) {
    if (xml === undefined) return;

    this.xml = xml;
    this.date = parseFloat(xml.getAttribute('date')!.getValue());
    this.ornamentDefName = xml.getAttribute('name.ref')!.getValue();

    const scaleAttr = xml.getAttribute('scale');
    if (scaleAttr !== null) this.scale = parseFloat(scaleAttr.getValue());

    const noteOrderAttr = xml.getAttribute('note.order');
    if (noteOrderAttr !== null) {
      const no = noteOrderAttr.getValue().trim();
      this.noteOrder = [];
      if (no === 'ascending pitch' || no === 'descending pitch') this.noteOrder.push(no);
      else this.noteOrder.push(...no.replace(/#/g, '').split(/\s+/));
    }

    const id = xml.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    if (id !== null) this.xmlId = id.getValue();
  }

  clone(): OrnamentData {
    const c = new OrnamentData();
    c.xml = this.xml === null ? null : (this.xml.copy() as Element);
    c.xmlId = this.xmlId;
    c.styleName = this.styleName;
    c.style = this.style;
    c.ornamentDefName = this.ornamentDefName;
    c.ornamentDef = this.ornamentDef;
    c.date = this.date;
    c.scale = this.scale;
    if (this.noteOrder !== null) {
      c.noteOrder = [...this.noteOrder];
    }
    return c;
  }

  apply(chordSequence: Element[][]): Element[][] {
    const chordsToAdd: Element[][] = [];

    if (this.ornamentDef === null) return chordsToAdd;

    const tempChordSequence: Element[][] = [...chordSequence];

    if (this.ornamentDef.getDynamicsGradient() !== null)
      this.ornamentDef.getDynamicsGradient()!.apply(tempChordSequence, this.scale);

    if (this.ornamentDef.getTemporalSpread() !== null)
      this.ornamentDef.getTemporalSpread()!.apply(tempChordSequence);

    return chordsToAdd;
  }
}

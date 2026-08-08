import { Attribute, Element } from '../../../../xml/XomTypes.js';
import type { OrnamentationStyle } from '../../styles/OrnamentationStyle.js';
import type { OrnamentDef } from '../../styles/defs/OrnamentDef.js';

/**
 * All data needed to apply one ornament — a single MPM `<ornament>` element plus the
 * style context only {@link OrnamentationMap} knows.
 *
 * `noteOrder` decides which notes the ornament runs over and in what sequence. It holds
 * either exactly one of the two magic strings `"ascending pitch"` / `"descending pitch"`
 * — meaning "every note at this date, sorted by pitch" — or a list of note IDs naming
 * the notes explicitly. The two cases are distinguished by content, not by type, and
 * the parsing below preserves that: the magic strings are stored as a single-element
 * array, ID lists are stripped of their `#` prefixes and split on whitespace.
 *
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

  /**
   * Apply this ornament's transformers to `chordSequence`. The dynamics gradient runs
   * before the temporal spread, and both mutate the note elements in place — they write
   * `ornament.*` attributes that later passes fold into the real performance attributes
   * (see {@link OrnamentationMap.renderAllNonmillisecondsModifiersToMap} and
   * {@link OrnamentationMap.renderMillisecondsModifiersToMap}).
   *
   * The return value is **always an empty array**, and the Java reference is the same
   * (OrnamentData.java, where a TODO marks the spot). It is the seam for a feature that
   * does not exist yet: ornaments that *generate* notes rather than only modifying
   * existing ones would return them here for the caller to insert into the map. Until
   * that lands, the `for (const chord of od.apply(...))` loop in OrnamentationMap.apply
   * is dead by construction. Do not "simplify" it away — it is the contract, not an
   * oversight.
   *
   * `tempChordSequence` is likewise inherited from the reference and protects nothing:
   * the spread is shallow, so the inner arrays and the Element objects are shared with
   * the caller, and the transformers mutate exactly those.
   */
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

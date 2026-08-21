import { describe, it, expect, vi } from 'vitest';
import { Mei } from '../../src/mei/Mei.js';
import { getAttributeValue } from '../../src/xml/tree.js';
import { Element, Attribute, Builder } from '../../src/xml/XomTypes.js';

/**
 * An empty `Mei` — one whose `isEmpty()` is true — reached through the constructor.
 *
 * There is exactly one route to it: `Builder.build` screens the parsed document for a
 * `<parsererror>` element — browser-`DOMParser` semantics that `@xmldom/xmldom` never
 * produces — so a *well-formed* document containing one is reported as a failed parse and
 * `XmlBase.parseXmlString` leaves `data` null. Every actually malformed source throws
 * instead. Both halves are measured and pinned in `tests/xml/XmlBase.test.ts`, and recorded
 * in PARITY.md as `XB1`.
 */
function emptyMei(): Mei {
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return Mei.fromXml('<parsererror/>');
  } finally {
    errSpy.mockRestore();
  }
}

/** put the given markup into a minimal but complete MEI score, in measure 1 / staff 1 / layer 1 */
function wrap(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
    <section><measure n="1"><staff n="1"><layer n="1">${inner}</layer></staff></measure></section>
  </score></mdiv></body></music>
</mei>`;
}

const SAMPLE_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead>
    <fileDesc>
      <titleStmt><title>Test Piece</title></titleStmt>
      <pubStmt/>
    </fileDesc>
  </meiHead>
  <music>
    <body>
      <mdiv xml:id="mdiv1">
        <score>
          <scoreDef>
            <staffGrp>
              <staffDef n="1" clef.line="2" clef.shape="G" lines="5"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="n1" dur="4" oct="4" pname="c"/>
                  <note xml:id="n2" dur="4" oct="4" pname="d"/>
                  <note xml:id="n3" dur="4" oct="4" pname="e"/>
                  <note xml:id="n4" dur="4" oct="4" pname="f"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;

describe('Mei – construction', () => {
  it('should create a minimal MEI from no-arg constructor', () => {
    const mei = new Mei();
    expect(mei.isEmpty()).toBe(false);
    expect(mei.getRootElement()).not.toBeNull();
    expect(mei.getRootElement()!.getLocalName()).toBe('mei');
  });

  it('should create from XML string', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    expect(mei.isEmpty()).toBe(false);
    expect(mei.getRootElement()!.getLocalName()).toBe('mei');
  });

  it('should create via fromXml static method', () => {
    const mei = Mei.fromXml(SAMPLE_MEI);
    expect(mei.isEmpty()).toBe(false);
  });

  it('should create from a Document', () => {
    const builder = new Builder();
    const doc = builder.build(SAMPLE_MEI);
    const mei = new Mei(doc);
    expect(mei.isEmpty()).toBe(false);
    expect(mei.getRootElement()!.getLocalName()).toBe('mei');
  });
});

describe('Mei – getMeiHead', () => {
  it('should return the meiHead element', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const head = mei.getMeiHead();
    expect(head).not.toBeNull();
    expect(head!.getLocalName()).toBe('meiHead');
  });

  it('should return null for empty MEI', () => {
    // The default `new Mei()` is built from MINIMAL_MEI and therefore does have a meiHead.
    expect(new Mei().getMeiHead()).not.toBeNull();
    expect(emptyMei().getMeiHead()).toBeNull();
  });
});

describe('Mei – getMusic', () => {
  it('should return the music element', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const music = mei.getMusic();
    expect(music).not.toBeNull();
    expect(music!.getLocalName()).toBe('music');
  });

  it('should return null for empty document', () => {
    expect(emptyMei().getMusic()).toBeNull();
  });
});

describe('Mei – getTitle', () => {
  it('should extract the title from titleStmt', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const title = mei.getTitle();
    expect(title).toBe('Test Piece');
  });

  it('should return empty string for default (no-arg) MEI with empty title', () => {
    const mei = new Mei();
    // The default MEI has an empty <title/> element
    const title = mei.getTitle();
    expect(title).toBe('');
  });

  it('should use filename without extension as fallback', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead/>
  <music/>
</mei>`;
    const mei = new Mei(xml, true);
    mei.setFile('/path/to/piece.mei');
    // Java falls back to File.getName(), i.e. the bare file name (Mei.java:161/164)
    const title = mei.getTitle();
    expect(title).toBe('piece');
  });

  it('should keep a plain filename as fallback', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/><music/></mei>`;
    const mei = new Mei(xml, true);
    mei.setFile('piece.mei');
    expect(mei.getTitle()).toBe('piece');
  });

  it('should return an empty string when there is neither a title nor a file', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/><music/></mei>`;
    expect(new Mei(xml, true).getTitle()).toBe('');
  });

  it('should not reach the workList fallback, because the lookup never throws', () => {
    // Java guards the fileDesc lookup with catch(NullPointerException), but
    // firstChildElement returns null for a null parent instead of
    // throwing (Helper.java:83-84), so the workDesc/workList branches are
    // unreachable there as well and the file name fallback wins.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><workList><work><title>Sonata</title></work></workList></meiHead>
  <music/>
</mei>`;
    const mei = new Mei(xml, true);
    expect(mei.getTitle()).toBe('');

    mei.setFile('sonata.mei');
    expect(mei.getTitle()).toBe('sonata');
  });
});

describe('Mei – getAllMdivs', () => {
  it('should find the mdiv element', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const mdivs = mei.getAllMdivs();
    expect(mdivs.length).toBe(1);
    const idAttr = mdivs[0].getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    expect(idAttr).not.toBeNull();
    expect(idAttr!.getValue()).toBe('mdiv1');
  });

  it('should return empty array when no music element', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead/>
</mei>`;
    const mei = new Mei(xml, true);
    expect(mei.getAllMdivs().length).toBe(0);
  });

  it('should find multiple mdivs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music>
    <body>
      <mdiv xml:id="m1"><score><scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef><section><measure/></section></score></mdiv>
      <mdiv xml:id="m2"><score><scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef><section><measure/></section></score></mdiv>
    </body>
  </music>
</mei>`;
    const mei = new Mei(xml, true);
    const mdivs = mei.getAllMdivs();
    expect(mdivs.length).toBe(2);
  });
});

describe('Mei – computeMinimalPPQ', () => {
  it('should compute minimal PPQ from quarter notes', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const ppq = mei.computeMinimalPPQ();
    // All notes are quarter (dur="4"), decimal = 0.25
    // result = 0.25 / 0.25 = 1
    expect(ppq).toBe(1);
  });

  it('should compute higher PPQ for shorter note values', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
          <section>
            <measure>
              <staff n="1"><layer n="1">
                <note dur="16"/>
              </layer></staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;
    const mei = new Mei(xml, true);
    const ppq = mei.computeMinimalPPQ();
    // dur="16" -> decimal = 0.0625
    // result = 0.25 / 0.0625 = 4
    expect(ppq).toBe(4);
  });

  it('should return 0 when no music element', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/></mei>`;
    const mei = new Mei(xml, true);
    expect(mei.computeMinimalPPQ()).toBe(0);
  });
});

describe('Mei – serialization', () => {
  it('writeMei should return XML string', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const xml = mei.writeMei();
    expect(xml).not.toBeNull();
    expect(xml).toContain('mei');
    expect(xml).toContain('Test Piece');
  });

  it('toXML should produce valid XML', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const xml = mei.toXML();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<mei');
  });
});

describe('Mei – static helpers (getStaff, getLayer)', () => {
  it('getStaff should find the staff ancestor in parsed XML', () => {
    // getParent() relies on DOM parentNode, so we need parsed XML
    const xml = '<staff n="1"><layer><note dur="4"/></layer></staff>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();
    const layer = root.getFirstChildElement('layer')!;
    const note = layer.getFirstChildElement('note')!;

    const result = Mei.getStaff(note);
    expect(result).not.toBeNull();
    expect(result!.getLocalName()).toBe('staff');
  });

  it('getStaff should return null when no staff ancestor', () => {
    const orphan = new Element('note');
    expect(Mei.getStaff(orphan)).toBeNull();
  });

  it('getLayer should find the layer ancestor in parsed XML', () => {
    const xml = '<layer n="2"><note dur="4"/></layer>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();
    const note = root.getFirstChildElement('note')!;

    const result = Mei.getLayer(note);
    expect(result).not.toBeNull();
    expect(result!.getLocalName()).toBe('layer');
  });

  it('getStaffId should return n attribute', () => {
    const staff = new Element('staff');
    staff.addAttribute(new Attribute('n', '3'));
    expect(Mei.getStaffId(staff)).toBe('3');
  });

  it('getStaffId should return empty string for null', () => {
    expect(Mei.getStaffId(null)).toBe('');
  });

  it('getLayerId should return n attribute', () => {
    const layer = new Element('layer');
    layer.addAttribute(new Attribute('n', '1'));
    expect(Mei.getLayerId(layer)).toBe('1');
  });

  it('getLayerId should prefer def over n', () => {
    const layer = new Element('layer');
    layer.addAttribute(new Attribute('def', '#staff1'));
    layer.addAttribute(new Attribute('n', '1'));
    expect(Mei.getLayerId(layer)).toBe('#staff1');
  });
});

describe('Mei – getAllVariantEncodings', () => {
  it('should find choice elements', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
          <section>
            <measure>
              <staff n="1"><layer n="1">
                <choice><orig><note dur="4"/></orig><reg><note dur="8"/></reg></choice>
              </layer></staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;
    const mei = new Mei(xml, true);
    const variants = mei.getAllVariantEncodings();
    expect(variants.size()).toBeGreaterThanOrEqual(1);
  });

  it('should find app elements as well', () => {
    const inner = `<app><lem><note dur="4"/></lem><rdg><note dur="8"/></rdg></app>`;
    const mei = new Mei(wrap(inner), true);
    expect(mei.getAllVariantEncodings().size()).toBe(1);
  });

  it('should return an empty result when there is no variant encoding', () => {
    const mei = new Mei(wrap('<note dur="4"/>'), true);
    expect(mei.getAllVariantEncodings().size()).toBe(0);
  });
});

describe('Mei – addIds', () => {
  it('should give every id-worthy element an xml:id and report how many', () => {
    const mei = new Mei(wrap('<note dur="4"/><rest dur="4"/><chord><note dur="8"/></chord>'), true);

    const added = mei.addIds();

    // measure, section, mdiv, 2 notes, 1 rest, 1 chord
    expect(added).toBe(7);
    const root = mei.getRootElement()!;
    expect(root.query("descendant::*[local-name()='note' and @xml:id]").size()).toBe(2);
    expect(root.query("descendant::*[local-name()='chord' and @xml:id]").size()).toBe(1);
  });

  it('should generate ids with the meico prefix', () => {
    const mei = new Mei(wrap('<note dur="4"/>'), true);
    mei.addIds();

    const note = mei
      .getRootElement()!
      .query("descendant::*[local-name()='note']")
      .get(0) as unknown as Element;
    expect(note.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toMatch(
      /^meico_/,
    );
  });

  it('should leave existing ids alone', () => {
    const mei = new Mei(wrap('<note xml:id="keepme" dur="4"/><note dur="4"/>'), true);

    const added = mei.addIds();
    const notes = mei.getRootElement()!.query("descendant::*[local-name()='note']");
    const first = notes.get(0) as unknown as Element;

    expect(first.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
      'keepme',
    );
    // measure, section, mdiv and the second note
    expect(added).toBe(4);
  });

  it('should not touch elements outside the id-worthy set', () => {
    const mei = new Mei(wrap('<note dur="4"/>'), true);
    mei.addIds();

    const layer = mei
      .getRootElement()!
      .query("descendant::*[local-name()='layer']")
      .get(0) as unknown as Element;
    expect(layer.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
  });

  it('should return 0 when there is no root element', () => {
    // `emptyMei()` installs and restores a spy of its own, so it has to finish before this
    // one is installed — nesting them makes the inner `mockRestore` undo the outer spy.
    const empty = emptyMei();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(empty.addIds()).toBe(0);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe('Mei – removeRendElements', () => {
  it('should replace a rend element by its text content', () => {
    const mei = new Mei(wrap('<dir><rend fontweight="bold">forte</rend></dir>'), true);

    (mei as unknown as { removeRendElements(): void }).removeRendElements();

    const music = mei.getMusic()!;
    expect(music.query("descendant::*[local-name()='rend']").size()).toBe(0);
    const dir = music.query("descendant::*[local-name()='dir']").get(0) as unknown as Element;
    expect(dir.getValue()).toContain('forte');
  });

  it('should handle several rends and nested content', () => {
    const mei = new Mei(wrap('<dir><rend>a</rend><rend>b</rend></dir>'), true);

    (mei as unknown as { removeRendElements(): void }).removeRendElements();

    const dir = mei
      .getMusic()!
      .query("descendant::*[local-name()='dir']")
      .get(0) as unknown as Element;
    expect(dir.getValue()).toContain('a');
    expect(dir.getValue()).toContain('b');
  });

  it('should do nothing when there is no music element', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/></mei>`;
    const mei = new Mei(xml, true);

    expect(() =>
      (mei as unknown as { removeRendElements(): void }).removeRendElements(),
    ).not.toThrow();
  });
});

describe('Mei – resolveCopyofs', () => {
  it('should replace a copyof placeholder by a copy of its target', () => {
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="4" pname="c" oct="4"/><note xml:id="n2" copyof="#n1"/>'),
      true,
    );

    const notResolved = mei.resolveCopyofs();

    expect(notResolved).toEqual([]);
    const notes = mei.getMusic()!.query("descendant::*[local-name()='note']");
    expect(notes.size()).toBe(2);
    const second = notes.get(1) as unknown as Element;
    expect(second.getAttributeValue('pname')).toBe('c');
    expect(second.getAttributeValue('dur')).toBe('4');
  });

  it('should keep the placeholder id on the inserted copy', () => {
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="4" pname="c"/><note xml:id="n2" copyof="#n1"/>'),
      true,
    );

    mei.resolveCopyofs();

    const second = mei
      .getMusic()!
      .query("descendant::*[local-name()='note']")
      .get(1) as unknown as Element;
    expect(second.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
      'n2',
    );
  });

  it('should resolve sameas just like copyof', () => {
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="8" pname="d"/><note xml:id="n2" sameas="#n1"/>'),
      true,
    );

    mei.resolveCopyofs();

    const second = mei
      .getMusic()!
      .query("descendant::*[local-name()='note']")
      .get(1) as unknown as Element;
    expect(second.getAttributeValue('pname')).toBe('d');
  });

  it('should report and drop a placeholder whose target does not exist', () => {
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="4"/><note xml:id="n2" copyof="#missing"/>'),
      true,
    );

    const notResolved = mei.resolveCopyofs()!;

    expect(notResolved.length).toBe(1);
    expect(notResolved[0]).toContain('copyof');
    expect(mei.getMusic()!.query("descendant::*[local-name()='note']").size()).toBe(1);
  });

  it('should detect a circular reference and give up', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mei = new Mei(
      wrap('<note xml:id="n1" copyof="#n2"/><note xml:id="n2" copyof="#n1"/>'),
      true,
    );

    const notResolved = mei.resolveCopyofs()!;

    expect(notResolved.length).toBeGreaterThan(0);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('should give the copied descendants fresh ids', () => {
    const mei = new Mei(
      wrap(
        '<chord xml:id="c1"><note xml:id="n1" dur="4"/></chord><chord xml:id="c2" copyof="#c1"/>',
      ),
      true,
    );

    mei.resolveCopyofs();

    const ids = mei.getMusic()!.query("descendant::*[local-name()='note']");
    const original = (ids.get(0) as unknown as Element)
      .getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!
      .getValue();
    const copied = (ids.get(1) as unknown as Element)
      .getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!
      .getValue();

    expect(copied).not.toBe(original);
    expect(copied).toContain('_meico_');
  });

  it('resolveCopyofsAndSameas should be the same operation', () => {
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="4" pname="e"/><note xml:id="n2" copyof="#n1"/>'),
      true,
    );

    expect(mei.resolveCopyofsAndSameas()).toEqual([]);
    const second = mei
      .getMusic()!
      .query("descendant::*[local-name()='note']")
      .get(1) as unknown as Element;
    expect(second.getAttributeValue('pname')).toBe('e');
  });

  it('should return null when there is no root element', () => {
    expect(emptyMei().resolveCopyofs()).toBeNull();
  });
});

describe('Mei – resolveExpansions', () => {
  const withExpansion = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
    <section xml:id="top">
      <expansion plist="#a #b #a"/>
      <section xml:id="a"><measure n="1"/></section>
      <section xml:id="b"><measure n="2"/></section>
    </section>
  </score></mdiv></body></music>
</mei>`;

  it('should drop the expansion element itself', () => {
    const mei = new Mei(withExpansion, true);

    mei.resolveExpansions();

    expect(mei.getMusic()!.query("descendant::*[local-name()='expansion']").size()).toBe(0);
  });

  const sectionOrder = (mei: Mei): string[] => {
    const top = mei
      .getMusic()!
      .query("descendant::*[local-name()='section' and @xml:id='top']")
      .get(0) as unknown as Element;
    const order: string[] = [];
    const children = top.getChildElements();
    for (let i = 0; i < children.size(); ++i) {
      order.push(getAttributeValue('id', children.get(i)));
    }
    return order;
  };

  it('should lay the sections out in the order the plist prescribes', () => {
    const mei = new Mei(withExpansion.replace('plist="#a #b #a"', 'plist="#b #a"'), true);

    mei.resolveExpansions();

    expect(sectionOrder(mei)).toEqual(['b', 'a']);
  });

  it('should currently move rather than copy a section the plist repeats', () => {
    // Java relies on XOM throwing MultipleParentException when a node that still
    // has a parent is appended, and only then makes the copy with fresh ids
    // (Mei.java, resolveExpansions). XomTypes.appendChild re-parents silently
    // instead, so the repeat moves the section rather than duplicating it.
    const mei = new Mei(withExpansion, true);

    mei.resolveExpansions();

    expect(sectionOrder(mei)).toEqual(['b', 'a']);
  });

  it('should leave a score without expansions untouched', () => {
    const mei = new Mei(SAMPLE_MEI, true);

    mei.resolveExpansions();

    expect(mei.getMusic()!.query("descendant::*[local-name()='note']").size()).toBe(4);
  });

  it('should drop siblings that the plist does not mention', () => {
    const xml = withExpansion.replace('plist="#a #b #a"', 'plist="#b"');
    const mei = new Mei(xml, true);

    mei.resolveExpansions();

    expect(
      mei.getMusic()!.query("descendant::*[local-name()='section' and @xml:id='a']").size(),
    ).toBe(0);
    expect(
      mei.getMusic()!.query("descendant::*[local-name()='section' and @xml:id='b']").size(),
    ).toBe(1);
  });
});

describe('Mei – staff and layer identification', () => {
  it('getStaffId should prefer def over n', () => {
    const staff = new Element('staff');
    staff.addAttribute(new Attribute('def', '#s1'));
    staff.addAttribute(new Attribute('n', '1'));
    expect(Mei.getStaffId(staff)).toBe('#s1');
  });

  it('getStaffId should return an empty string for an element that is no staff', () => {
    expect(Mei.getStaffId(new Element('layer'))).toBe('');
  });

  it('getStaffId should return an empty string for a staff without def and n', () => {
    expect(Mei.getStaffId(new Element('staff'))).toBe('');
  });

  it('getLayerId should return an empty string for an element that is no layer', () => {
    expect(Mei.getLayerId(new Element('staff'))).toBe('');
  });

  it('getLayerId should return an empty string for a layer without def and n', () => {
    expect(Mei.getLayerId(new Element('layer'))).toBe('');
  });

  it('getLayerId should return an empty string for null', () => {
    expect(Mei.getLayerId(null)).toBe('');
  });

  it('getLayer should return null when there is no layer ancestor', () => {
    const xml = '<staff n="1"><note dur="4"/></staff>';
    const doc = new Builder().build(xml);
    const note = doc.getRootElement().getFirstChildElement('note')!;
    expect(Mei.getLayer(note)).toBeNull();
  });
});

describe('Mei – the export entry points', () => {
  // Java converts right here (Mei.java exportMsm/exportMsmMpm). The port defers the import
  // of the converter to dodge the Mei <-> Mei2MsmMpmConverter cycle, but does so with
  // require(), which does not exist in this ESM package, so every caller has to build the
  // converter itself, as tests/integration does. These tests pin that limitation, not a
  // contract.
  it('exportMsmMpm cannot load the converter in this ESM build', () => {
    expect(() => new Mei(SAMPLE_MEI, true).exportMsmMpm()).toThrow(/Mei2MsmMpmConverter/);
  });

  it('exportMsm fails for the same reason, it delegates to exportMsmMpm', () => {
    expect(() => new Mei(SAMPLE_MEI, true).exportMsm()).toThrow(/Mei2MsmMpmConverter/);
  });
});

/** build a score whose section contains exactly `sectionInner` */
function score(scoreDefInner: string, sectionInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body><mdiv><score>
    ${scoreDefInner}
    <section>${sectionInner}</section>
  </score></mdiv></body></music>
</mei>`;
}

/** the @n of every staff in document order */
function staffNs(mei: Mei): string[] {
  const staffs = mei.getRootElement()!.query("descendant::*[local-name()='staff']");
  return staffs.toArray().map((s) => (s as unknown as Element).getAttributeValue('n') ?? '');
}

/** the @n of every staffDef in document order */
function staffDefNs(mei: Mei): string[] {
  const defs = mei.getRootElement()!.query("descendant::*[local-name()='staffDef']");
  return defs.toArray().map((d) => (d as unknown as Element).getAttributeValue('n') ?? '');
}

describe('Mei.layersToStaffs – one staff per layer', () => {
  const TWO_LAYERS = score(
    '<scoreDef><staffGrp><staffDef n="1" lines="5" clef.shape="G" label="Piano"/></staffGrp></scoreDef>',
    `<measure n="1"><staff n="1">
       <layer n="1"><note xml:id="a" pname="c" oct="4" dur="4"/></layer>
       <layer n="2"><note xml:id="b" pname="e" oct="3" dur="4"/></layer>
     </staff></measure>`,
  );

  it('replaces one two-layer staff by two staffs numbered staff@n + layer@n', () => {
    const mei = new Mei(TWO_LAYERS, true);
    mei.layersToStaffs();
    expect(staffNs(mei)).toEqual(['11', '12']);
  });

  it('renumbers each moved layer to @n="1", since its new staff holds only it', () => {
    const mei = new Mei(TWO_LAYERS, true);
    mei.layersToStaffs();
    const layers = mei.getRootElement()!.query("descendant::*[local-name()='layer']");
    expect(layers.toArray().map((l) => (l as unknown as Element).getAttributeValue('n'))).toEqual([
      '1',
      '1',
    ]);
    // and the notes travelled with their layer
    expect(
      layers
        .toArray()
        .map((l) =>
          ((l as unknown as Element).getChildElements().get(0) as Element).getAttributeValue(
            'xml:id',
          ),
        ),
    ).toEqual(['a', 'b']);
  });

  it('regenerates one staffDef per new staff, carrying the original attributes over', () => {
    const mei = new Mei(TWO_LAYERS, true);
    mei.layersToStaffs();
    expect(staffDefNs(mei)).toEqual(['11', '12']);

    const defs = mei.getRootElement()!.query("descendant::*[local-name()='staffDef']");
    for (const d of defs.toArray()) {
      const def = d as unknown as Element;
      expect(def.getAttributeValue('lines')).toBe('5');
      expect(def.getAttributeValue('clef.shape')).toBe('G');
      expect(def.getAttributeValue('label')).toBe('Piano');
    }
  });

  it('keeps the new staffDefs inside the original staffGrp', () => {
    const mei = new Mei(TWO_LAYERS, true);
    mei.layersToStaffs();
    const grp = mei.getRootElement()!.query("descendant::*[local-name()='staffGrp']").get(0);
    expect((grp as unknown as Element).getChildElements().size()).toBe(2);
  });

  it('inserts the new staffs where the original stood, not at the end of the measure', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>',
        `<measure n="1">
           <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
           <dir tstamp="1">after</dir>
         </measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    const measure = mei.getRootElement()!.query("descendant::*[local-name()='measure']").get(0);
    const kids = (measure as unknown as Element).getChildElements();
    expect([kids.get(0).getLocalName(), kids.get(1).getLocalName()]).toEqual(['staff', 'dir']);
  });

  it('orders the new staffDefs by @n numerically, not by the order the layers were met', () => {
    // layer 10 is visited before layer 9, but staffDef 110 must still follow staffDef 19
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>',
        `<measure n="1"><staff n="1">
           <layer n="10"><note pname="c" oct="4" dur="4"/></layer>
           <layer n="9"><note pname="e" oct="4" dur="4"/></layer>
         </staff></measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    expect(staffNs(mei)).toEqual(['110', '19']); // document order follows the layers
    expect(staffDefNs(mei)).toEqual(['19', '110']); // staffDefs are sorted numerically
  });

  it('synthesises @n for an unnumbered layer from its index, and 1000000 for an unnumbered staff', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp/></scoreDef>',
        `<measure n="1"><staff>
           <layer><note pname="c" oct="4" dur="4"/></layer>
           <layer><note pname="e" oct="4" dur="4"/></layer>
         </staff></measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    // staff "1000000" + layer "0" / "1000000"
    expect(staffNs(mei)).toEqual(['10000000', '10000001000000']);
  });

  it('mints an empty staffDef when the original staff had none', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp/></scoreDef>',
        '<measure n="1"><staff n="3"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure>',
      ),
      true,
    );
    mei.layersToStaffs();
    expect(staffDefNs(mei)).toEqual(['31']);
  });

  it('creates a scoreDef and appends it to the score when there was none', () => {
    const mei = new Mei(
      score(
        '',
        '<measure n="1"><staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff></measure>',
      ),
      true,
    );
    mei.layersToStaffs();
    const scoreEl = mei.getRootElement()!.query("descendant::*[local-name()='score']").get(0);
    const kids = (scoreEl as unknown as Element).getChildElements();
    expect(kids.get(kids.size() - 1).getLocalName()).toBe('scoreDef');
    expect(staffDefNs(mei)).toEqual(['11']);
  });

  it('processes each mdiv separately', () => {
    const mei = new Mei(
      `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body>
    <mdiv><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section><measure n="1"><staff n="1">
        <layer n="1"><note pname="c" oct="4" dur="4"/></layer>
        <layer n="2"><note pname="e" oct="4" dur="4"/></layer>
      </staff></measure></section>
    </score></mdiv>
    <mdiv><score>
      <scoreDef><staffGrp><staffDef n="2" lines="5"/></staffGrp></scoreDef>
      <section><measure n="1"><staff n="2">
        <layer n="1"><note pname="g" oct="4" dur="4"/></layer>
      </staff></measure></section>
    </score></mdiv>
  </body></music>
</mei>`,
      true,
    );
    mei.layersToStaffs();
    expect(staffNs(mei)).toEqual(['11', '12', '21']);
    expect(staffDefNs(mei)).toEqual(['11', '12', '21']);
  });

  it('is a no-op on a score whose staffs already hold a single layer, apart from renumbering', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp><staffDef n="1" lines="5"/><staffDef n="2" lines="5"/></staffGrp></scoreDef>',
        `<measure n="1">
           <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
           <staff n="2"><layer n="1"><note pname="e" oct="3" dur="4"/></layer></staff>
         </measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    expect(staffNs(mei)).toEqual(['11', '21']);
    expect(staffDefNs(mei)).toEqual(['11', '21']);
  });

  it('gives the staffDef copies fresh xml:ids so the document holds no id twice', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp><staffDef xml:id="sd1" n="1" lines="5"/></staffGrp></scoreDef>',
        `<measure n="1"><staff n="1">
           <layer n="1"><note pname="c" oct="4" dur="4"/></layer>
           <layer n="2"><note pname="e" oct="4" dur="4"/></layer>
         </staff></measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    const ids = mei
      .getRootElement()!
      .query("descendant::*[local-name()='staffDef']")
      .toArray()
      .map((d) => (d as unknown as Element).getAttributeValue('id')!);
    expect(ids[0]).toBe('sd1'); // the first occurrence keeps the original id
    expect(ids[1]).toMatch(/^meico_/); // the duplicate is reassigned
    expect(new Set(ids).size).toBe(2);
  });

  it('returns, per mdiv, where each generated staff came from', () => {
    const mei = new Mei(TWO_LAYERS, true);
    const provenance = mei.layersToStaffs();

    expect(provenance).toHaveLength(1);
    expect([...provenance[0].keys()]).toEqual(['11', '12']);
    expect(provenance[0].get('11')).toEqual({ origStaff: '1', origLayer: '1' });
    expect(provenance[0].get('12')).toEqual({ origStaff: '1', origLayer: '2' });
  });

  it('reports the synthetic @n it substituted, so origStaff + origLayer rebuilds the key', () => {
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp/></scoreDef>',
        `<measure n="1"><staff>
           <layer><note pname="c" oct="4" dur="4"/></layer>
           <layer><note pname="e" oct="4" dur="4"/></layer>
         </staff></measure>`,
      ),
      true,
    );
    const [map] = mei.layersToStaffs();
    for (const [newStaffN, origin] of map) {
      expect(origin.origStaff + origin.origLayer).toBe(newStaffN);
    }
    expect(map.get('10000000')).toEqual({ origStaff: '1000000', origLayer: '0' });
  });

  it('keeps the maps per mdiv rather than merging, and stays aligned with getAllMdivs()', () => {
    const mei = new Mei(
      `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <meiHead><fileDesc><titleStmt><title/></titleStmt><pubStmt/></fileDesc></meiHead>
  <music><body>
    <mdiv><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section><measure n="1"><staff n="1">
        <layer n="1"><note pname="c" oct="4" dur="4"/></layer>
      </staff></measure></section>
    </score></mdiv>
    <mdiv><score>
      <scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>
      <section><measure n="1"><staff n="1">
        <layer n="1"><note pname="g" oct="4" dur="4"/></layer>
      </staff></measure></section>
    </score></mdiv>
  </body></music>
</mei>`,
      true,
    );
    const provenance = mei.layersToStaffs();
    // both movements produce a staff "11"; merged, one would have hidden the other
    expect(provenance).toHaveLength(mei.getAllMdivs().length);
    expect(provenance[0].get('11')).toEqual({ origStaff: '1', origLayer: '1' });
    expect(provenance[1].get('11')).toEqual({ origStaff: '1', origLayer: '1' });
  });

  it('drops an oStaff that holds only oLayer children – reproduced upstream behaviour', () => {
    // layersToStaffs matches oStaff but moves only `layer` children, and detaches the
    // original unconditionally. PARITY.md §4 records this.
    const mei = new Mei(
      score(
        '<scoreDef><staffGrp><staffDef n="1" lines="5"/></staffGrp></scoreDef>',
        `<measure n="1">
           <staff n="1"><layer n="1"><note pname="c" oct="4" dur="4"/></layer></staff>
           <oStaff n="1"><oLayer n="1"><note pname="d" oct="4" dur="4"/></oLayer></oStaff>
         </measure>`,
      ),
      true,
    );
    mei.layersToStaffs();
    expect(mei.getRootElement()!.query("descendant::*[local-name()='oStaff']").size()).toBe(0);
    expect(staffNs(mei)).toEqual(['11']);
  });
});

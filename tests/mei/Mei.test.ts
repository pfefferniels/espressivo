import { describe, it, expect, vi } from 'vitest';
import { Mei } from '../../src/mei/Mei.js';
import { Helper } from '../../src/mei/Helper.js';
import { Document, Element, Attribute, Builder } from '../../src/xml/XomTypes.js';

/** put the given markup into a minimal but complete MEI score, inside measure 1 / staff 1 / layer 1 */
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

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// getMeiHead
// ---------------------------------------------------------------------------
describe('Mei – getMeiHead', () => {
  it('should return the meiHead element', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const head = mei.getMeiHead();
    expect(head).not.toBeNull();
    expect(head!.getLocalName()).toBe('meiHead');
  });

  it('should return null for empty MEI', () => {
    const mei = new Mei();
    // Default MEI has a meiHead, but let's test with a truly empty one
    // We can construct an empty XmlBase via the base class
    const emptyMei = Object.create(Mei.prototype);
    emptyMei['data'] = null;
    expect(emptyMei.getMeiHead()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMusic
// ---------------------------------------------------------------------------
describe('Mei – getMusic', () => {
  it('should return the music element', () => {
    const mei = new Mei(SAMPLE_MEI, true);
    const music = mei.getMusic();
    expect(music).not.toBeNull();
    expect(music!.getLocalName()).toBe('music');
  });

  it('should return null for empty document', () => {
    const emptyMei = Object.create(Mei.prototype);
    emptyMei['data'] = null;
    expect(emptyMei.getMusic()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTitle
// ---------------------------------------------------------------------------
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
    // Create MEI with no readable title structure
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
    // Helper.getFirstChildElement returns null for a null parent instead of
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

// ---------------------------------------------------------------------------
// getAllMdivs
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// computeMinimalPPQ
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// writeMei / toXML
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mei.getStaff / Mei.getLayer (static)
// ---------------------------------------------------------------------------
describe('Mei – static helpers (getStaff, getLayer)', () => {
  it('getStaff should find the staff ancestor in parsed XML', () => {
    // getParent() relies on DOM parentNode, so we need parsed XML
    const xml = '<staff n="1"><layer><note dur="4"/></layer></staff>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();
    // Navigate to the note element
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

// ---------------------------------------------------------------------------
// getAllVariantEncodings
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// addIds
// ---------------------------------------------------------------------------
describe('Mei – addIds', () => {
  it('should give every id-worthy element an xml:id and report how many', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<note dur="4"/><rest dur="4"/><chord><note dur="8"/></chord>'), true);

    const added = mei.addIds();

    // measure, section, mdiv, 2 notes, 1 rest, 1 chord
    expect(added).toBe(7);
    const root = mei.getRootElement()!;
    expect(root.query("descendant::*[local-name()='note' and @xml:id]").size()).toBe(2);
    expect(root.query("descendant::*[local-name()='chord' and @xml:id]").size()).toBe(1);
    logSpy.mockRestore();
  });

  it('should generate ids with the meico prefix', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<note dur="4"/>'), true);
    mei.addIds();

    const note = mei
      .getRootElement()!
      .query("descendant::*[local-name()='note']")
      .get(0) as unknown as Element;
    expect(note.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toMatch(
      /^meico_/,
    );
    logSpy.mockRestore();
  });

  it('should leave existing ids alone', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<note xml:id="keepme" dur="4"/><note dur="4"/>'), true);

    const added = mei.addIds();
    const notes = mei.getRootElement()!.query("descendant::*[local-name()='note']");
    const first = notes.get(0) as unknown as Element;

    expect(first.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.getValue()).toBe(
      'keepme',
    );
    // measure, section, mdiv and the second note
    expect(added).toBe(4);
    logSpy.mockRestore();
  });

  it('should not touch elements outside the id-worthy set', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<note dur="4"/>'), true);
    mei.addIds();

    const layer = mei
      .getRootElement()!
      .query("descendant::*[local-name()='layer']")
      .get(0) as unknown as Element;
    expect(layer.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    logSpy.mockRestore();
  });

  it('should return 0 when there is no root element', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const empty = Object.create(Mei.prototype);
    empty['data'] = null;

    expect(empty.addIds()).toBe(0);
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// removeRendElements
// ---------------------------------------------------------------------------
describe('Mei – removeRendElements', () => {
  it('should replace a rend element by its text content', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<dir><rend fontweight="bold">forte</rend></dir>'), true);

    (mei as unknown as { removeRendElements(): void }).removeRendElements();

    const music = mei.getMusic()!;
    expect(music.query("descendant::*[local-name()='rend']").size()).toBe(0);
    const dir = music.query("descendant::*[local-name()='dir']").get(0) as unknown as Element;
    expect(dir.getValue()).toContain('forte');
    logSpy.mockRestore();
  });

  it('should handle several rends and nested content', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(wrap('<dir><rend>a</rend><rend>b</rend></dir>'), true);

    (mei as unknown as { removeRendElements(): void }).removeRendElements();

    const dir = mei
      .getMusic()!
      .query("descendant::*[local-name()='dir']")
      .get(0) as unknown as Element;
    expect(dir.getValue()).toContain('a');
    expect(dir.getValue()).toContain('b');
    logSpy.mockRestore();
  });

  it('should do nothing when there is no music element', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/></mei>`;
    const mei = new Mei(xml, true);

    expect(() =>
      (mei as unknown as { removeRendElements(): void }).removeRendElements(),
    ).not.toThrow();
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// resolveCopyofs
// ---------------------------------------------------------------------------
describe('Mei – resolveCopyofs', () => {
  it('should replace a copyof placeholder by a copy of its target', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    logSpy.mockRestore();
  });

  it('should keep the placeholder id on the inserted copy', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    logSpy.mockRestore();
  });

  it('should resolve sameas just like copyof', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    logSpy.mockRestore();
  });

  it('should report and drop a placeholder whose target does not exist', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(
      wrap('<note xml:id="n1" dur="4"/><note xml:id="n2" copyof="#missing"/>'),
      true,
    );

    const notResolved = mei.resolveCopyofs()!;

    expect(notResolved.length).toBe(1);
    expect(notResolved[0]).toContain('copyof');
    expect(mei.getMusic()!.query("descendant::*[local-name()='note']").size()).toBe(1);
    logSpy.mockRestore();
  });

  it('should detect a circular reference and give up', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mei = new Mei(
      wrap('<note xml:id="n1" copyof="#n2"/><note xml:id="n2" copyof="#n1"/>'),
      true,
    );

    const notResolved = mei.resolveCopyofs()!;

    expect(notResolved.length).toBeGreaterThan(0);
    expect(errSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('should give the copied descendants fresh ids', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    logSpy.mockRestore();
  });

  it('resolveCopyofsAndSameas should be the same operation', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    logSpy.mockRestore();
  });

  it('should return null when there is no root element', () => {
    const empty = Object.create(Mei.prototype);
    empty['data'] = null;
    expect(empty.resolveCopyofs()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveExpansions
// ---------------------------------------------------------------------------
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
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(withExpansion, true);

    mei.resolveExpansions();

    expect(mei.getMusic()!.query("descendant::*[local-name()='expansion']").size()).toBe(0);
    logSpy.mockRestore();
  });

  const sectionOrder = (mei: Mei): string[] => {
    const top = mei
      .getMusic()!
      .query("descendant::*[local-name()='section' and @xml:id='top']")
      .get(0) as unknown as Element;
    const order: string[] = [];
    const children = top.getChildElements();
    for (let i = 0; i < children.size(); ++i) {
      order.push(Helper.getAttributeValue('id', children.get(i)));
    }
    return order;
  };

  it('should lay the sections out in the order the plist prescribes', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(withExpansion.replace('plist="#a #b #a"', 'plist="#b #a"'), true);

    mei.resolveExpansions();

    expect(sectionOrder(mei)).toEqual(['b', 'a']);
    logSpy.mockRestore();
  });

  it('should currently move rather than copy a section the plist repeats', () => {
    // Java relies on XOM throwing MultipleParentException when a node that still
    // has a parent is appended, and only then makes the copy with fresh ids
    // (Mei.java, resolveExpansions). XomTypes.appendChild re-parents silently
    // instead, so the repeat moves the section rather than duplicating it.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(withExpansion, true);

    mei.resolveExpansions();

    expect(sectionOrder(mei)).toEqual(['b', 'a']);
    logSpy.mockRestore();
  });

  it('should leave a score without expansions untouched', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const mei = new Mei(SAMPLE_MEI, true);

    mei.resolveExpansions();

    expect(mei.getMusic()!.query("descendant::*[local-name()='note']").size()).toBe(4);
    logSpy.mockRestore();
  });

  it('should drop siblings that the plist does not mention', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const xml = withExpansion.replace('plist="#a #b #a"', 'plist="#b"');
    const mei = new Mei(xml, true);

    mei.resolveExpansions();

    expect(
      mei.getMusic()!.query("descendant::*[local-name()='section' and @xml:id='a']").size(),
    ).toBe(0);
    expect(
      mei.getMusic()!.query("descendant::*[local-name()='section' and @xml:id='b']").size(),
    ).toBe(1);
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// getStaffId / getLayerId / getStaff / getLayer – remaining branches
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// exportMsm / exportMsmMpm
// ---------------------------------------------------------------------------
describe('Mei – the export entry points', () => {
  // Java converts right here (Mei.java exportMsm/exportMsmMpm). The port defers the
  // import of the converter to dodge the Mei <-> Mei2MsmMpmConverter cycle, but it
  // does so with require(), which does not exist in this ESM package. Every caller
  // therefore has to build the converter itself, as tests/integration does.
  // These tests pin that limitation; they should be replaced once the import is fixed.
  it('exportMsmMpm cannot load the converter in this ESM build', () => {
    expect(() => new Mei(SAMPLE_MEI, true).exportMsmMpm()).toThrow(/Mei2MsmMpmConverter/);
  });

  it('exportMsm fails for the same reason, it delegates to exportMsmMpm', () => {
    expect(() => new Mei(SAMPLE_MEI, true).exportMsm()).toThrow(/Mei2MsmMpmConverter/);
  });

  it('exportMusicXml cannot load its converter either', () => {
    expect(() => new Mei(SAMPLE_MEI, true).exportMusicXml()).toThrow(/Mei2MusicXmlConverter/);
  });
});

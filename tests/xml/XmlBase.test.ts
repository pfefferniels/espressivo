import { describe, it, expect } from 'vitest';
import { XmlBase } from '../../src/xml/XmlBase.js';
import { Document, Element, Attribute, Builder } from '../../src/xml/XomTypes.js';

const SIMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <child name="a"/>
  <child name="b"/>
  <child name="c"/>
</root>`;

const XML_WITH_ATTRS = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <item color="red"/>
  <item color="blue"/>
  <nested>
    <item color="green"/>
  </nested>
</root>`;

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------
describe('XmlBase – construction', () => {
  it('should create an empty instance (no args)', () => {
    const xb = new XmlBase();
    expect(xb.isEmpty()).toBe(true);
    expect(xb.getDocument()).toBeNull();
    expect(xb.getRootElement()).toBeNull();
    expect(xb.getFile()).toBeNull();
  });

  it('should create from a Document', () => {
    const root = new Element('myroot');
    const doc = new Document(root);
    const xb = new XmlBase(doc);
    expect(xb.isEmpty()).toBe(false);
    expect(xb.getRootElement()!.getLocalName()).toBe('myroot');
  });

  it('should create from an XML string', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    expect(xb.isEmpty()).toBe(false);
    expect(xb.getRootElement()!.getLocalName()).toBe('root');
  });
});

// ---------------------------------------------------------------------------
// Basic getters
// ---------------------------------------------------------------------------
describe('XmlBase – getters', () => {
  it('getRootElement() should return the root', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const root = xb.getRootElement();
    expect(root).not.toBeNull();
    expect(root!.getLocalName()).toBe('root');
  });

  it('toXML() should return the serialized XML', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const xml = xb.toXML();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<root');
    expect(xml).toContain('child');
  });

  it('toXML() should return empty string when empty', () => {
    const xb = new XmlBase();
    expect(xb.toXML()).toBe('');
  });

  it('isEmpty() should return true for default instance', () => {
    expect(new XmlBase().isEmpty()).toBe(true);
  });

  it('isEmpty() should return false after parsing XML', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    expect(xb.isEmpty()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// File property
// ---------------------------------------------------------------------------
describe('XmlBase – file property', () => {
  it('should default to null', () => {
    const xb = new XmlBase();
    expect(xb.getFile()).toBeNull();
  });

  it('should set and get file', () => {
    const xb = new XmlBase();
    xb.setFile('/tmp/test.xml');
    expect(xb.getFile()).toBe('/tmp/test.xml');
  });
});

// ---------------------------------------------------------------------------
// setDocument
// ---------------------------------------------------------------------------
describe('XmlBase – setDocument', () => {
  it('should replace the internal document', () => {
    const xb = new XmlBase();
    expect(xb.isEmpty()).toBe(true);
    const doc = new Document(new Element('newroot'));
    xb.setDocument(doc);
    expect(xb.isEmpty()).toBe(false);
    expect(xb.getRootElement()!.getLocalName()).toBe('newroot');
  });
});

// ---------------------------------------------------------------------------
// removeAllElements
// ---------------------------------------------------------------------------
describe('XmlBase – removeAllElements', () => {
  it('should find matching elements and report the count', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const count = xb.removeAllElements('child');
    // The method finds 3 child elements
    expect(count).toBe(3);
  });

  it('should return 0 when no elements match', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const count = xb.removeAllElements('nonexistent');
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// removeAllAttributes
// ---------------------------------------------------------------------------
describe('XmlBase – removeAllAttributes', () => {
  it('should remove the named attribute from all elements that have it', () => {
    const xb = new XmlBase(XML_WITH_ATTRS, true);
    const count = xb.removeAllAttributes('color');
    expect(count).toBe(3);
    // The elements themselves should still exist
    const xml = xb.toXML();
    expect(xml).toContain('item');
    expect(xml).not.toContain('color');
  });

  it('should return 0 when no elements have that attribute', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const count = xb.removeAllAttributes('nonexistent');
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// exportXml
// ---------------------------------------------------------------------------
describe('XmlBase – exportXml', () => {
  it('should return XML string when data is present', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    const result = xb.exportXml();
    expect(result).not.toBeNull();
    expect(result).toContain('<root');
  });

  it('should return null when empty', () => {
    const xb = new XmlBase();
    expect(xb.exportXml()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validate (stub)
// ---------------------------------------------------------------------------
describe('XmlBase – validate', () => {
  it('should report no-data when empty', () => {
    const xb = new XmlBase();
    expect(xb.validate()).toEqual({ validated: false, reason: 'no-data' });
  });

  it('should report not-implemented when data present', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    expect(xb.validate()).toEqual({ validated: false, reason: 'not-implemented' });
  });
});

// ---------------------------------------------------------------------------
// isValid
// ---------------------------------------------------------------------------
describe('XmlBase – isValid', () => {
  it('should default to false', () => {
    const xb = new XmlBase();
    expect(xb.isValid()).toBe(false);
  });

  it('should be false after parsing (no schema validation)', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    expect(xb.isValid()).toBe(false);
  });
});

describe('XmlBase.fixDuplicateIds', () => {
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';

  /** the xml:id of every element carrying one, in document order */
  function ids(base: XmlBase): string[] {
    return base
      .getRootElement()!
      .query('descendant-or-self::node()/attribute::xml:id')
      .toArray()
      .map((a) => (a as unknown as Attribute).getValue());
  }

  it('leaves a document whose ids are already unique untouched', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root xml:id="r"><a xml:id="x"/><b xml:id="y"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(0);
    expect(ids(base)).toEqual(['r', 'x', 'y']);
  });

  it('keeps the first occurrence and reassigns every later one', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root><a xml:id="dup"/><b xml:id="dup"/><c xml:id="dup"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(2);

    const after = ids(base);
    expect(after[0]).toBe('dup');
    expect(after[1]).toMatch(/^meico_/);
    expect(after[2]).toMatch(/^meico_/);
    expect(new Set(after).size).toBe(3);
  });

  it('counts each duplicated attribute once, not each duplicated value', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root><a xml:id="p"/><b xml:id="q"/><c xml:id="p"/><d xml:id="q"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(2);
    expect(new Set(ids(base)).size).toBe(4);
  });

  it('ignores non-xml:id attributes, including a plain id', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root><a id="same" xml:id="one"/><b id="same" xml:id="two"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(0);
    const root = base.getRootElement()!;
    expect(root.getChildElements().get(0).getAttributeValue('id')).toBe('same');
    expect(root.getChildElements().get(1).getAttributeValue('id')).toBe('same');
  });

  it('is idempotent – a second call finds nothing left to fix', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root><a xml:id="dup"/><b xml:id="dup"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(1);
    expect(base.fixDuplicateIds()).toBe(0);
  });

  it('sees the root element’s own id, which is why the axis is descendant-or-self', () => {
    const base = new XmlBase(
      `<?xml version="1.0" encoding="UTF-8"?>
<root xml:id="dup"><a xml:id="dup"/></root>`,
      true,
    );
    expect(base.fixDuplicateIds()).toBe(1);
    expect(base.getRootElement()!.getAttribute('id', XML_NS)!.getValue()).toBe('dup');
  });
});

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
  it('should return error message when empty', () => {
    const xb = new XmlBase();
    expect(xb.validate()).toBe('No data present to be validated');
  });

  it('should return unsupported message when data present', () => {
    const xb = new XmlBase(SIMPLE_XML, true);
    expect(xb.validate()).toBe('Validation not supported in browser context');
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

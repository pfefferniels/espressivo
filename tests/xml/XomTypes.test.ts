import { describe, it, expect } from 'vitest';
import {
  Element,
  Attribute,
  Text,
  Document,
  Builder,
  Nodes,
  Elements,
  ParsingException,
  ValidityException,
  XomNode,
} from '../../src/xml/XomTypes.js';

// ---------------------------------------------------------------------------
// Attribute
// ---------------------------------------------------------------------------
describe('Attribute', () => {
  it('should create a simple attribute with name and value', () => {
    const attr = new Attribute('foo', 'bar');
    expect(attr.getLocalName()).toBe('foo');
    expect(attr.getValue()).toBe('bar');
    expect(attr.getNamespaceURI()).toBe('');
    expect(attr.getNamespacePrefix()).toBe('');
    expect(attr.getQualifiedName()).toBe('foo');
  });

  it('should create a namespaced attribute (3-arg constructor)', () => {
    const attr = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1');
    expect(attr.getLocalName()).toBe('id');
    expect(attr.getNamespacePrefix()).toBe('xml');
    expect(attr.getQualifiedName()).toBe('xml:id');
    expect(attr.getNamespaceURI()).toBe('http://www.w3.org/XML/1998/namespace');
    expect(attr.getValue()).toBe('n1');
  });

  it('should serialize with toXML()', () => {
    const attr = new Attribute('dur', '4');
    expect(attr.toXML()).toBe('dur="4"');
  });

  it('should escape special characters in toXML()', () => {
    const attr = new Attribute('val', 'a<b&c"d');
    expect(attr.toXML()).toBe('val="a&lt;b&amp;c&quot;d"');
  });

  it('should set value', () => {
    const attr = new Attribute('x', '1');
    attr.setValue('2');
    expect(attr.getValue()).toBe('2');
  });

  it('should deep-copy correctly', () => {
    const attr = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'abc');
    const copy = attr.copy();
    expect(copy.getLocalName()).toBe('id');
    expect(copy.getQualifiedName()).toBe('xml:id');
    expect(copy.getValue()).toBe('abc');
    expect(copy.getNamespaceURI()).toBe('http://www.w3.org/XML/1998/namespace');
    // mutating original must not affect copy
    attr.setValue('xyz');
    expect(copy.getValue()).toBe('abc');
  });

  it('should copy a simple attribute (no namespace)', () => {
    const attr = new Attribute('dur', '8');
    const copy = attr.copy();
    expect(copy.getLocalName()).toBe('dur');
    expect(copy.getValue()).toBe('8');
    expect(copy.getNamespaceURI()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
describe('Text', () => {
  it('should store and retrieve its value', () => {
    const t = new Text('hello');
    expect(t.getValue()).toBe('hello');
  });

  it('should escape XML entities in toXML()', () => {
    const t = new Text('a < b & c > d');
    expect(t.toXML()).toBe('a &lt; b &amp; c &gt; d');
  });

  it('should set a new value', () => {
    const t = new Text('old');
    t.setValue('new');
    expect(t.getValue()).toBe('new');
  });

  it('should deep-copy correctly', () => {
    const t = new Text('data');
    const c = t.copy();
    expect(c.getValue()).toBe('data');
    t.setValue('changed');
    expect(c.getValue()).toBe('data');
  });
});

// ---------------------------------------------------------------------------
// Element – creation and attributes
// ---------------------------------------------------------------------------
describe('Element', () => {
  it('should create a simple element', () => {
    const el = new Element('note');
    expect(el.getLocalName()).toBe('note');
    expect(el.getQualifiedName()).toBe('note');
    expect(el.getNamespaceURI()).toBe('');
  });

  it('should create a namespaced element', () => {
    const el = new Element('mei', 'http://www.music-encoding.org/ns/mei');
    expect(el.getLocalName()).toBe('mei');
    expect(el.getNamespaceURI()).toBe('http://www.music-encoding.org/ns/mei');
  });

  it('should create a prefixed namespaced element', () => {
    const el = new Element('m:note', 'http://example.org');
    expect(el.getLocalName()).toBe('note');
    expect(el.getNamespacePrefix()).toBe('m');
    expect(el.getQualifiedName()).toBe('m:note');
  });

  it('should add and retrieve attributes', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    el.addAttribute(new Attribute('oct', '5'));
    expect(el.getAttributeValue('dur')).toBe('4');
    expect(el.getAttributeValue('oct')).toBe('5');
    expect(el.getAttributeCount()).toBe(2);
  });

  it('should overwrite an existing attribute with the same name', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    el.addAttribute(new Attribute('dur', '8'));
    expect(el.getAttributeValue('dur')).toBe('8');
    expect(el.getAttributeCount()).toBe(1);
  });

  it('should remove an attribute by reference', () => {
    const el = new Element('note');
    const a = new Attribute('dur', '4');
    el.addAttribute(a);
    el.removeAttribute(a);
    expect(el.getAttribute('dur')).toBeNull();
    expect(el.getAttributeCount()).toBe(0);
  });

  it('should remove an attribute by name match (fallback)', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    // Create a *different* Attribute object with same name
    el.removeAttribute(new Attribute('dur', '8'));
    expect(el.getAttribute('dur')).toBeNull();
  });

  it('should return null for getAttribute when not present', () => {
    const el = new Element('note');
    expect(el.getAttribute('nonexistent')).toBeNull();
    expect(el.getAttributeValue('nonexistent')).toBeNull();
  });

  it('should retrieve attribute with namespace', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'n1'));
    const attr = el.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    expect(attr).not.toBeNull();
    expect(attr!.getValue()).toBe('n1');
  });
});

// ---------------------------------------------------------------------------
// Element – child operations
// ---------------------------------------------------------------------------
describe('Element – children', () => {
  it('should append child elements', () => {
    const parent = new Element('measure');
    const child1 = new Element('note');
    const child2 = new Element('rest');
    parent.appendChild(child1);
    parent.appendChild(child2);
    expect(parent.getChildCount()).toBe(2);
  });

  it('should append a text string as a child', () => {
    const el = new Element('title');
    el.appendChild('Test Piece');
    expect(el.getChildCount()).toBe(1);
    expect(el.getValue()).toBe('Test Piece');
  });

  it('should insert child at a specific position', () => {
    const parent = new Element('layer');
    const a = new Element('note');
    const b = new Element('rest');
    const c = new Element('note');
    parent.appendChild(a);
    parent.appendChild(c);
    parent.insertChild(b, 1);
    expect(parent.getChildCount()).toBe(3);
    expect((parent.getChild(1) as Element).getLocalName()).toBe('rest');
  });

  it('should remove child by reference', () => {
    const parent = new Element('staff');
    const child = new Element('layer');
    parent.appendChild(child);
    expect(parent.removeChild(child)).toBe(true);
    expect(parent.getChildCount()).toBe(0);
  });

  it('should remove child at index', () => {
    const parent = new Element('staff');
    parent.appendChild(new Element('layer'));
    parent.appendChild(new Element('layer'));
    parent.removeChildAt(0);
    expect(parent.getChildCount()).toBe(1);
  });

  it('should remove all children', () => {
    const parent = new Element('score');
    parent.appendChild(new Element('a'));
    parent.appendChild(new Element('b'));
    parent.removeChildren();
    expect(parent.getChildCount()).toBe(0);
  });

  it('should replace a child', () => {
    const parent = new Element('layer');
    const old = new Element('note');
    const replacement = new Element('rest');
    parent.appendChild(old);
    parent.replaceChild(old, replacement);
    expect(parent.getChildCount()).toBe(1);
    expect((parent.getChild(0) as Element).getLocalName()).toBe('rest');
  });

  it('should report indexOf correctly', () => {
    const parent = new Element('layer');
    const a = new Element('note');
    const b = new Element('rest');
    parent.appendChild(a);
    parent.appendChild(b);
    expect(parent.indexOf(a)).toBe(0);
    expect(parent.indexOf(b)).toBe(1);
  });

  it('should return child elements filtered by name', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('note'));
    parent.appendChild(new Element('rest'));
    parent.appendChild(new Element('note'));
    const notes = parent.getChildElements('note');
    expect(notes.size()).toBe(2);
  });

  it('should return all child elements when no name given', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('note'));
    parent.appendChild(new Element('rest'));
    const all = parent.getChildElements();
    expect(all.size()).toBe(2);
  });

  it('should getFirstChildElement by name', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('note'));
    parent.appendChild(new Element('rest'));
    const first = parent.getFirstChildElement('rest');
    expect(first).not.toBeNull();
    expect(first!.getLocalName()).toBe('rest');
  });

  it('should return null for getFirstChildElement with no match', () => {
    const parent = new Element('layer');
    parent.appendChild(new Element('note'));
    expect(parent.getFirstChildElement('rest')).toBeNull();
  });

  it('should collect getValue() from text children recursively', () => {
    const parent = new Element('title');
    parent.appendChild('Hello ');
    const sub = new Element('span');
    sub.appendChild('World');
    parent.appendChild(sub);
    expect(parent.getValue()).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// Element – toXML serialization
// ---------------------------------------------------------------------------
describe('Element – toXML', () => {
  it('should serialize an empty element as self-closing', () => {
    const el = new Element('note');
    expect(el.toXML()).toBe('<note />');
  });

  it('should serialize an element with attributes', () => {
    const el = new Element('note');
    el.addAttribute(new Attribute('dur', '4'));
    el.addAttribute(new Attribute('oct', '5'));
    const xml = el.toXML();
    expect(xml).toContain('dur="4"');
    expect(xml).toContain('oct="5"');
  });

  it('should include namespace declaration', () => {
    const el = new Element('mei', 'http://www.music-encoding.org/ns/mei');
    const xml = el.toXML();
    expect(xml).toContain('xmlns="http://www.music-encoding.org/ns/mei"');
  });

  it('should serialize child elements', () => {
    const parent = new Element('staff');
    const child = new Element('layer');
    parent.appendChild(child);
    const xml = parent.toXML();
    expect(xml).toContain('<layer');
    expect(xml).toContain('</staff>');
  });
});

// ---------------------------------------------------------------------------
// Element – copy (deep clone)
// ---------------------------------------------------------------------------
describe('Element – copy', () => {
  it('should deep copy element with attributes and children', () => {
    const original = new Element('note');
    original.addAttribute(new Attribute('dur', '4'));
    const child = new Element('artic');
    child.addAttribute(new Attribute('type', 'stacc'));
    original.appendChild(child);

    const copy = original.copy();
    expect(copy.getLocalName()).toBe('note');
    expect(copy.getAttributeValue('dur')).toBe('4');
    expect(copy.getChildCount()).toBe(1);
    const copiedChild = copy.getChild(0) as Element;
    expect(copiedChild.getLocalName()).toBe('artic');
    expect(copiedChild.getAttributeValue('type')).toBe('stacc');

    // Mutation isolation
    original.addAttribute(new Attribute('oct', '5'));
    expect(copy.getAttribute('oct')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Element.wrap – from parsed XML
// ---------------------------------------------------------------------------
describe('Element.wrap', () => {
  it('should wrap a parsed DOM element with attributes and children', () => {
    const xml = '<root foo="bar"><child val="1"/><child val="2"/></root>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();

    expect(root.getLocalName()).toBe('root');
    expect(root.getAttributeValue('foo')).toBe('bar');
    const children = root.getChildElements('child');
    expect(children.size()).toBe(2);
    expect(children.get(0).getAttributeValue('val')).toBe('1');
    expect(children.get(1).getAttributeValue('val')).toBe('2');
  });

  it('should wrap a parsed DOM element with namespace', () => {
    const xml = '<mei xmlns="http://www.music-encoding.org/ns/mei"><meiHead/></mei>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();

    expect(root.getLocalName()).toBe('mei');
    expect(root.getNamespaceURI()).toBe('http://www.music-encoding.org/ns/mei');
    const head = root.getFirstChildElement('meiHead');
    expect(head).not.toBeNull();
  });

  it('should wrap a parsed DOM element with text content', () => {
    const xml = '<title>Hello World</title>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();

    expect(root.getLocalName()).toBe('title');
    expect(root.getValue()).toBe('Hello World');
  });

  it('should wrap xml:id attributes correctly', () => {
    const xml = '<note xml:id="n1" dur="4"/>';
    const builder = new Builder();
    const doc = builder.build(xml);
    const root = doc.getRootElement();

    const idAttr = root.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
    expect(idAttr).not.toBeNull();
    expect(idAttr!.getValue()).toBe('n1');
  });
});

// ---------------------------------------------------------------------------
// Element – query (XPath)
// ---------------------------------------------------------------------------
describe('Element – query (XPath)', () => {
  it('should find descendant elements by local-name', () => {
    const root = new Element('score');
    const staff = new Element('staff');
    const note = new Element('note');
    note.addAttribute(new Attribute('dur', '4'));
    staff.appendChild(note);
    root.appendChild(staff);

    const results = root.query("descendant::*[local-name()='note']");
    expect(results.size()).toBe(1);
    const found = results.get(0) as Element;
    expect(found.getLocalName()).toBe('note');
  });

  it('should find elements with a specific attribute', () => {
    const root = new Element('map');
    const e1 = new Element('entry');
    e1.addAttribute(new Attribute('date', '0'));
    const e2 = new Element('entry');
    e2.addAttribute(new Attribute('date', '100'));
    const e3 = new Element('entry');
    root.appendChild(e1);
    root.appendChild(e2);
    root.appendChild(e3);

    const results = root.query('descendant::*[attribute::date]');
    expect(results.size()).toBe(2);
  });

  it('should find child elements via child:: axis', () => {
    const root = new Element('parent');
    root.appendChild(new Element('a'));
    root.appendChild(new Element('b'));
    root.appendChild(new Element('a'));

    const results = root.query("child::*[local-name()='a']");
    expect(results.size()).toBe(2);
  });

  it('should return empty Nodes for a query with no matches', () => {
    const root = new Element('empty');
    const results = root.query("descendant::*[local-name()='nonexistent']");
    expect(results.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
describe('Document', () => {
  it('should create from a root element', () => {
    const root = new Element('root');
    const doc = new Document(root);
    expect(doc.getRootElement().getLocalName()).toBe('root');
  });

  it('should set a new root element', () => {
    const doc = new Document(new Element('old'));
    const newRoot = new Element('new');
    doc.setRootElement(newRoot);
    expect(doc.getRootElement().getLocalName()).toBe('new');
  });

  it('should serialize with XML declaration', () => {
    const root = new Element('root');
    const doc = new Document(root);
    const xml = doc.toXML();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<root');
  });

  it('should deep-copy', () => {
    const root = new Element('root');
    root.addAttribute(new Attribute('id', '1'));
    const doc = new Document(root);
    const copy = doc.copy();
    expect(copy.getRootElement().getAttributeValue('id')).toBe('1');
    // Mutation isolation
    root.addAttribute(new Attribute('x', '2'));
    expect(copy.getRootElement().getAttribute('x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Builder.build – parsing
// ---------------------------------------------------------------------------
describe('Builder', () => {
  const builder = new Builder();

  it('should parse a simple XML string', () => {
    const doc = builder.build('<root/>');
    expect(doc.getRootElement().getLocalName()).toBe('root');
  });

  it('should parse XML with attributes', () => {
    const doc = builder.build('<note dur="4" oct="5"/>');
    const root = doc.getRootElement();
    expect(root.getAttributeValue('dur')).toBe('4');
    expect(root.getAttributeValue('oct')).toBe('5');
  });

  it('should parse nested XML', () => {
    const xml = '<a><b><c/></b></a>';
    const doc = builder.build(xml);
    const root = doc.getRootElement();
    expect(root.getLocalName()).toBe('a');
    const b = root.getFirstChildElement('b');
    expect(b).not.toBeNull();
    const c = b!.getFirstChildElement('c');
    expect(c).not.toBeNull();
  });

  it('should parse XML with text content', () => {
    const doc = builder.build('<title>Hello</title>');
    expect(doc.getRootElement().getValue()).toBe('Hello');
  });

  it('should parse XML with namespace', () => {
    const doc = builder.build('<mei xmlns="http://www.music-encoding.org/ns/mei"/>');
    const root = doc.getRootElement();
    expect(root.getNamespaceURI()).toBe('http://www.music-encoding.org/ns/mei');
  });

  // -------------------------------------------------------------------------
  // UTF-8 BOM tolerance.
  //
  // Java hands XOM bytes, where a leading EF BB BF is the XML 1.0 Appendix F
  // encoding signature and is consumed before the document entity begins
  // (meico/xml/XmlBase.java:99,162). This port parses a decoded string, where the
  // same bytes arrive as a U+FEFF character in front of the declaration. Stripping
  // it is what makes the two agree.
  // -------------------------------------------------------------------------
  const BOM = '﻿';

  it('should parse a BOM-prefixed document identically to the same text without one', () => {
    const xml = '<?xml version="1.0"?>\n<root a="1"><child/></root>';
    expect(
      builder
        .build(BOM + xml)
        .getRootElement()
        .toXML(),
    ).toBe(builder.build(xml).getRootElement().toXML());
  });

  it('should parse a BOM-prefixed document with no XML declaration', () => {
    expect(builder.build(`${BOM}<root/>`).getRootElement().getLocalName()).toBe('root');
  });

  it('should parse a BOM-prefixed document that uses single-quoted attributes', () => {
    // 97 of 121 files in the "Measuring Early Records" corpus are spelled this way, and
    // three of the MPM format's own sample encodings carry a BOM; the two traits co-occur.
    const single =
      "<?xml version='1.0'?>\n<mpm xmlns='http://www.cemfi.de/mpm/ns/1.0'>" +
      "<performance name='p' pulsesPerQuarter='720'/></mpm>";
    const root = builder.build(BOM + single).getRootElement();
    expect(root.getLocalName()).toBe('mpm');
    expect(root.getNamespaceURI()).toBe('http://www.cemfi.de/mpm/ns/1.0');
    const performance = root.getFirstChildElement('performance');
    expect(performance).not.toBeNull();
    expect(performance!.getAttributeValue('pulsesPerQuarter')).toBe('720');
    // Attribute quoting is a lexical detail the parser normalises away, so the two
    // spellings must produce the same tree.
    expect(root.toXML()).toBe(builder.build(single).getRootElement().toXML());
  });

  it('should preserve U+FEFF that is not the leading signature', () => {
    // Anywhere but position 0, U+FEFF is ZERO WIDTH NO-BREAK SPACE — ordinary content.
    const doc = builder.build(`${BOM}<t>a${BOM}b</t>`);
    expect(doc.getRootElement().getValue()).toBe(`a${BOM}b`);
  });

  it('should strip exactly one leading BOM, not a run of them', () => {
    // One signature is what a UTF-8 encoder writes; a second mark is content, and content
    // before the declaration is fatal. Stripping the run would be over-normalising input
    // that Java does not accept either.
    const declared = '<?xml version="1.0"?><t/>';
    expect(() => builder.build(BOM + declared)).not.toThrow();
    expect(() => builder.build(BOM + BOM + declared)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------
describe('Nodes', () => {
  it('should report size correctly', () => {
    const nodes = new Nodes([]);
    expect(nodes.size()).toBe(0);
  });

  it('should get elements by index', () => {
    const el = new Element('test');
    const nodes = new Nodes([el]);
    expect(nodes.size()).toBe(1);
    expect((nodes.get(0) as Element).getLocalName()).toBe('test');
  });

  it('should convert to array', () => {
    const a = new Element('a');
    const b = new Element('b');
    const nodes = new Nodes([a, b]);
    const arr = nodes.toArray();
    expect(arr.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------
describe('Elements', () => {
  it('should wrap an array of elements', () => {
    const a = new Element('a');
    const b = new Element('b');
    const elems = new Elements([a, b]);
    expect(elems.size()).toBe(2);
    expect(elems.get(0).getLocalName()).toBe('a');
    expect(elems.get(1).getLocalName()).toBe('b');
  });

  it('should convert to array', () => {
    const elems = new Elements([new Element('x')]);
    expect(elems.toArray().length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ParsingException / ValidityException
// ---------------------------------------------------------------------------
describe('Exceptions', () => {
  it('ParsingException should have correct name and message', () => {
    const e = new ParsingException('bad xml');
    expect(e.name).toBe('ParsingException');
    expect(e.message).toBe('bad xml');
    expect(e instanceof Error).toBe(true);
  });

  it('ValidityException should extend ParsingException', () => {
    const doc = new Document(new Element('root'));
    const e = new ValidityException('invalid', doc);
    expect(e.name).toBe('ValidityException');
    expect(e instanceof ParsingException).toBe(true);
    expect(e.getDocument()).toBe(doc);
  });

  it('ValidityException getDocument returns null when not provided', () => {
    const e = new ValidityException('oops');
    expect(e.getDocument()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// XomNode – detach / getParent
// ---------------------------------------------------------------------------
describe('XomNode – parent and detach', () => {
  it('should return parent after being added as child', () => {
    const parent = new Element('parent');
    const child = new Element('child');
    parent.appendChild(child);
    // getParent works through the Element children array, but the XomNode.getParent
    // is based on DOM parentNode. Since we keep our own _children array, let's verify
    // via indexOf.
    expect(parent.indexOf(child)).toBe(0);
  });

  it('removeChild should return false for non-children', () => {
    const parent = new Element('parent');
    const orphan = new Element('orphan');
    expect(parent.removeChild(orphan)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Attribute.detach on parsed trees
//
// Element.wrap parents the attributes it creates, exactly as it parents the child
// nodes. Without that, detach() had nothing to remove itself from and silently did
// nothing, so a parsed attribute stayed in the serialized XML forever.
// ---------------------------------------------------------------------------
describe('Attribute – detach on parser-sourced attributes', () => {
  const parse = (xml: string): Element => new Builder().build(xml).getRootElement();

  it('should report the wrapping element as the parent of a parsed attribute', () => {
    const root = parse('<note dur="4" oct="5"/>');
    expect(root.getAttribute('dur')!.getParent()).toBe(root);
  });

  it('should remove a parsed attribute from the serialized XML', () => {
    const root = parse('<note dur="4" oct="5"/>');
    root.getAttribute('dur')!.detach();
    expect(root.getAttribute('dur')).toBeNull();
    expect(root.getAttributeCount()).toBe(1);
    expect(root.toXML()).toBe('<note oct="5" />');
  });

  it('should remove a parsed namespaced attribute', () => {
    const root = parse(
      '<note xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:id="n1" dur="4"/>',
    );
    root.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.detach();
    expect(root.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')).toBeNull();
    expect(root.toXML()).toBe('<note dur="4" />');
  });

  it('should remove a parsed attribute below the root', () => {
    const root = parse('<score><note dur="4" oct="5"/></score>');
    const note = root.getChildElements('note').get(0);
    note.getAttribute('oct')!.detach();
    expect(note.toXML()).toBe('<note dur="4" />');
    expect(root.toXML()).toBe('<score><note dur="4" /></score>');
  });

  it('should leave the remaining attributes in their original order', () => {
    const root = parse('<note a="1" b="2" c="3" d="4"/>');
    root.getAttribute('b')!.detach();
    expect(root.toXML()).toBe('<note a="1" c="3" d="4" />');
  });

  it('should keep two same-local-name attributes distinguishable when parsed', () => {
    // Storage is a plain array filled in document order, with no dedupe: routing wrap
    // through addAttribute would match `id` against `xml:id`'s local name and drop one.
    const root = parse('<note xml:id="n1" id="plain"/>');
    expect(root.getAttributeCount()).toBe(2);
    expect(root.toXML()).toBe('<note xml:id="n1" id="plain" />');

    root.getAttribute('id', 'http://www.w3.org/XML/1998/namespace')!.detach();
    expect(root.toXML()).toBe('<note id="plain" />');
  });

  it('should be a no-op for an attribute no element holds', () => {
    const orphan = new Attribute('dur', '4');
    expect(() => orphan.detach()).not.toThrow();
    expect(orphan.getValue()).toBe('4');
  });

  it('should still detach attributes of constructed elements', () => {
    const el = new Element('note');
    const a = new Attribute('dur', '4');
    el.addAttribute(a);
    el.addAttribute(new Attribute('oct', '5'));
    a.detach();
    expect(el.getAttribute('dur')).toBeNull();
    expect(el.toXML()).toBe('<note oct="5" />');
  });

  it('should survive a parse/detach/serialize/re-parse round trip', () => {
    const root = parse('<note xmlns="http://x" dur="4" oct="5"/>');
    root.getAttribute('dur')!.detach();
    const reparsed = parse(root.toXML());
    expect(reparsed.getAttribute('dur')).toBeNull();
    expect(reparsed.getAttributeValue('oct')).toBe('5');
  });
});

/**
 * T5 verifier byte-compat probe.
 * Usage: node probe.mjs <path-to-dist> <out.json>
 * Runs an identical battery against whichever build it is pointed at and writes
 * { label -> string } plus a sha256 over the whole ordered transcript.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2];
const outFile = process.argv[3];
const PROJ = '/Users/nielspfeffer/Projects/meico-ts';

const X = await import(path.join(distDir, 'xml/XomTypes.js'));
const { Builder, Element, Attribute, Text, Document, Nodes, Elements } = X;

const results = [];
const rec = (label, value) => results.push([label, String(value)]);
const safe = (label, fn) => {
  try {
    rec(label, fn());
  } catch (e) {
    rec(label, `THREW:${e && e.constructor ? e.constructor.name : '?'}:${e && e.message}`);
  }
};

/* ---------------------------------------------------------------- real inputs */

const meiDir = path.join(PROJ, 'tests/integration/fixtures/mei');
const meiFiles = readdirSync(meiDir)
  .filter((f) => f.endsWith('.mei'))
  .sort();

const refDir = path.join(PROJ, 'tests/integration/fixtures/all-maps-reference');
const refFiles = readdirSync(refDir)
  .filter((f) => f.endsWith('.msm') || f.endsWith('.mpm'))
  .sort();

const perfDir = path.join(PROJ, 'tests/integration/fixtures/performance-reference');
let perfFiles = [];
try {
  perfFiles = readdirSync(perfDir)
    .filter((f) => f.endsWith('.msm') || f.endsWith('.mpm'))
    .sort();
} catch {
  /* dir may not exist */
}

const inputs = [
  ...meiFiles.map((f) => ['mei/' + f, path.join(meiDir, f)]),
  ...refFiles.map((f) => ['ref/' + f, path.join(refDir, f)]),
  ...perfFiles.map((f) => ['perf/' + f, path.join(perfDir, f)]),
];
rec('INPUT_COUNT', inputs.length);
rec('INPUT_LIST', inputs.map(([n]) => n).join(','));

const QUERIES = [
  'descendant::*',
  'descendant-or-self::node()/attribute::xml:id',
  "descendant::*[local-name()='note']",
  "descendant::*[local-name()='staff']",
  'descendant::*[@xml:id]',
  'child::*',
  'descendant::text()',
  './/*[1]',
  "descendant::*[@dur]/attribute::dur",
  'not-a-valid-xpath((',
  "descendant::*[local-name()='instruction']",
  'descendant::*/attribute::*',
];

for (const [name, file] of inputs) {
  const xml = readFileSync(file, 'utf8');
  safe(`${name}#parse.docXML`, () => new Builder().build(xml).toXML());
  safe(`${name}#parse.rootXML`, () => new Builder().build(xml).getRootElement().toXML());
  safe(`${name}#parse.copyXML`, () => new Builder().build(xml).getRootElement().copy().toXML());
  safe(`${name}#parse.docCopyXML`, () => new Builder().build(xml).copy().toXML());
  safe(`${name}#parse.getValue`, () => new Builder().build(xml).getRootElement().getValue());
  safe(`${name}#parse.qname`, () => {
    const r = new Builder().build(xml).getRootElement();
    return `${r.getQualifiedName()}|${r.getLocalName()}|${r.getNamespaceURI()}|${r.getNamespacePrefix()}|${r.getAttributeCount()}|${r.getChildCount()}`;
  });

  const root = new Builder().build(xml).getRootElement();
  for (const q of QUERIES) {
    safe(`${name}#q[${q}]`, () => {
      const ns = root.query(q);
      const parts = [`size=${ns.size()}`];
      const arr = ns.toArray();
      parts.push(`arr=${arr.length}`);
      for (let i = 0; i < Math.min(arr.length, 12); i++) {
        const n = arr[i];
        parts.push(`${i}:${n.constructor.name}:${n.toXML().slice(0, 120)}`);
      }
      // get(i) must agree with toArray()
      for (let i = 0; i < Math.min(ns.size(), 12); i++) {
        parts.push(`g${i}=${ns.get(i) === arr[i] ? 'same' : 'DIFF'}`);
      }
      return parts.join('~');
    });
  }

  // getChildElements matrix on a real tree
  safe(`${name}#gce.matrix`, () => {
    const r = new Builder().build(xml).getRootElement();
    const nsU = r.getNamespaceURI();
    const cases = [
      [undefined, undefined],
      [undefined, nsU],
      [undefined, 'http://bogus'],
      ['music', undefined],
      ['music', nsU],
      ['music', 'http://bogus'],
      ['meiHead', undefined],
      ['meiHead', nsU],
      ['nope', undefined],
      ['nope', 'http://bogus'],
    ];
    return cases
      .map(([n, u]) => {
        const els = r.getChildElements(n, u);
        return `${n}/${u}=${els.size()}:${els
          .toArray()
          .map((e) => e.getQualifiedName())
          .join('+')}`;
      })
      .join('~');
  });

  // detach() on a parsed subtree, then re-serialize the parent
  safe(`${name}#detach.subtree`, () => {
    const r = new Builder().build(xml).getRootElement();
    const kids = r.getChildElements();
    if (kids.size() === 0) return 'nochildren';
    const first = kids.get(0);
    const parentBefore = first.getParent() ? first.getParent().getQualifiedName() : 'null';
    first.detach();
    const parentAfter = first.getParent() ? first.getParent().getQualifiedName() : 'null';
    return `${parentBefore}->${parentAfter}|rootNow=${r.toXML().length}|childCount=${r.getChildCount()}|detached=${first.toXML().slice(0, 200)}`;
  });

  // removeChild / removeChildAt / removeChildren on a real tree
  safe(`${name}#mutate.real`, () => {
    const r = new Builder().build(xml).getRootElement();
    const out = [];
    out.push(`c0=${r.getChildCount()}`);
    if (r.getChildCount() > 0) {
      const removed = r.removeChildAt(0);
      out.push(`rm0=${removed.constructor.name}:${removed.toXML().slice(0, 60)}`);
      out.push(`c1=${r.getChildCount()}`);
      out.push(`xml1=${r.toXML().slice(0, 300)}`);
      const kid = r.getChild(0);
      out.push(`rc=${r.removeChild(kid)}`);
      out.push(`c2=${r.getChildCount()}`);
    }
    r.removeChildren();
    out.push(`c3=${r.getChildCount()}|final=${r.toXML()}`);
    return out.join('~');
  });
}

/* ------------------------------------------------- programmatic construction */

// Namespace declaration emission: element prefix, attr prefixes, xml prefix
safe('build.ns.basic', () => {
  const e = new Element('mei', 'http://www.music-encoding.org/ns/mei');
  e.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'm1'));
  e.addAttribute(new Attribute('meiversion', '4.0'));
  return e.toXML();
});

safe('build.ns.prefixedElement', () => {
  const e = new Element('mup:root', 'http://mup.example/ns');
  e.addAttribute(new Attribute('plain', 'v'));
  e.addAttribute(new Attribute('other:att', 'http://other.example/ns', 'w'));
  e.addAttribute(new Attribute('mup:own', 'http://mup.example/ns', 'z'));
  e.addAttribute(new Attribute('xml:lang', 'http://www.w3.org/XML/1998/namespace', 'de'));
  return e.toXML();
});

safe('build.ns.nestedRedeclare', () => {
  const root = new Element('a:root', 'http://one');
  const mid = new Element('a:mid', 'http://two'); // same prefix, different URI
  const leaf = new Element('plain');
  const deep = new Element('b:deep', 'http://three');
  leaf.appendChild(deep);
  mid.appendChild(leaf);
  root.appendChild(mid);
  root.addAttribute(new Attribute('a:x', 'http://one', '1'));
  mid.addAttribute(new Attribute('b:y', 'http://three', '2'));
  return root.toXML();
});

safe('build.ns.emptyReset', () => {
  const root = new Element('r', 'http://outer');
  const child = new Element('c', ''); // no namespace
  const child2 = new Element('d');
  root.appendChild(child);
  root.appendChild(child2);
  return root.toXML();
});

safe('build.empty.selfClose', () => {
  const e = new Element('empty');
  const f = new Element('withAttr');
  f.addAttribute(new Attribute('a', 'b'));
  const g = new Element('withText');
  g.appendChild(new Text(''));
  return `${e.toXML()}|${f.toXML()}|${g.toXML()}`;
});

// Attribute order: insertion order, and re-set moves to END
safe('build.attr.order', () => {
  const e = new Element('e');
  for (const n of ['a', 'b', 'c', 'd']) e.addAttribute(new Attribute(n, n.toUpperCase()));
  const before = e.toXML();
  e.addAttribute(new Attribute('b', 'B2')); // must move b to the end
  const after = e.toXML();
  e.addAttribute(new Attribute('a', 'A2'));
  return `${before}~${after}~${e.toXML()}~count=${e.getAttributeCount()}`;
});

safe('build.attr.orderNsVariants', () => {
  const e = new Element('e', 'http://elem');
  e.addAttribute(new Attribute('p:a', 'http://p', '1'));
  e.addAttribute(new Attribute('a', '2')); // same local name, no namespace
  const s1 = e.toXML();
  e.addAttribute(new Attribute('p:a', 'http://p', '1b')); // replaces the prefixed one
  const s2 = e.toXML();
  return `${s1}~${s2}~${e.getAttributeCount()}`;
});

// removeAttribute: identity path vs by-name fallback, incl. duplicate local names
safe('build.attr.removeIdentity', () => {
  const e = new Element('e');
  const a = new Attribute('a', '1');
  const b = new Attribute('b', '2');
  e.addAttribute(a);
  e.addAttribute(b);
  const pBefore = a.getParent() ? 'set' : 'null';
  e.removeAttribute(a);
  const pAfter = a.getParent() ? 'set' : 'null';
  return `${pBefore}->${pAfter}|${e.toXML()}|count=${e.getAttributeCount()}`;
});

safe('build.attr.removeByName', () => {
  const e = new Element('e');
  const a = new Attribute('a', '1');
  e.addAttribute(a);
  e.addAttribute(new Attribute('b', '2'));
  const equivalent = new Attribute('a', 'DIFFERENT-VALUE');
  e.removeAttribute(equivalent);
  // the asymmetry: the by-name path must NOT clear the removed attribute's parent
  return `${e.toXML()}|origParent=${a.getParent() ? a.getParent().getQualifiedName() : 'null'}|count=${e.getAttributeCount()}`;
});

safe('build.attr.removeMissing', () => {
  const e = new Element('e');
  e.addAttribute(new Attribute('a', '1'));
  e.removeAttribute(new Attribute('zz', '9'));
  e.removeAttribute(new Attribute('a', 'http://other', '1'));
  return `${e.toXML()}|count=${e.getAttributeCount()}`;
});

safe('build.attr.removeFirstOfTwoSameName', () => {
  // Two same-named attributes forced into the list via direct pushes is not
  // reachable through addAttribute, so build it the only way the API allows:
  // distinct namespaces make addAttribute keep both.
  const e = new Element('e');
  e.addAttribute(new Attribute('x', 'http://a', '1'));
  e.addAttribute(new Attribute('x', 'http://b', '2'));
  const before = e.toXML();
  e.removeAttribute(new Attribute('x', 'http://b', 'ignored'));
  return `${before}|${e.toXML()}|count=${e.getAttributeCount()}`;
});

safe('build.attr.detach', () => {
  const e = new Element('e');
  const a = new Attribute('a', '1');
  e.addAttribute(a);
  a.detach();
  return `${e.toXML()}|count=${e.getAttributeCount()}|parent=${a.getParent() ? 'set' : 'null'}|attrXML=${a.toXML()}`;
});

safe('build.attr.copyAndAccessors', () => {
  const forms = [
    ['plain', 'v'],
    ['p:pre', 'v'],
    ['a:b:c', 'v'],
    [':x', 'v'],
    ['x:', 'v'],
    ['', 'v'],
    ['xml:id', 'http://www.w3.org/XML/1998/namespace', 'i1'],
    ['ns:n', 'http://ns', 'v'],
    ['n', '', 'v'],
    ['a:b:c', 'http://ns', 'v'],
  ];
  return forms
    .map((f) => {
      const a = f.length === 2 ? new Attribute(f[0], f[1]) : new Attribute(f[0], f[1], f[2]);
      const c = a.copy();
      return `${f.join('/')}=>[${a.getQualifiedName()}|${a.getLocalName()}|${a.getNamespacePrefix()}|${a.getNamespaceURI()}|${a.getValue()}|${a.toXML()}|copy:${c.toXML()}]`;
    })
    .join('~');
});

// Escaping, both positions
safe('build.escape.attr', () => {
  const e = new Element('e');
  e.addAttribute(new Attribute('a', `& < > " ' &amp; <tag> ä世界\u{1F600}`));
  return e.toXML();
});

safe('build.escape.text', () => {
  const e = new Element('e');
  e.appendChild(new Text(`& < > " ' &amp; <tag> ä世界\u{1F600}`));
  return `${e.toXML()}|value=${e.getValue()}`;
});

safe('build.escape.roundTrip', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<r xmlns="http://x" a="&amp;&lt;&quot;'&gt;" xml:id="e1"><t>&amp;&lt;&gt;"'</t><e b="tab&#9;nl&#10;"/><w>   </w><cjk>世界\u{1F600}</cjk></r>`;
  const d = new Builder().build(xml);
  return `${d.toXML()}|value=${d.getRootElement().getValue()}|copy=${d.getRootElement().copy().toXML()}`;
});

// Child insertion order / mutation sequence
safe('build.children.sequence', () => {
  const root = new Element('root');
  const out = [];
  const kids = [];
  for (let i = 0; i < 5; i++) {
    const k = new Element('k');
    k.addAttribute(new Attribute('i', String(i)));
    kids.push(k);
    root.appendChild(k);
  }
  out.push(`append=${root.toXML()}`);
  root.appendChild('raw text');
  out.push(`text=${root.toXML()}`);
  const ins = new Element('ins');
  root.insertChild(ins, 2);
  out.push(`insert2=${root.toXML()}`);
  root.insertChild(new Element('ins0'), 0);
  out.push(`insert0=${root.toXML()}`);
  root.insertChild(new Element('insEnd'), root.getChildCount());
  out.push(`insertEnd=${root.toXML()}`);
  const rep = new Element('rep');
  root.replaceChild(kids[3], rep);
  out.push(`replace=${root.toXML()}`);
  out.push(`idxRep=${root.indexOf(rep)}|idxGone=${root.indexOf(kids[3])}`);
  const rm = root.removeChildAt(1);
  out.push(`rmAt1=${rm.toXML()}|${root.toXML()}`);
  out.push(`rmChild=${root.removeChild(ins)}|${root.toXML()}`);
  out.push(`rmChildAgain=${root.removeChild(ins)}`);
  // re-append an already-attached child
  const other = new Element('other');
  other.appendChild(kids[0]);
  out.push(`reparent=${root.toXML()}|other=${other.toXML()}|p=${kids[0].getParent().getQualifiedName()}`);
  root.removeChildren();
  out.push(`cleared=${root.toXML()}|n=${root.getChildCount()}`);
  return out.join('~');
});

safe('build.children.detachChain', () => {
  const root = new Element('root');
  const mid = new Element('mid');
  const leaf = new Element('leaf');
  mid.appendChild(leaf);
  root.appendChild(mid);
  const out = [`before=${root.toXML()}`];
  leaf.detach();
  out.push(`leafDetached=${root.toXML()}|leafParent=${leaf.getParent() ? 'set' : 'null'}`);
  mid.detach();
  out.push(`midDetached=${root.toXML()}|n=${root.getChildCount()}`);
  return out.join('~');
});

safe('build.children.getters', () => {
  const root = new Element('root', 'http://r');
  const a = new Element('a', 'http://r');
  const b = new Element('b', 'http://other');
  const a2 = new Element('a', 'http://other');
  root.appendChild(new Text('t0'));
  root.appendChild(a);
  root.appendChild(new Text('t1'));
  root.appendChild(b);
  root.appendChild(a2);
  const cases = [
    [undefined, undefined],
    [undefined, 'http://r'],
    [undefined, 'http://other'],
    ['a', undefined],
    ['a', 'http://r'],
    ['a', 'http://other'],
    ['b', undefined],
    ['b', 'http://r'],
    ['zz', undefined],
    ['zz', 'http://r'],
  ];
  const gce = cases
    .map(([n, u]) => {
      const els = root.getChildElements(n, u);
      return `${n}/${u}=${els.size()}:${els
        .toArray()
        .map((e) => e.getNamespaceURI())
        .join('+')}`;
    })
    .join('~');
  const first = cases
    .map(([n, u]) => {
      if (n === undefined) return 'skip';
      const e = root.getFirstChildElement(n, u);
      return `${n}/${u}=${e ? e.getNamespaceURI() : 'null'}`;
    })
    .join('~');
  return `gce[${gce}]~first[${first}]~xml=${root.toXML()}~value=${root.getValue()}~count=${root.getChildCount()}`;
});

safe('build.doc.roundTrip', () => {
  const root = new Element('mei', 'http://www.music-encoding.org/ns/mei');
  root.addAttribute(new Attribute('meiversion', '4.0'));
  root.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'd1'));
  const music = new Element('music', 'http://www.music-encoding.org/ns/mei');
  root.appendChild(music);
  const d = new Document(root);
  const s1 = d.toXML();
  const reparsed = new Builder().build(s1);
  const s2 = reparsed.toXML();
  const s3 = new Builder().build(s2).toXML();
  const c = d.copy();
  return `s1=${s1}~s2=${s2}~stable=${s2 === s3}~copy=${c.toXML()}~copyIndep=${c.getRootElement() !== root}`;
});

safe('build.doc.setRoot', () => {
  const d = new Document(new Element('one'));
  const s1 = d.toXML();
  d.setRootElement(new Element('two', 'http://two'));
  return `${s1}|${d.toXML()}`;
});

safe('build.text.setValue', () => {
  const t = new Text('a');
  const before = t.toXML();
  t.setValue('b & c');
  const dom = t.getDomNode();
  return `${before}|${t.toXML()}|${t.getValue()}|dom=${dom.data}|copy=${t.copy().toXML()}`;
});

safe('build.attr.setValue', () => {
  const a = new Attribute('a', '1');
  a.setValue('2 & "3"');
  return `${a.toXML()}|${a.getValue()}|dom=${a.getDomNode().value}`;
});

safe('build.element.setNs', () => {
  const e = new Element('e', 'http://a');
  const s1 = e.toXML();
  e.setNamespaceURI('http://b');
  const s2 = e.toXML();
  e.setNamespacePrefix('p');
  return `${s1}|${s2}|${e.toXML()}|${e.getQualifiedName()}`;
});

// query() over hand-built trees, hitting the attribute and text axes
safe('build.query.axes', () => {
  const root = new Element('r', 'http://x');
  root.addAttribute(new Attribute('a', '1'));
  root.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'r1'));
  const c1 = new Element('c', 'http://x');
  c1.addAttribute(new Attribute('v', '10'));
  c1.appendChild(new Text('hello & bye'));
  const c2 = new Element('c', 'http://x');
  c2.addAttribute(new Attribute('v', '20'));
  c2.appendChild(new Text('second'));
  root.appendChild(c1);
  root.appendChild(c2);
  const qs = [
    'descendant::*',
    'descendant::*/attribute::v',
    'attribute::a',
    'descendant-or-self::node()/attribute::xml:id',
    'descendant::text()',
    "descendant::*[local-name()='c']",
    './/@*',
    'descendant::*[@v="20"]',
    '((((',
    'count(descendant::*)',
    'string(descendant::text()[1])',
  ];
  return qs
    .map((q) => {
      const ns = root.query(q);
      return `${q}=>${ns.size()}:${ns
        .toArray()
        .map((n) => `${n.constructor.name}:${n.toXML()}`)
        .join('+')}`;
    })
    .join('~');
});

safe('build.query.prefixRebinding', () => {
  const root = new Element('p:r', 'http://one');
  const child = new Element('p:c', 'http://two');
  root.appendChild(child);
  const qs = ['descendant::p:c', 'descendant::*', "descendant::*[local-name()='c']"];
  return qs.map((q) => `${q}=>${root.query(q).size()}`).join('~');
});

safe('build.query.identicalSiblings', () => {
  const root = new Element('r');
  for (let i = 0; i < 5; i++) {
    const c = new Element('c');
    c.appendChild(new Text('same'));
    root.appendChild(c);
  }
  const hits = root.query("descendant::*[local-name()='c']");
  const kids = root.getChildElements('c');
  const identity = [];
  for (let i = 0; i < hits.size(); i++) identity.push(hits.get(i) === kids.get(i) ? 'same' : 'DIFF');
  return `${hits.size()}|${identity.join(',')}|${root.toXML()}`;
});

safe('build.query.deepNesting', () => {
  const root = new Element('l0');
  let cur = root;
  for (let i = 1; i <= 6; i++) {
    const n = new Element('l' + i);
    n.addAttribute(new Attribute('d', String(i)));
    cur.appendChild(n);
    cur = n;
  }
  const hits = root.query('descendant::*');
  return `${hits.size()}|${hits
    .toArray()
    .map((n) => n.getQualifiedName?.() ?? n.constructor.name)
    .join('+')}|${root.toXML()}`;
});

safe('build.wrap.lossy', () => {
  const xml = `<r><!--c--><?pi go?><![CDATA[raw<x>]]><e/>text</r>`;
  const d = new Builder().build(xml);
  return `${d.toXML()}|childCount=${d.getRootElement().getChildCount()}|value=${d.getRootElement().getValue()}`;
});

safe('build.parse.errors', () => {
  const cases = ['', '   ', '<unclosed>', '<a></b>', 'not xml at all', '<?xml version="1.0"?>'];
  return cases
    .map((c) => {
      try {
        const d = new Builder().build(c);
        return `ok:${d.toXML()}`;
      } catch (e) {
        return `threw:${e.constructor.name}:${e.message}`;
      }
    })
    .join('~');
});

// Object.keys shape for every class (this is where hunk 3 is expected to differ)
safe('shape.keys', () => {
  const e = new Element('e', 'http://x');
  const a = new Attribute('a', 'v');
  const t = new Text('t');
  const n = new Nodes([]);
  const el = new Elements([]);
  const d = new Document(new Element('r'));
  return [
    `Element=${Object.keys(e).join(',')}`,
    `Attribute=${Object.keys(a).join(',')}`,
    `Text=${Object.keys(t).join(',')}`,
    `Nodes=${Object.keys(n).join(',')}`,
    `Elements=${Object.keys(el).join(',')}`,
    `Document=${Object.keys(d).join(',')}`,
  ].join('~');
});

safe('shape.attrCtorKeys', () => {
  const two = new Attribute('p:a', 'v');
  const three = new Attribute('p:a', 'http://p', 'v');
  return `two=${Object.keys(two).join(',')}~three=${Object.keys(three).join(',')}`;
});

safe('shape.publicSurface', () => {
  const names = (o) => Object.getOwnPropertyNames(o).sort().join(',');
  return [
    `Element=${names(Element.prototype)}`,
    `Attribute=${names(Attribute.prototype)}`,
    `Text=${names(Text.prototype)}`,
    `Nodes=${names(Nodes.prototype)}`,
    `Elements=${names(Elements.prototype)}`,
    `Document=${names(Document.prototype)}`,
    `Builder=${names(Builder.prototype)}`,
    `exports=${Object.keys(X).sort().join(',')}`,
    `arity=Element:${Element.length},Attribute:${Attribute.length},Text:${Text.length},Nodes:${Nodes.length},Elements:${Elements.length},Document:${Document.length}`,
  ].join('~');
});

// _xomParent must remain publicly reachable (charter parity note)
safe('shape.xomParentPublic', () => {
  const p = new Element('p');
  const c = new Element('c');
  p.appendChild(c);
  return `direct=${c._xomParent === p}|typeofDesc=${typeof c._xomParent}|inKeys=${Object.keys(c).includes('_xomParent')}`;
});

/* --------------------------------------------------- XmlBase-level round trip */

const XB = await import(path.join(distDir, 'xml/XmlBase.js'));
const { XmlBase } = XB;

for (const [name, file] of inputs.slice(0, 10)) {
  const xml = readFileSync(file, 'utf8');
  safe(`${name}#xmlbase`, () => {
    const b = new XmlBase(new Builder().build(xml));
    const out = [`isEmpty=${b.isEmpty?.()}`, `valid=${b.isValid?.()}`, `xml=${b.toXML().length}`];
    out.push(`hash=${createHash('sha256').update(b.toXML()).digest('hex').slice(0, 16)}`);
    return out.join('~');
  });
  safe(`${name}#xmlbase.fixDupIds`, () => {
    const b = new XmlBase(new Builder().build(xml));
    const n = b.fixDuplicateIds();
    // canonicalize generated uuids so the transcript is comparable
    const canon = b.toXML().replace(/meico_[0-9a-f-]{36}/g, 'meico_UUID');
    return `n=${n}|${createHash('sha256').update(canon).digest('hex').slice(0, 24)}|len=${canon.length}`;
  });
  safe(`${name}#xmlbase.removeAllAttributes`, () => {
    const b = new XmlBase(new Builder().build(xml));
    const n = b.removeAllAttributes('xml:id');
    return `n=${n}|hash=${createHash('sha256').update(b.toXML()).digest('hex').slice(0, 24)}|len=${b.toXML().length}`;
  });
  safe(`${name}#xmlbase.removeAllElements`, () => {
    const b = new XmlBase(new Builder().build(xml));
    const results = [];
    for (const ln of ['note', 'rest', 'staff', 'measure', 'nonexistent']) {
      const b2 = new XmlBase(new Builder().build(xml));
      const n = b2.removeAllElements(ln);
      results.push(`${ln}=${n}:${createHash('sha256').update(b2.toXML()).digest('hex').slice(0, 16)}:${b2.toXML().length}`);
    }
    return results.join('~');
  });
}

/* ------------------------------------------------------- integration pipeline */
// The real proof: run the actual MEI -> MSM/MPM conversion on both builds and hash
// the serialized output, exactly as the integration suite drives it.
try {
  await import(path.join(distDir, 'mpm/Mpm.js')); // circular-import hazard: Mpm first
  const { Mei } = await import(path.join(distDir, 'mei/Mei.js'));
  const { Mei2MsmMpmConverter } = await import(path.join(distDir, 'mei/Mei2MsmMpmConverter.js'));
  const canon = (s) => s.replace(/meico_[0-9a-f-]{36}/g, 'meico_UUID');

  for (const [name, file] of inputs.filter(([n]) => n.startsWith('mei/'))) {
    safe(`${name}#pipeline`, () => {
      const xml = readFileSync(file, 'utf8');
      const mei = Mei.fromXml(xml);
      mei.setFile(path.basename(file));
      const result = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
      const msms = result.getKey();
      const mpms = result.getValue();
      const parts = [`msmN=${msms.length}`, `mpmN=${mpms.length}`];
      for (const m of msms) {
        const s = canon(m.toXML());
        parts.push(`msm:${createHash('sha256').update(s).digest('hex')}:${s.length}`);
      }
      for (const m of mpms) {
        const s = canon(m.toXML());
        parts.push(`mpm:${createHash('sha256').update(s).digest('hex')}:${s.length}`);
      }
      return parts.join('~');
    });

    // expressive MIDI: the end-to-end target of the whole port
    safe(`${name}#pipeline.midi`, () => {
      const xml = readFileSync(file, 'utf8');
      const mei = Mei.fromXml(xml);
      mei.setFile(path.basename(file));
      const result = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
      const msm = result.getKey()[0];
      const mpm = result.getValue()[0];
      const perf = mpm.getAllPerformances()[0];
      if (!perf) return 'no-performance';
      const midi = msm.exportExpressiveMidi(perf, true);
      if (!midi) return 'null-midi';
      const bytes = midi.getBytes ? midi.getBytes() : null;
      if (!bytes) return 'no-bytes-api';
      return `${createHash('sha256').update(Buffer.from(bytes)).digest('hex')}:${bytes.length}`;
    });
  }
} catch (e) {
  rec('PIPELINE_IMPORT', `THREW:${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
}

/* -------------------------------------------------------------------- output */

const transcript = results.map(([k, v]) => `${k} ${v}`).join('');
const sha = createHash('sha256').update(transcript).digest('hex');
writeFileSync(
  outFile,
  JSON.stringify({ dist: distDir, count: results.length, sha, results }, null, 0),
);
console.log(`checks=${results.length} sha256=${sha}`);

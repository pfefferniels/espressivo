/**
 * T5 verifier probe round 2 — closes two gaps from round 1:
 *  (a) real MIDI event bytes end-to-end (round 1 hit "no-bytes-api")
 *  (b) per-form Attribute construction, so one throwing form cannot mask the rest
 * Usage: node probe2.mjs <dist> <out.json>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const distDir = process.argv[2];
const outFile = process.argv[3];
const PROJ = '/Users/nielspfeffer/Projects/meico-ts';

const X = await import(path.join(distDir, 'xml/XomTypes.js'));
const { Builder, Element, Attribute, Text } = X;

const results = [];
const rec = (l, v) => results.push([l, String(v)]);
const safe = (l, fn) => {
  try {
    rec(l, fn());
  } catch (e) {
    rec(l, `THREW:${e && e.constructor ? e.constructor.name : '?'}:${e && e.message}`);
  }
};

/* (b) per-form Attribute construction — each isolated */
const forms = [
  ['plain', 'v'],
  ['p:pre', 'v'],
  ['a:b:c', 'v'],
  [':x', 'v'],
  ['x:', 'v'],
  ['', 'v'],
  ['a', ''],
  ['xml:id', 'http://www.w3.org/XML/1998/namespace', 'i1'],
  ['ns:n', 'http://ns', 'v'],
  ['n', '', 'v'],
  ['a:b:c', 'http://ns', 'v'],
  [':x', 'http://ns', 'v'],
  ['x:', 'http://ns', 'v'],
  ['', 'http://ns', 'v'],
  ['p:a', 'http://ns', ''],
  ['weird name', 'v'],
  ['ä', 'v'],
];
forms.forEach((f, i) => {
  safe(`attrForm[${i}:${f.join('|')}]`, () => {
    const a = f.length === 2 ? new Attribute(f[0], f[1]) : new Attribute(f[0], f[1], f[2]);
    const c = a.copy();
    return `qn=${a.getQualifiedName()}|ln=${a.getLocalName()}|pfx=${a.getNamespacePrefix()}|uri=${a.getNamespaceURI()}|val=${a.getValue()}|xml=${a.toXML()}|copy=${c.toXML()}|keys=${Object.keys(a).join(',')}`;
  });
  // and the same form attached to an element, so the xmlns emission rule is exercised
  safe(`attrFormOnElem[${i}:${f.join('|')}]`, () => {
    const e = new Element('host', 'http://host');
    const a = f.length === 2 ? new Attribute(f[0], f[1]) : new Attribute(f[0], f[1], f[2]);
    e.addAttribute(a);
    return e.toXML();
  });
  safe(`attrFormOnPlainElem[${i}:${f.join('|')}]`, () => {
    const e = new Element('host');
    const a = f.length === 2 ? new Attribute(f[0], f[1]) : new Attribute(f[0], f[1], f[2]);
    e.addAttribute(a);
    return `${e.toXML()}|removeThenXml=${(() => {
      e.removeAttribute(a);
      return e.toXML();
    })()}`;
  });
});

/* (a) real MIDI events end-to-end */
try {
  await import(path.join(distDir, 'mpm/Mpm.js'));
  const { Mei } = await import(path.join(distDir, 'mei/Mei.js'));
  const { Mei2MsmMpmConverter } = await import(path.join(distDir, 'mei/Mei2MsmMpmConverter.js'));
  const meiDir = path.join(PROJ, 'tests/integration/fixtures/mei');
  const meiFiles = readdirSync(meiDir)
    .filter((f) => f.endsWith('.mei'))
    .sort();

  const dumpEvents = (midi) => {
    const out = [];
    for (const track of midi.getSequence().getTracks()) {
      const evs = [];
      for (let i = 0; i < track.size(); i++) {
        const ev = track.get(i);
        const msg = ev.getMessage();
        const bytes = msg.getMessage ? Array.from(msg.getMessage()) : [];
        evs.push(`${ev.getTick()}:${bytes.join('.')}`);
      }
      out.push(evs.join(';'));
    }
    return out.join('||');
  };

  for (const f of meiFiles) {
    for (const expressive of [true, false]) {
      safe(`midi[${f}|expressive=${expressive}]`, () => {
        const mei = Mei.fromXml(readFileSync(path.join(meiDir, f), 'utf8'));
        mei.setFile(f);
        const result = new Mei2MsmMpmConverter(720, true, false, true).convert(mei);
        const msm = result.getKey()[0];
        const mpm = result.getValue()[0];
        const perf = mpm.getAllPerformances()[0];
        if (!perf) return 'no-performance';
        const midi = expressive ? msm.exportExpressiveMidi(perf, true) : msm.exportMidi(true);
        if (!midi) return 'null-midi';
        const dump = dumpEvents(midi);
        return `ntracks=${midi.getSequence().getTracks().length}|len=${dump.length}|sha=${createHash('sha256').update(dump).digest('hex')}`;
      });
    }
  }
} catch (e) {
  rec('MIDI_IMPORT', `THREW:${e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e}`);
}

const transcript = results.map(([k, v]) => `${k} ${v}`).join('');
const sha = createHash('sha256').update(transcript).digest('hex');
writeFileSync(outFile, JSON.stringify({ dist: distDir, count: results.length, sha, results }, null, 0));
console.log(`checks=${results.length} sha256=${sha}`);

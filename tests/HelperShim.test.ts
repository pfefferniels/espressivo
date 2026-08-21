import { describe, it, expect } from 'vitest';
import { Helper, Meico, VERSION } from '../src/index.js';
import * as tree from '../src/xml/tree.js';
import * as ids from '../src/xml/ids.js';
import * as prettyPrint from '../src/xml/prettyPrint.js';
import * as pitch from '../src/music/pitch.js';
import * as duration from '../src/music/duration.js';
import * as text from '../src/music/text.js';
import * as dateMap from '../src/msm/dateMap.js';
import * as mpmNoteIds from '../src/mei/mpmNoteIds.js';
import { Element, Attribute } from '../src/xml/XomTypes.js';

// `mei/Helper` is dissolved into nine modules (ARCHITECTURE.md §8.2); the `Helper` object in
// `index.ts` is the compatibility shim for its published API. These tests pin what that shim
// promises: every original public static is still reachable under its original name, and still
// does what it did.

/**
 * The 34 public statics the shim promises, in `mei/Helper`'s declaration order.
 *
 * Java's `Helper` carried 41. The seven the shim does not promise — the two
 * `validateAgainstSchema*`, `writeStringToFile`, the two `xslTransform*` and the two
 * `makeXslt*Transformer` — were stubs that could not do their job, and ARCHITECTURE.md §8.10
 * removes them rather than keep them unimplemented.
 */
const PUBLIC_STATICS = [
  'getFirstChildElement',
  'getAllChildElements',
  'getAllDescendantsByName',
  'getAllDescendantsWithAttribute',
  'getNextSiblingElement',
  'getPreviousSiblingElement',
  'getAllPreviousSiblingElements',
  'addToMap',
  'extractAllIntegersFromString',
  'cloneElement',
  'getAttribute',
  'getAttributeValue',
  'addUUID',
  'copyId',
  'copyIdNoNs',
  'getParentElement',
  'getClosest',
  'getClosestByAttr',
  'updateMpmNoteidsAfterResolvingRepetitions',
  'duration2decimal',
  'duration2word',
  'pulseDuration2decimal',
  'decimalDuration2HtmlUnicode',
  'accidString2decimal',
  'accidDecimal2String',
  'accidString2word',
  'accidDecimal2unicodeString',
  'pname2midi',
  'midi2pname',
  'midi2PnameAndAccid',
  'midi2PnameAccidOct',
  'getFilenameWithoutExtension',
  'prettyXml',
  'addToListAttribute',
] as const;

describe('Helper compatibility shim', () => {
  it('still exposes all 34 surviving public statics, and nothing else', () => {
    expect(PUBLIC_STATICS.length).toBe(34);
    for (const name of PUBLIC_STATICS) {
      expect(typeof (Helper as Record<string, unknown>)[name], name).toBe('function');
    }
    expect(Object.keys(Helper).sort()).toEqual([...PUBLIC_STATICS].sort());
  });

  it('delegates by identity for every member the move did not rename', () => {
    const identity: Record<string, unknown> = {
      getAllDescendantsByName: tree.getAllDescendantsByName,
      getAllDescendantsWithAttribute: tree.getAllDescendantsWithAttribute,
      getNextSiblingElement: tree.getNextSiblingElement,
      getPreviousSiblingElement: tree.getPreviousSiblingElement,
      getAllPreviousSiblingElements: tree.getAllPreviousSiblingElements,
      cloneElement: tree.cloneElement,
      getAttributeValue: tree.getAttributeValue,
      getClosest: tree.getClosest,
      getClosestByAttr: tree.getClosestByAttr,
      addUUID: ids.addUUID,
      copyId: ids.copyId,
      copyIdNoNs: ids.copyIdNoNs,
      addToListAttribute: ids.addToListAttribute,
      prettyXml: prettyPrint.prettyXml,
      addToMap: dateMap.addToMap,
      extractAllIntegersFromString: text.extractAllIntegersFromString,
      getFilenameWithoutExtension: text.getFilenameWithoutExtension,
      duration2decimal: duration.duration2decimal,
      duration2word: duration.duration2word,
      pulseDuration2decimal: duration.pulseDuration2decimal,
      decimalDuration2HtmlUnicode: duration.decimalDuration2HtmlUnicode,
      accidString2decimal: pitch.accidString2decimal,
      accidDecimal2String: pitch.accidDecimal2String,
      accidString2word: pitch.accidString2word,
      accidDecimal2unicodeString: pitch.accidDecimal2unicodeString,
      pname2midi: pitch.pname2midi,
      midi2pname: pitch.midi2pname,
      midi2PnameAndAccid: pitch.midi2PnameAndAccid,
      midi2PnameAccidOct: pitch.midi2PnameAccidOct,
      updateMpmNoteidsAfterResolvingRepetitions:
        mpmNoteIds.updateMpmNoteidsAfterResolvingRepetitions,
    };
    expect(Object.keys(identity).length).toBe(30);
    for (const [name, fn] of Object.entries(identity)) {
      expect((Helper as Record<string, unknown>)[name], name).toBe(fn);
    }
  });

  it('delegates the three renamed navigation members by identity', () => {
    expect(Helper.getFirstChildElement).toBe(tree.firstChildElement);
    expect(Helper.getAttribute).toBe(tree.attribute);
    expect(Helper.getParentElement).toBe(tree.parentElement);
  });

  it('keeps getAllChildElements at its pre-N2b contract, guards included', () => {
    const note = new Element('note');
    const layer = new Element('layer');
    layer.appendChild(note);
    layer.appendChild(new Element('rest'));

    // both original overloads, original argument order
    expect(Helper.getAllChildElements(layer)!.length).toBe(2);
    expect(Helper.getAllChildElements('note', layer)!.length).toBe(1);

    // the two guards RULE N2b deleted from the module function survive on the shim
    expect(Helper.getAllChildElements(null as unknown as Element)).toBeNull();
    expect(Helper.getAllChildElements('note', null as unknown as Element)).toBeNull();
    expect(Helper.getAllChildElements('', layer)).toBeNull();

    // the module function it delegates to has the new contract
    expect(tree.allChildElements(layer, 'note').length).toBe(1);
  });

  it('routes a real call through to the moved implementation', () => {
    const note = new Element('note');
    note.addAttribute(new Attribute('pname', 'c'));
    expect(Helper.getAttributeValue('pname', note)).toBe('c');
    expect(Helper.duration2decimal('4')).toBe(0.25);
    expect(Helper.pname2midi('c')).toBe(0);
  });
});

describe('Meico.version (RULE M6)', () => {
  it('still resolves, and is the serialization-visible VERSION constant', () => {
    expect(Meico.version).toBe(VERSION);
    expect(VERSION).toBe('0.11.2');
  });
});

import { describe, it, expect } from 'vitest';
import { Goto } from '../../src/msm/Goto.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * Build a sequencingMap containing the given children, so that goto elements
 * have a parent to resolve their target.id against (Goto.java:62 queries
 * gt.getParent()).
 */
function sequencingMap(...children: Element[]): Element {
  const sm = new Element('sequencingMap');
  for (const c of children) sm.appendChild(c);
  return sm;
}

function marker(date: string, id: string | null): Element {
  const m = new Element('marker');
  m.addAttribute(new Attribute('date', date));
  if (id !== null) m.addAttribute(new Attribute('xml:id', XML_NS, id));
  return m;
}

function gotoElement(atts: Record<string, string>): Element {
  const gt = new Element('goto');
  for (const [name, value] of Object.entries(atts)) gt.addAttribute(new Attribute(name, value));
  return gt;
}

describe('Goto', () => {
  // ---------------------------------------------------------------
  // Construction from an XML element (Goto.java:49-82)
  // ---------------------------------------------------------------
  describe('constructor from element', () => {
    it('should read date and target.date', () => {
      const gt = gotoElement({ date: '1440', 'target.date': '0' });
      sequencingMap(gt);

      const g = new Goto(gt);
      expect(g.date).toBe(1440);
      expect(g.targetDate).toBe(0);
    });

    it('should default the activity to "1" when the attribute is absent', () => {
      const gt = gotoElement({ date: '1440', 'target.date': '0' });
      sequencingMap(gt);

      expect(new Goto(gt).activity).toBe('1');
    });

    it('should read the activity attribute when present', () => {
      const gt = gotoElement({ date: '1440', 'target.date': '0', activity: '10' });
      sequencingMap(gt);

      expect(new Goto(gt).activity).toBe('10');
    });

    it('should leave source null (only the parameter constructor sets it)', () => {
      const gt = gotoElement({ date: '1440', 'target.date': '0' });
      sequencingMap(gt);

      expect(new Goto(gt).source).toBeNull();
    });

    it('should start with counter 0 and empty targetId when no target.id is given', () => {
      const gt = gotoElement({ date: '1440', 'target.date': '0' });
      sequencingMap(gt);

      const g = new Goto(gt);
      expect(g.counter).toBe(0);
      expect(g.targetId).toBe('');
      expect(g.target).toBeNull();
    });

    it('should throw when the date attribute is missing', () => {
      const gt = gotoElement({ 'target.date': '0' });
      sequencingMap(gt);

      expect(() => new Goto(gt)).toThrow(/Missing attribute date/);
    });

    it('should parse fractional dates', () => {
      const gt = gotoElement({ date: '1440.5', 'target.date': '360.25' });
      sequencingMap(gt);

      const g = new Goto(gt);
      expect(g.date).toBeCloseTo(1440.5, 10);
      expect(g.targetDate).toBeCloseTo(360.25, 10);
    });
  });

  // ---------------------------------------------------------------
  // target.id resolution (Goto.java:56-64)
  // ---------------------------------------------------------------
  describe('target.id resolution', () => {
    it('should strip a leading # and resolve the target element among its siblings', () => {
      const target = marker('480', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': '#rptstart1' });
      sequencingMap(target, gt);

      const g = new Goto(gt);
      expect(g.targetId).toBe('rptstart1');
      expect(g.target).not.toBeNull();
      expect(g.target!.getLocalName()).toBe('marker');
      expect(g.target!.getAttributeValue('date')).toBe('480');
    });

    it('should accept a target.id without the leading #', () => {
      const target = marker('480', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': 'rptstart1' });
      sequencingMap(target, gt);

      const g = new Goto(gt);
      expect(g.targetId).toBe('rptstart1');
      expect(g.target).not.toBeNull();
    });

    it('should trim surrounding whitespace from target.id', () => {
      const target = marker('480', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': '  #rptstart1  ' });
      sequencingMap(target, gt);

      const g = new Goto(gt);
      expect(g.targetId).toBe('rptstart1');
      expect(g.target).not.toBeNull();
    });

    it('should take the target date from the target element when target.date is absent', () => {
      const target = marker('480', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': '#rptstart1' });
      sequencingMap(target, gt);

      expect(new Goto(gt).targetDate).toBe(480);
    });

    it('should prefer an explicit target.date over the target element date', () => {
      const target = marker('480', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': '#rptstart1', 'target.date': '0' });
      sequencingMap(target, gt);

      const g = new Goto(gt);
      expect(g.target).not.toBeNull(); // the target is still resolved
      expect(g.targetDate).toBe(0); // but target.date wins (Goto.java:77-79)
    });

    it('should ignore an empty target.id', () => {
      const gt = gotoElement({ date: '1440', 'target.id': '', 'target.date': '0' });
      sequencingMap(gt);

      const g = new Goto(gt);
      expect(g.targetId).toBe('');
      expect(g.target).toBeNull();
    });

    it('should keep target null when no sibling carries the referenced xml:id', () => {
      const gt = gotoElement({ date: '1440', 'target.id': '#doesNotExist', 'target.date': '0' });
      sequencingMap(marker('480', 'someOtherId'), gt);

      const g = new Goto(gt);
      expect(g.targetId).toBe('doesNotExist');
      expect(g.target).toBeNull();
      expect(g.targetDate).toBe(0);
    });

    it('should throw when neither target.date nor a resolvable target.id is given', () => {
      const gt = gotoElement({ date: '1440', 'target.id': '#doesNotExist' });
      sequencingMap(gt);

      expect(() => new Goto(gt)).toThrow(/Missing attribute target.date or a valid target.id/);
    });

    it('should throw when neither target.date nor target.id is given at all', () => {
      const gt = gotoElement({ date: '1440' });
      sequencingMap(gt);

      expect(() => new Goto(gt)).toThrow(/Missing attribute target.date or a valid target.id/);
    });

    it('should throw when the resolved target has no date attribute (Goto.java:71-75)', () => {
      const target = marker('0', 'rptstart1');
      target.removeAttribute(target.getAttribute('date')!);
      const gt = gotoElement({ date: '1440', 'target.id': '#rptstart1' });
      sequencingMap(target, gt);

      expect(() => new Goto(gt)).toThrow(/has no valid attribute date/);
    });

    it('should throw when the resolved target has an unparsable date attribute', () => {
      const target = marker('not-a-number', 'rptstart1');
      const gt = gotoElement({ date: '1440', 'target.id': '#rptstart1' });
      sequencingMap(target, gt);

      expect(() => new Goto(gt)).toThrow(/has no valid attribute date/);
    });

    it('should throw when the date attribute is unparsable', () => {
      const gt = gotoElement({ date: 'not-a-number', 'target.date': '0' });
      sequencingMap(gt);

      expect(() => new Goto(gt)).toThrow();
    });

    it('should throw when target.date is unparsable', () => {
      const gt = gotoElement({ date: '1440', 'target.date': 'not-a-number' });
      sequencingMap(gt);

      expect(() => new Goto(gt)).toThrow();
    });

    it('should resolve a target that is nested deeper than a direct sibling', () => {
      const wrapper = new Element('section');
      wrapper.appendChild(marker('960', 'nestedTarget'));
      const gt = gotoElement({ date: '1920', 'target.id': '#nestedTarget' });
      sequencingMap(wrapper, gt);

      const g = new Goto(gt);
      expect(g.target).not.toBeNull();
      expect(g.targetDate).toBe(960);
    });
  });

  // ---------------------------------------------------------------
  // Parameter constructor (Goto.java:32-43)
  // ---------------------------------------------------------------
  describe('constructor from parameters', () => {
    it('should assign all fields', () => {
      const source = new Element('goto');
      const g = new Goto(1440, 0, 'rptstart1', '10', source);

      expect(g.date).toBe(1440);
      expect(g.targetDate).toBe(0);
      expect(g.targetId).toBe('rptstart1');
      expect(g.activity).toBe('10');
      expect(g.source).toBe(source);
      expect(g.target).toBeNull();
      expect(g.counter).toBe(0);
    });

    it('should keep targetId "" when null is passed', () => {
      const g = new Goto(1440, 0, null, '1', new Element('goto'));
      expect(g.targetId).toBe('');
    });

    it('should reproduce the Java off-by-one when the id starts with # (Goto.java:39-41)', () => {
      // Java does substring(1, length()-1), which drops the last character
      // as well as the leading '#'. The port mirrors this deliberately.
      const g = new Goto(1440, 0, '#rptstart1', '1', new Element('goto'));
      expect(g.targetId).toBe('rptstart');
    });
  });

  // ---------------------------------------------------------------
  // isActive (Goto.java:102-110)
  // ---------------------------------------------------------------
  describe('isActive', () => {
    function makeGoto(activity: string): Goto {
      return new Goto(1440, 0, null, activity, new Element('goto'));
    }

    it('should be active once for the default activity "1"', () => {
      const g = makeGoto('1');
      expect(g.isActive()).toBe(true);
      expect(g.isActive()).toBe(false);
    });

    it('should increment the counter on every call, active or not', () => {
      const g = makeGoto('1');
      g.isActive();
      g.isActive();
      g.isActive();
      expect(g.counter).toBe(3);
    });

    it('should follow the activity string "10" (take the repeat once, then skip)', () => {
      const g = makeGoto('10');
      expect(g.isActive()).toBe(true);
      expect(g.isActive()).toBe(false);
    });

    it('should follow the activity string "01" (skip first, take second)', () => {
      const g = makeGoto('01');
      expect(g.isActive()).toBe(false);
      expect(g.isActive()).toBe(true);
    });

    it('should follow a longer activity string position by position', () => {
      const g = makeGoto('1101');
      expect([g.isActive(), g.isActive(), g.isActive(), g.isActive()]).toEqual([
        true,
        true,
        false,
        true,
      ]);
    });

    it('should be inactive once the counter runs past the activity string', () => {
      const g = makeGoto('11');
      g.isActive();
      g.isActive();
      expect(g.isActive()).toBe(false);
      expect(g.counter).toBe(3);
    });

    it('should never be active for an empty activity string', () => {
      const g = makeGoto('');
      expect(g.isActive()).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // toElement (Goto.java:88-95)
  // ---------------------------------------------------------------
  describe('toElement', () => {
    it('should create a goto element carrying all four attributes', () => {
      const g = new Goto(1440, 0, 'rptstart1', '10', new Element('goto'));
      const e = g.toElement();

      expect(e.getLocalName()).toBe('goto');
      expect(parseFloat(e.getAttributeValue('date')!)).toBe(1440);
      expect(parseFloat(e.getAttributeValue('target.date')!)).toBe(0);
      expect(e.getAttributeValue('activity')).toBe('10');
      expect(e.getAttributeValue('target.id')).toBe('#rptstart1');
    });

    it('should round-trip through the element constructor', () => {
      const original = new Goto(1440, 480, 'rptstart1', '10', new Element('goto'));
      const e = original.toElement();
      sequencingMap(marker('480', 'rptstart1'), e);

      const reparsed = new Goto(e);
      expect(reparsed.date).toBe(original.date);
      expect(reparsed.targetDate).toBe(original.targetDate);
      expect(reparsed.targetId).toBe(original.targetId);
      expect(reparsed.activity).toBe(original.activity);
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
// Mpm has to be imported before GenericStyle: Mpm -> Header -> ArticulationStyle -> GenericStyle
// is a cycle, and entering it at GenericStyle leaves the base class undefined for its subclasses.
import { Mpm } from '../../../../src/mpm/Mpm.js';
import { GenericStyle } from '../../../../src/mpm/elements/styles/GenericStyle.js';
import { TempoDef } from '../../../../src/mpm/elements/styles/defs/TempoDef.js';
import { Element, Attribute } from '../../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/styles/GenericStyle.java
 */
function styleDefElement(attributes: Record<string, string>, children: Element[] = []): Element {
  const e = new Element('styleDef', Mpm.MPM_NAMESPACE);
  for (const [name, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(name, value));
  for (const c of children) e.appendChild(c);
  return e;
}

describe('GenericStyle', () => {
  describe('createGenericStyle', () => {
    it('creates an empty styleDef from a name', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      expect(gs.getName()).toBe('myStyle');
      expect(gs.getId()).toBeNull();
      expect(gs.size()).toBe(0);
      expect(gs.isEmpty()).toBe(true);
      expect(gs.getXml()!.getLocalName()).toBe('styleDef');
      expect(gs.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
      expect(gs.getXml()!.getAttributeValue('name')).toBe('myStyle');
    });

    it('accepts an id as second argument', () => {
      const gs = GenericStyle.createGenericStyle('myStyle', 'style-1')!;
      expect(gs.getId()).toBe('style-1');
      const idAtt = gs.getXml()!.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
      expect(idAtt!.getValue()).toBe('style-1');
    });

    it('creates a style from an existing element', () => {
      const xml = styleDefElement({ name: 'fromXml' });
      const gs = GenericStyle.createGenericStyle(xml)!;
      expect(gs.getXml()).toBe(xml);
      expect(gs.getName()).toBe('fromXml');
    });

    it('picks up an existing xml:id', () => {
      const xml = styleDefElement({ name: 'fromXml' });
      xml.addAttribute(new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', 'style-9'));
      expect(GenericStyle.createGenericStyle(xml)!.getId()).toBe('style-9');
    });

    it('returns null when the name attribute is missing', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(GenericStyle.createGenericStyle(styleDefElement({}))).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('returns null for a null element', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(GenericStyle.createGenericStyle(null as unknown as Element)).toBeNull();
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('ignores child elements it does not know about', () => {
      const xml = styleDefElement({ name: 'generic' }, [
        new Element('tempoDef', Mpm.MPM_NAMESPACE),
      ]);
      const gs = GenericStyle.createGenericStyle(xml)!;
      expect(gs.size()).toBe(0);
    });
  });

  describe('setName', () => {
    it('renames the styleDef in the object and in the xml', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      (gs as unknown as { setName(name: string): void }).setName('renamed');
      expect(gs.getName()).toBe('renamed');
      expect(gs.getXml()!.getAttributeValue('name')).toBe('renamed');
    });
  });

  describe('id handling', () => {
    it('replaces an existing id instead of adding a second attribute', () => {
      const gs = GenericStyle.createGenericStyle('myStyle', 'first')!;
      const count = gs.getXml()!.getAttributeCount();
      gs.setId('second');
      expect(gs.getId()).toBe('second');
      expect(gs.getXml()!.getAttributeCount()).toBe(count);
    });

    it('clears the id when set to null', () => {
      const gs = GenericStyle.createGenericStyle('myStyle', 'first')!;
      gs.setId(null);
      expect(gs.getId()).toBeNull();
    });

    it('tolerates clearing an id that was never set', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      gs.setId(null);
      expect(gs.getId()).toBeNull();
    });
  });

  describe('def management', () => {
    it('adds a def and appends its xml as a child', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      const td = TempoDef.createTempoDef('Allegro', 147.0)!;
      gs.addDef(td);

      expect(gs.size()).toBe(1);
      expect(gs.isEmpty()).toBe(false);
      expect(gs.getDef('Allegro')).toBe(td);
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0)).toBe(td.getXml());
    });

    it('replaces a def of the same name, in the map and in the xml', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      const first = TempoDef.createTempoDef('Allegro', 147.0)!;
      const second = TempoDef.createTempoDef('Allegro', 132.0)!;
      gs.addDef(first);
      gs.addDef(second);

      expect(gs.size()).toBe(1);
      expect(gs.getDef('Allegro')).toBe(second);
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0)).toBe(second.getXml());
    });

    it('keeps defs with different names side by side', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      gs.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
      gs.addDef(TempoDef.createTempoDef('Largo', 50.0)!);
      expect(gs.size()).toBe(2);
      expect(gs.getAllDefs().size).toBe(2);
      expect(gs.getXml()!.getChildElements().size()).toBe(2);
    });

    it('reports undefined for an unknown def name', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      expect(gs.getDef('nope')).toBeUndefined();
    });

    it('logs and does nothing when asked to add null', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      gs.addDef(null as never);
      expect(gs.size()).toBe(0);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('removes a def from the map and the xml', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      gs.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
      gs.addDef(TempoDef.createTempoDef('Largo', 50.0)!);
      gs.removeDef('Allegro');

      expect(gs.size()).toBe(1);
      expect(gs.getDef('Allegro')).toBeUndefined();
      expect(gs.getXml()!.getChildElements().size()).toBe(1);
      expect(gs.getXml()!.getChildElements().get(0).getAttributeValue('name')).toBe('Largo');
    });

    it('ignores removal of an unknown def name', () => {
      const gs = GenericStyle.createGenericStyle('myStyle')!;
      gs.addDef(TempoDef.createTempoDef('Allegro', 147.0)!);
      gs.removeDef('nope');
      expect(gs.size()).toBe(1);
    });
  });
});

import { describe, it, expect } from 'vitest';
import { AbstractXmlSubtree } from '../../src/xml/AbstractXmlSubtree.js';
import { Element } from '../../src/xml/XomTypes.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';

/**
 * A minimal subclass, so the state *before* `parseData` — which no factory can hand out,
 * because every one of them parses inside its constructor — is reachable at all. That
 * state is the whole reason {@link AbstractXmlSubtree.getXmlOrNull} exists.
 */
class Probe extends AbstractXmlSubtree {
  protected parseData(xml: Element): void {
    this.setXml(xml);
  }
  parse(xml: Element): void {
    this.parseData(xml);
  }
}

describe('AbstractXmlSubtree', () => {
  it('getXmlOrNull reports the un-parsed state that getXml declares away', () => {
    const probe = new Probe();
    expect(probe.getXmlOrNull()).toBeNull();
  });

  it('getXml and getXmlOrNull return the very element parseData was given', () => {
    const probe = new Probe();
    const element = new Element('tempoMap');
    probe.parse(element);
    expect(probe.getXml()).toBe(element);
    expect(probe.getXmlOrNull()).toBe(element);
  });

  it('toXml is empty before parseData and serializes the element afterwards', () => {
    const probe = new Probe();
    expect(probe.toXml()).toBe('');
    probe.parse(new Element('tempoMap'));
    expect(probe.toXml()).toContain('tempoMap');
  });

  it('a subtree reached through a factory always has its element (RULE N3)', () => {
    const map = GenericMap.createGenericMap('tempoMap')!;
    expect(map.getXmlOrNull()).not.toBeNull();
    expect(map.getXml()).toBe(map.getXmlOrNull());
  });
});

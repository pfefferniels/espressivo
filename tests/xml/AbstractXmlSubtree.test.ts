import { describe, it, expect } from 'vitest';
import { okValue } from '../support/result.js';
import { AbstractXmlSubtree } from '../../src/xml/AbstractXmlSubtree.js';
import { MissingNodeError } from '../../src/xml/errors.js';
import { Builder, Element } from '../../src/xml/XomTypes.js';
import { GenericMap } from '../../src/mpm/elements/maps/GenericMap.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

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

/** As {@link Probe}, but it also picks up the `xml:id` the way every real subclass does. */
class IdProbe extends AbstractXmlSubtree {
  protected parseData(xml: Element): void {
    this.setXml(xml);
    this.id = xml.getAttribute('id', XML_NS);
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

  it('getXml names the un-parsed state instead of handing back a null typed as Element', () => {
    const probe = new Probe();
    expect(() => probe.getXml()).toThrow(MissingNodeError);
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
    const map = okValue(GenericMap.createGenericMap('tempoMap'));
    expect(map.getXmlOrNull()).not.toBeNull();
    expect(map.getXml()).toBe(map.getXmlOrNull());
  });

  it('setId(null) removes an xml:id that came out of the parser', () => {
    const probe = new IdProbe();
    probe.parse(new Builder().build('<tempoMap xml:id="tm-1" foo="bar"/>').getRootElement());
    expect(probe.getId()).toBe('tm-1');

    probe.setId(null);

    expect(probe.getId()).toBeNull();
    expect(probe.toXml()).toBe('<tempoMap foo="bar" />');
  });
});

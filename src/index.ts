// meico - MEI Converter (TypeScript port)
// Core XML types
export { Element, Document, Attribute, Nodes, Elements, Text, Builder, ParsingException, ValidityException } from './xml/XomTypes.js';
export { XmlBase } from './xml/XmlBase.js';
export { AbstractXmlSubtree } from './xml/AbstractXmlSubtree.js';

// MEI
export { Mei } from './mei/Mei.js';
export { Helper } from './mei/Helper.js';
export { Mei2MsmMpmConverter } from './mei/Mei2MsmMpmConverter.js';
export { Mei2MusicXmlConverter } from './mei/Mei2MusicXmlConverter.js';

// MSM
export { AbstractMsm } from './msm/AbstractMsm.js';
export { Msm } from './msm/Msm.js';
export { Goto } from './msm/Goto.js';

// MPM
export { Mpm } from './mpm/Mpm.js';

// MIDI
export { Midi } from './midi/Midi.js';
export { EventMaker } from './midi/EventMaker.js';
export { InstrumentsDictionary } from './midi/InstrumentsDictionary.js';
export { Midi2MsmConverter } from './midi/Midi2MsmConverter.js';

// MusicXML
export { MusicXml } from './musicxml/MusicXml.js';
export { MusicXml2MsmMpmConverter } from './musicxml/MusicXml2MsmMpmConverter.js';

// Audio
export { Audio } from './audio/Audio.js';

// SVG
export { Svg } from './svg/Svg.js';
export { SvgCollection } from './svg/SvgCollection.js';

// Pitches
export { Pitches } from './pitches/Pitches.js';
export { Key } from './pitches/Key.js';
export { FeatureVector } from './pitches/FeatureVector.js';
export { FeatureElement } from './pitches/FeatureElement.js';

// Supplementary
export { KeyValue } from './supplementary/KeyValue.js';
export { RandomNumberProvider } from './supplementary/RandomNumberProvider.js';
export { ColorCoding } from './supplementary/ColorCoding.js';
export { Meico } from './Meico.js';

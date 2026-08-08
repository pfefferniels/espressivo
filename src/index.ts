// meico - MEI Converter (TypeScript port)
//
// Scope: MEI / MSM+MPM => expressive MIDI. Format conversions (MusicXML,
// MIDI->MSM, MEI->MusicXML), audio, playback, chroma/pitches and SVG were
// removed in T3 as out of scope; see refactor/log.md.

// Core XML types
export {
  Element,
  Document,
  Attribute,
  Nodes,
  Elements,
  Text,
  Builder,
  ParsingException,
  ValidityException,
} from './xml/XomTypes.js';
export { XmlBase } from './xml/XmlBase.js';
export { AbstractXmlSubtree } from './xml/AbstractXmlSubtree.js';

// MEI
export { Mei } from './mei/Mei.js';
export { Helper } from './mei/Helper.js';
export { Mei2MsmMpmConverter } from './mei/Mei2MsmMpmConverter.js';

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

// Supplementary
export { KeyValue } from './supplementary/KeyValue.js';
export { RandomNumberProvider } from './supplementary/RandomNumberProvider.js';
export { Meico } from './Meico.js';

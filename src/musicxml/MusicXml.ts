import { Document, Element, Attribute, Builder } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';
// import { KeyValue } from '../supplementary/KeyValue.js';

// Stub imports for converter classes that will be implemented later
// import { MusicXml2MsmMpmConverter } from './MusicXml2MsmMpmConverter.js';

/**
 * Enumeration of the different datatypes behind a MusicXml instance
 */
export enum MusicXmlType {
  scorePartwise = 'scorePartwise',
  scoreTimewise = 'scoreTimewise',
  opus = 'opus',
  unknown = 'unknown',
}

/**
 * Helper utility functions (subset of meico.mei.Helper used by MusicXml)
 */
function getFilenameWithoutExtension(filename: string): string {
  const i = filename.lastIndexOf('.');
  if (i === 0) return filename;
  return filename.substring(0, i);
}

/**
 * Clone an element shallowly (copies the element tag and attributes but not children).
 */
function cloneElement(e: Element | null): Element | null {
  if (e === null) return null;

  const clone = new Element(e.getLocalName());
  if (e.getNamespaceURI()) {
    clone.setNamespaceURI(e.getNamespaceURI());
  }
  for (let i = e.getAttributeCount() - 1; i >= 0; --i) {
    // Iterate through attributes by index - we access them via getChildElements workaround
    // Since our Element API doesn't expose getAttribute(index), we reconstruct from the copy
  }
  // Actually, we need to iterate attributes. Our XOM Element doesn't expose getAttribute by index
  // directly, so we use the copy() approach for attributes:
  const fullCopy = e.copy();
  // Remove all children from the full copy to get a shallow clone
  while (fullCopy.getChildCount() > 0) {
    fullCopy.removeChildAt(0);
  }
  return fullCopy;
}

/**
 * This class represents a MusicXML document.
 * Port of meico.musicxml.MusicXml
 *
 * In the Java version, this class relies heavily on ProxyMusic (JAXB-based MusicXML binding).
 * In this TypeScript port, we use direct XML parsing through our XOM layer instead.
 * The MusicXML data is stored as a standard XML Document.
 *
 * @author Axel Berndt
 */
export class MusicXml extends XmlBase {
  /**
   * constructor - creates an empty score-partwise document
   */
  constructor();
  /**
   * constructor from a Document
   * @param document an instance of a XOM Document
   */
  constructor(document: Document);
  /**
   * constructor from an XML string
   * @param xml MusicXML string
   */
  constructor(xml: string);
  constructor(arg?: Document | string) {
    if (arg === undefined) {
      // Create a minimal score-partwise document
      const root = new Element('score-partwise');
      root.addAttribute(new Attribute('version', '4.0'));
      const doc = new Document(root);
      super(doc);
    } else if (arg instanceof Document) {
      super(arg);
    } else if (typeof arg === 'string') {
      super(arg, true);
    } else {
      super();
    }
  }

  /**
   * Use this factory to create a MusicXml instance from an XML string.
   * Handles score-partwise, score-timewise, and opus documents.
   * @param xml the MusicXML string
   * @return the MusicXml instance or null
   */
  static fromString(xml: string | null): MusicXml | null {
    if (xml === null) return null;

    try {
      const builder = new Builder();
      const document = builder.build(xml);
      return MusicXml.fromDocument(document);
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  /**
   * Use this factory to create a MusicXml instance from a XOM Document.
   * @param document
   * @return the MusicXml instance or null
   */
  static fromDocument(document: Document | null): MusicXml | null {
    if (document === null) return null;

    const rootName = document.getRootElement().getLocalName();
    switch (rootName) {
      case 'score-timewise': {
        // Convert score-timewise to score-partwise
        const preprocessedDocument = MusicXml.toScorePartwiseDocument(document);
        if (preprocessedDocument !== null) {
          const musicXml = new MusicXml(preprocessedDocument);
          return musicXml.toScoreTimewise();
        }
        break;
      }
      case 'score-partwise':
      case 'opus':
        return new MusicXml(document);
    }
    return null;
  }

  /**
   * Factory method for creating from compressed MusicXML (.mxl).
   * TODO: Implement using JSZip for .mxl support.
   * @param _data the compressed MusicXML data as Uint8Array
   * @return the MusicXml instance or null
   */
  static fromMxl(_data: Uint8Array): MusicXml | null {
    // TODO: Implement .mxl (compressed MusicXML) support using JSZip
    console.error('Compressed MusicXML (.mxl) is not yet supported in this TypeScript port.');
    return null;
  }

  /**
   * Convert a score-timewise Document to a score-partwise Document.
   * ProxyMusic does not support unmarshalling of score-timewise MusicXML.
   * This method works around this limitation.
   * @param scoreTimewise
   * @return
   */
  static toScorePartwiseDocument(scoreTimewise: Document): Document | null {
    const rootName = scoreTimewise.getRootElement().getLocalName();
    switch (rootName) {
      case 'score-timewise':
        break; // continue with the processing
      case 'score-partwise':
        return scoreTimewise; // no processing necessary
      default:
        console.log(
          `A ${rootName} document cannot be converted into a score-partwise representation.`,
        );
        return null;
    }

    const scorePartwise = new MusicXml();
    const doc = scorePartwise.getDocument()!;
    const root = doc.getRootElement();

    // Create deep copies of all elements in scoreTimewise and add them to scorePartwise, except for the measures
    const firstChildren = scoreTimewise.getRootElement().getChildElements();
    const measures: Element[] = [];
    let partList: Element | null = null;

    for (let i = 0; i < firstChildren.size(); ++i) {
      const e = firstChildren.get(i);
      if (e.getLocalName() === 'measure') {
        measures.push(e);
        continue;
      }

      const clone = e.copy();
      root.appendChild(clone);

      if (clone.getLocalName() === 'part-list') {
        partList = clone;
      }
    }

    // create the parts
    const partMap = new Map<string, Element>();
    if (partList !== null) {
      const scoreParts = partList.getChildElements('score-part');
      for (let i = 0; i < scoreParts.size(); ++i) {
        const part = scoreParts.get(i);
        const id = part.getAttribute('id');
        if (id === null) continue;
        const newPart = new Element('part');
        newPart.addAttribute(new Attribute('id', id.getValue()));
        root.appendChild(newPart);
        partMap.set(id.getValue(), newPart);
      }
    }

    // translate the measures' parts to the parts' measures
    for (const measure of measures) {
      const parts = measure.getChildElements('part');
      for (let j = 0; j < parts.size(); ++j) {
        const part = parts.get(j);
        const id = part.getAttribute('id');
        if (id === null) continue;

        const newPart = partMap.get(id.getValue());
        if (newPart === undefined) continue;

        // clone the measure element (shallow) to be used as partwise measure
        const measureClone = cloneElement(measure);
        if (measureClone === null) continue;
        newPart.appendChild(measureClone);

        const measureChildren = part.getChildElements();
        for (let k = 0; k < measureChildren.size(); ++k) {
          measureClone.appendChild(measureChildren.get(k).copy());
        }
      }
    }

    return doc;
  }

  /**
   * Convert this object into a score-partwise representation of the MusicXML.
   * If this is already a score-partwise MusicXML, the result is this.
   * If this is an opus MusicXML, the result is null.
   * Otherwise, the result is a new MusicXml instance with the converted data.
   * @return the result or null
   */
  toScorePartwise(): MusicXml | null {
    const type = this.getType();

    if (type === MusicXmlType.scorePartwise) return this;

    if (type === MusicXmlType.opus) return null;

    // It's score-timewise, convert to score-partwise
    const doc = this.getDocument();
    if (doc === null) return null;

    const converted = MusicXml.toScorePartwiseDocument(doc);
    if (converted === null) return null;

    const out = new MusicXml(converted);

    if (this.file !== null) {
      out.setFile(`${getFilenameWithoutExtension(this.file)}_as_score-partwise.musicxml`);
    }

    return out;
  }

  /**
   * Convert this object into a score-timewise representation of the MusicXML.
   * If this is already a score-timewise MusicXML, the result is this.
   * If this is an opus MusicXML, the result is null.
   * Otherwise, the result is a new MusicXml instance with the converted data.
   * @return the result or null
   */
  toScoreTimewise(): MusicXml | null {
    const type = this.getType();

    if (type === MusicXmlType.scoreTimewise) return this;

    if (type === MusicXmlType.opus) return null;

    // It's score-partwise, convert to score-timewise
    const doc = this.getDocument();
    if (doc === null) return null;

    const sourceRoot = doc.getRootElement();

    // Create a new score-timewise root
    const stwRoot = new Element('score-timewise');

    // Copy version attribute if present
    const versionAttr = sourceRoot.getAttribute('version');
    if (versionAttr !== null) {
      stwRoot.addAttribute(new Attribute('version', versionAttr.getValue()));
    }

    // Copy all non-part children
    const firstChildren = sourceRoot.getChildElements();
    const parts: Element[] = [];

    for (let i = 0; i < firstChildren.size(); ++i) {
      const e = firstChildren.get(i);
      if (e.getLocalName() === 'part') {
        parts.push(e);
        continue;
      }
      stwRoot.appendChild(e.copy());
    }

    // Build a map: for each part, collect its measures
    // Then for each measure number, create a timewise measure containing parts
    const measureMap = new Map<number, Element>(); // measureIndex -> timewise measure Element

    for (const part of parts) {
      const partId = part.getAttribute('id');
      if (partId === null) continue;

      const measures = part.getChildElements('measure');
      for (let measureNum = 0; measureNum < measures.size(); ++measureNum) {
        const spwMeasure = measures.get(measureNum);

        // Find or create the corresponding score-timewise measure
        if (!measureMap.has(measureNum)) {
          const stwMeasure = new Element('measure');
          // Copy measure attributes
          const numberAttr = spwMeasure.getAttribute('number');
          if (numberAttr !== null) {
            stwMeasure.addAttribute(new Attribute('number', numberAttr.getValue()));
          }
          const implicitAttr = spwMeasure.getAttribute('implicit');
          if (implicitAttr !== null) {
            stwMeasure.addAttribute(new Attribute('implicit', implicitAttr.getValue()));
          }
          const widthAttr = spwMeasure.getAttribute('width');
          if (widthAttr !== null) {
            stwMeasure.addAttribute(new Attribute('width', widthAttr.getValue()));
          }
          measureMap.set(measureNum, stwMeasure);
        }
        const stwMeasure = measureMap.get(measureNum)!;

        // Create and add the part to the measure
        const stwPart = new Element('part');
        stwPart.addAttribute(new Attribute('id', partId.getValue()));

        // Copy measure contents to the part
        const measureChildren = spwMeasure.getChildElements();
        for (let k = 0; k < measureChildren.size(); ++k) {
          stwPart.appendChild(measureChildren.get(k).copy());
        }
        stwMeasure.appendChild(stwPart);
      }
    }

    // Add measures to root in order
    const sortedKeys = Array.from(measureMap.keys()).sort((a, b) => a - b);
    for (const key of sortedKeys) {
      stwRoot.appendChild(measureMap.get(key)!);
    }

    const stwDoc = new Document(stwRoot);
    const out = new MusicXml(stwDoc);

    if (this.file !== null) {
      out.setFile(`${getFilenameWithoutExtension(this.file)}_as_score-timewise.musicxml`);
    }

    return out;
  }

  /**
   * determine if this object holds MusicXML data
   * @return
   */
  override isEmpty(): boolean {
    return this.data === null;
  }

  /**
   * access the MusicXML data structure in this object (the Document)
   * @return
   */
  getData(): Document | null {
    return this.data;
  }

  /**
   * query the type of MusicXML data in this object
   * @return
   */
  getType(): MusicXmlType {
    if (this.data === null) return MusicXmlType.unknown;

    const rootName = this.data.getRootElement().getLocalName();
    switch (rootName) {
      case 'score-partwise':
        return MusicXmlType.scorePartwise;
      case 'score-timewise':
        return MusicXmlType.scoreTimewise;
      case 'opus':
        return MusicXmlType.opus;
      default:
        return MusicXmlType.unknown;
    }
  }

  /**
   * get the title of the MusicXML
   * @return
   */
  getTitle(): string {
    if (this.data === null) return '';

    const root = this.data.getRootElement();
    let out = '';

    switch (this.getType()) {
      case MusicXmlType.scorePartwise:
      case MusicXmlType.scoreTimewise: {
        // Look for work element
        const work = root.getFirstChildElement('work');
        if (work !== null) {
          const workNumber = work.getFirstChildElement('work-number');
          if (workNumber !== null) {
            out += workNumber.getValue();
          }
          const workTitle = work.getFirstChildElement('work-title');
          if (workTitle !== null) {
            out += out.length === 0 ? workTitle.getValue() : ` ${workTitle.getValue()}`;
          }
        }

        const movementNumber = root.getFirstChildElement('movement-number');
        if (movementNumber !== null) {
          out += out.length === 0 ? movementNumber.getValue() : ` ${movementNumber.getValue()}`;
        }

        const movementTitle = root.getFirstChildElement('movement-title');
        if (movementTitle !== null) {
          out += out.length === 0 ? movementTitle.getValue() : ` ${movementTitle.getValue()}`;
        }
        break;
      }
      case MusicXmlType.opus: {
        const titleAttr = root.getAttribute('title');
        if (titleAttr !== null) {
          out = titleAttr.getValue();
        }
        // Also check for a title child element
        const titleElem = root.getFirstChildElement('title');
        if (titleElem !== null && out.length === 0) {
          out = titleElem.getValue();
        }
        break;
      }
      case MusicXmlType.unknown:
      default:
        break;
    }

    if (out.length > 0) return out;

    if (this.getFile() !== null) {
      const file = this.getFile()!;
      const lastSlash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
      return file.substring(lastSlash + 1);
    }

    return '';
  }

  /**
   * get the part-list of the MusicXML as an Element
   * @return the part-list Element or null if none exists
   */
  getPartList(): Element | null {
    if (this.data === null) return null;

    const root = this.data.getRootElement();
    switch (this.getType()) {
      case MusicXmlType.scorePartwise:
      case MusicXmlType.scoreTimewise:
        return root.getFirstChildElement('part-list');
      default:
        return null;
    }
  }

  /**
   * convert the MusicXML to an MSM and MPM pair
   * TODO: Implement MusicXml2MsmMpmConverter
   * @param ppq pulses per quarter time resolution (default 720)
   * @param cleanup set true to return a clean msm file (default true)
   * @return
   */
  exportMsmMpm(_ppq = 720, _cleanup = true): null {
    // TODO: Implement when MusicXml2MsmMpmConverter is ported
    console.error('MusicXml.exportMsmMpm() is not yet implemented in this TypeScript port.');
    return null;
  }

  /**
   * convert MusicXML to MEI
   * TODO: Implement MEI conversion
   * @return
   */
  exportMei(): null {
    console.error('MusicXML to MEI conversion is not yet supported.');
    return null;
  }

  /**
   * returns the MusicXML data as XML string or empty string if this is empty
   * @return
   */
  override toXML(): string {
    if (this.isEmpty()) return '';
    return this.data!.toXML();
  }

  /**
   * check validity of the XML
   * @return
   */
  override isValid(): boolean {
    return !this.isEmpty();
  }

  /**
   * XML validation is not supported for MusicXml instances
   * @param _schema
   * @return
   */
  override validate(_schema?: string): string {
    return 'MusicXml.validate() is not supported.';
  }

  /**
   * writes the MusicXML to a string
   * @return the XML string or null if empty
   */
  writeMusicXml(): string | null;
  /**
   * writes the MusicXML with specified filename stored for reference
   * @param filename the filename string; it should include the path and the extension
   * @return the XML string or null if empty
   */
  writeMusicXml(filename: string): string | null;
  writeMusicXml(filename?: string): string | null {
    if (this.isEmpty()) {
      console.error('Empty document, cannot write file.');
      return null;
    }

    if (filename !== undefined) {
      // Check if .mxl extension
      const ext = filename.substring(filename.lastIndexOf('.'));
      if (ext === '.mxl') {
        console.log(
          'According to the file extension, a Compressed MusicXML should be written. Switching to the corresponding method.',
        );
        return this.writeCompressedMusicXml(filename);
      }
      if (this.file === null) {
        this.file = filename;
      }
    } else {
      if (this.file === null) {
        console.error('Cannot write to the file system. Path and filename are not specified.');
        return null;
      }
    }

    return this.toXML();
  }

  /**
   * writes the MusicXML to a compressed .mxl format
   * TODO: Implement using JSZip
   * @return the compressed data or null
   */
  writeCompressedMusicXml(): string | null;
  /**
   * writes the MusicXML to a compressed .mxl format with specified filename
   * TODO: Implement using JSZip
   * @param filename the filename string
   * @return the compressed data or null
   */
  writeCompressedMusicXml(filename?: string): string | null;
  writeCompressedMusicXml(_filename?: string): string | null {
    if (this.isEmpty()) {
      console.error('Empty document, cannot write file.');
      return null;
    }

    // TODO: Implement compressed MusicXML (.mxl) writing using JSZip
    console.error(
      'Compressed MusicXML (.mxl) writing is not yet supported in this TypeScript port.',
    );
    return null;
  }

  /**
   * this method is inactive; invoke MusicXml.getDocument().getRootElement() instead
   * @return
   */
  override getRootElement(): Element | null {
    console.error('MusicXml.getRootElement() is not supported.');
    return null;
  }

  /**
   * this method is inactive for MusicXml instances
   * @param _localName the elements to be removed
   * @return
   */
  override removeAllElements(_localName: string): number {
    console.error('MusicXml.removeAllElements() is not supported.');
    return 0;
  }

  /**
   * this method is inactive for MusicXml instances
   * @param _attributeName the attribute name
   * @return
   */
  override removeAllAttributes(_attributeName: string): number {
    console.error('MusicXml.removeAllAttributes() is not supported.');
    return 0;
  }

  /**
   * XSL Transform stub - not yet implemented
   * @param _xslt
   * @return
   */
  xslTransformToDocument(_xslt: string): Document | null {
    // TODO: Implement XSLT support
    console.error('MusicXml.xslTransformToDocument() is not yet implemented.');
    return null;
  }

  /**
   * XSL Transform stub - not yet implemented
   * @param _xslt
   * @return
   */
  xslTransformToString(_xslt: string): string | null {
    // TODO: Implement XSLT support
    console.error('MusicXml.xslTransformToString() is not yet implemented.');
    return null;
  }
}

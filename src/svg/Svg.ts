import { Document } from '../xml/XomTypes.js';
import { XmlBase } from '../xml/XmlBase.js';

/**
 * This class interfaces SVG data.
 * One such SVG is one page of the score.
 * Port of meico.svg.Svg
 *
 * @author Axel Berndt
 */
export class Svg extends XmlBase {
  /**
   * constructor
   */
  constructor();
  /**
   * constructor
   * @param document the data as XOM Document
   */
  constructor(document: Document);
  /**
   * constructor
   * @param svg xml code as UTF8 String
   */
  constructor(svg: string);
  constructor(arg?: Document | string) {
    if (arg === undefined) {
      super();
    } else if (arg instanceof Document) {
      super(arg);
    } else if (typeof arg === 'string') {
      super(arg, true);
    } else {
      super();
    }
  }

  /**
   * writes the data document to a string;
   * equivalent to the Java writeSvg() that writes to this.file
   *
   * @return the XML string or null if empty
   */
  writeSvg(): string | null;
  /**
   * writes the document to a string (filename is stored for reference)
   *
   * @param filename the filename string; it should include the path and the extension
   * @return the XML string or null if empty
   */
  writeSvg(filename: string): string | null;
  writeSvg(filename?: string): string | null {
    if (filename !== undefined) {
      this.setFile(filename);
    }
    return this.exportXml();
  }
}

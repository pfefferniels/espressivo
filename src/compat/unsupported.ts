import { Document } from '../xml/XomTypes.js';

/**
 * The members of `meico.mei.Helper` that this port cannot implement.
 *
 * Nothing in this module does any work. Java uses Saxon for XSLT, a schema validator for the
 * two `validateAgainstSchema` methods, and `java.io` for file writing; none has a counterpart
 * in the target environment, so each function here warns and returns a failure value. They
 * are kept because they are part of `Helper`'s published surface and dropping them would be
 * an API change, not because anything on the conversion path calls them — nothing does.
 *
 * Grouping them in one module is deliberate: ARCHITECTURE.md §8.10 rules that T21 deletes
 * this file wholesale (with its tests), so keeping them together makes that a whole-file
 * decision rather than surgery across seven modules. **T14 deletes nothing** (§8.2).
 *
 * The `transformer` parameters were `any` in the original port (a Saxon object has no
 * type here); they are `unknown`, which accepts the same arguments at every call
 * site while giving callers nothing they could unsafely use. The parameters themselves
 * stay unread, which is what the remaining `no-unused-vars` entries in this file are —
 * clearing those needs `argsIgnorePattern: '^_'` in `eslint.config.js`, a config file
 * outside this item's scope.
 *
 * @author Axel Berndt
 */

/**
 * This method validates a file against a schema. If the validation fails it throws an exception.
 * STUB: Schema validation is not available in the browser environment.
 * @param file path to the file
 * @param schema URL of the schema
 */
export function validateAgainstSchema(file: string, schema: string): void {
  console.warn(
    'validateAgainstSchema: Schema validation is not available in the browser/Node.js environment. Skipping validation.',
  );
}

/**
 * This method validates an xml string against a schema. If the validation fails it throws an exception.
 * STUB: Schema validation is not available in the browser environment.
 * @param xml the xml string
 * @param schema URL of the schema
 */
export function validateAgainstSchemaString(xml: string, schema: string): void {
  console.warn(
    'validateAgainstSchema: Schema validation is not available in the browser/Node.js environment. Skipping validation.',
  );
}

/**
 * writes a string to a file
 * Note: In browser environments, this is a stub. In Node.js, it uses fs.
 * @param str the string content to write
 * @param filename the filename string; it should include the path and the extension
 * @return true if success, false if an error occurred
 */
export function writeStringToFile(str: string | null, filename: string | null): boolean {
  if (str == null) {
    console.error('String undefined!');
    return false;
  }

  if (filename == null) {
    console.error('Filename undefined!');
    return false;
  }

  try {
    // Node.js environment
    if (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { process?: unknown }).process !== 'undefined'
    ) {
      // Dynamic import not possible in sync context, use require
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(filename);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filename, `${str}\n`, 'utf-8');
      return true;
    } else {
      console.warn('writeStringToFile: File I/O is not available in this environment.');
      return false;
    }
  } catch (e) {
    console.error(e);
    return false;
  }
}

/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml document
 * @param xslt the XSLT stylesheet file path
 * @return the output Document of the transform or null
 */
export function xslTransformToDocument(input: Document, xslt: string): Document | null;
/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml document
 * @param transformer the XSLT transformer (untyped, since Saxon is not available)
 * @return the output Document of the transform or null
 */
export function xslTransformToDocument(input: Document, transformer: unknown): Document | null;
export function xslTransformToDocument(
  input: Document,
  xsltOrTransformer: unknown,
): Document | null {
  console.warn(
    'xslTransformToDocument: XSLT transforms are not available in the browser/Node.js environment. Returning null.',
  );
  return null;
}

/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml document or string
 * @param xslt the XSLT stylesheet file path
 * @return the output string (null in case of an error)
 */
export function xslTransformToString(input: Document, xslt: string): string | null;
/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml document
 * @param transformer the XSLT transformer
 * @return the output string (null in case of an error)
 */
export function xslTransformToString(input: Document, transformer: unknown): string | null;
/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml string
 * @param transformer the XSLT transformer
 * @return the output string (null in case of an error)
 */
export function xslTransformToString(input: string, transformer: unknown): string | null;
/**
 * a helper method to perform XSL transforms
 * STUB: XSLT is not available in the browser environment.
 * @param input the input xml string
 * @param xslt the XSLT stylesheet file path
 * @return the output string (null in case of an error)
 */
export function xslTransformToString(input: string, xslt: string): string | null;
export function xslTransformToString(
  input: Document | string,
  xsltOrTransformer: unknown,
): string | null {
  console.warn(
    'xslTransformToString: XSLT transforms are not available in the browser/Node.js environment. Returning null.',
  );
  return null;
}

/**
 * compile an XSLT 1.0 or 2.0 compatible Transformer
 * STUB: XSLT is not available in the browser environment.
 * @param xslt the XSLT stylesheet file path
 * @param processor
 * @param source
 * @param destination
 * @return null (stub)
 */
export function makeXsltTransformer(
  xslt: string,
  processor: unknown,
  source: unknown,
  destination: unknown,
): unknown {
  console.warn(
    'makeXsltTransformer: XSLT is not available in the browser/Node.js environment. Returning null.',
  );
  return null;
}

/**
 * compile an XSLT 3.0 Transformer from a given xslt stylesheet using the given Processor instance
 * STUB: XSLT is not available in the browser environment.
 * @param xslt the XSLT stylesheet file path
 * @param processor
 * @return null (stub)
 */
export function makeXslt30Transformer(xslt: string, processor?: unknown): unknown {
  console.warn(
    'makeXslt30Transformer: XSLT is not available in the browser/Node.js environment. Returning null.',
  );
  return null;
}

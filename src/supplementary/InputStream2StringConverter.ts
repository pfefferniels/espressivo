/**
 * Browser-compatible replacement for Java's InputStream2StringConverter.
 * In browser/Node.js context, we work with strings directly,
 * but this class provides compatibility methods.
 */
export class InputStream2StringConverter {
  static convert(input: string | ArrayBuffer | Uint8Array): string {
    if (typeof input === 'string') {
      return input;
    }
    if (input instanceof ArrayBuffer) {
      return new TextDecoder('utf-8').decode(input);
    }
    if (input instanceof Uint8Array) {
      return new TextDecoder('utf-8').decode(input);
    }
    return String(input);
  }
}

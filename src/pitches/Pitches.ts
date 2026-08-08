import { FeatureVector } from './FeatureVector.js';
import { Key } from './Key.js';

/**
 * This class represents the list of pitch features for a piece of music.
 * It supports also Chroma features.
 * Port of meico.pitches.Pitches
 * @author Axel Berndt.
 */
export class Pitches {
  private file: string | null = null;
  private features: FeatureVector[];
  private key: Key;

  /**
   * constructor
   * @param key optional key; defaults to Chroma type features (equal tempered tuning, 440 Hz)
   */
  constructor(key?: Key) {
    if (key !== undefined) {
      this.key = key;
    } else {
      this.key = new Key();
    }
    this.features = [];
  }

  /**
   * this getter returns the file
   * @return a filename string (this file does not necessarily have to exist in the file system)
   */
  getFile(): string | null {
    return this.file;
  }

  /**
   * with this setter a new filename can be set
   * @param filename the filename including the full path and .pch extension
   */
  setFile(filename: string): void {
    this.file = filename;
  }

  /**
   * a getter for the key
   * @return
   */
  getKey(): Key {
    return this.key;
  }

  /**
   * this getter returns the whole features array
   * @return
   */
  getFeatures(): FeatureVector[] {
    return this.features;
  }

  /**
   * a getter that returns the number of pitch features.
   * @return
   */
  getFeatureCount(): number {
    return this.features.length;
  }

  /**
   * returns the pitch feature vector at the given index or null if index out of bounds
   * @param index the index of the pitch feature should be in [0, features.length-1], otherwise null is returned
   * @return
   */
  getFeatureAt(index: number): FeatureVector | null {
    if (index < 0 || index >= this.features.length) {
      return null;
    }
    return this.features[index];
  }

  /**
   * add a pitch feature vector at the given index;
   * if there is already a vector at that index, their values will be added
   * @param index
   * @param feature
   * @return true if the operation has been performed successfully, otherwise false
   */
  addFeatureAt(index: number, feature: FeatureVector): boolean {
    if (index < 0) return false;

    if (feature.getSize() !== this.key.getSize()) {
      console.error(
        'Error: Dimensions of key and feature vector do not match. It cannot be added to the pitch features.',
      );
      return false;
    }

    if (index >= this.features.length) {
      // add enough "all-zero features" to fill up the list until the desired index
      for (let i = this.features.length; i <= index; ++i) {
        const filler = new FeatureVector(this.key);
        this.features.push(filler);
      }
    }

    this.features[index].add(feature);

    return true;
  }

  /**
   * converts this class instance into a JSON object, including the key
   * @return
   */
  private toJson(): Record<string, unknown> {
    const pitches: Record<string, unknown> = {};

    pitches['key'] = this.key.toJson();

    const feats: Record<string, unknown>[] = [];
    for (const fv of this.features) {
      feats.push(fv.toJson());
    }

    pitches['features'] = feats;

    return pitches;
  }

  /**
   * returns the JSON string representation
   * @param prettyPrint set true for better readability, set false for better memory efficiency
   * @return
   */
  getAsString(prettyPrint = false): string {
    const json = this.toJson();
    if (prettyPrint) {
      return JSON.stringify(json, null, 2);
    }
    return JSON.stringify(json);
  }

  /**
   * write the pitch features to a string with default filename
   * @param prettyPrint
   * @return the JSON string or null on error
   */
  writePitches(prettyPrint?: boolean): string | null;
  /**
   * write the pitch features with specified filename
   * @param filename
   * @param prettyPrint
   * @return the JSON string or null on error
   */
  writePitches(filename?: string, prettyPrint?: boolean): string | null;
  writePitches(filenameOrPrettyPrint?: string | boolean, prettyPrint?: boolean): string | null {
    let pp = false;

    if (typeof filenameOrPrettyPrint === 'boolean') {
      // writePitches(prettyPrint)
      pp = filenameOrPrettyPrint;
      if (this.file === null) {
        console.error('Cannot write to the file system. Path and filename are not specified.');
        return null;
      }
    } else if (typeof filenameOrPrettyPrint === 'string') {
      // writePitches(filename, prettyPrint?)
      if (this.file === null) {
        this.file = filenameOrPrettyPrint;
      }
      pp = prettyPrint ?? false;
    } else {
      // writePitches() - no args
      pp = false;
      if (this.file === null) {
        console.error('Cannot write to the file system. Path and filename are not specified.');
        return null;
      }
    }

    return this.getAsString(pp);
  }
}

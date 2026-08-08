import { FeatureElement } from './FeatureElement.js';
import { Key } from './Key.js';

/**
 * This class represents one pitch feature, i.e. an array of FeatureElements that form the feature vector.
 * Port of meico.pitches.FeatureVector
 * @author Axel Berndt.
 */
export class FeatureVector {
    private feature: FeatureElement[];

    /**
     * constructor
     * @param featureOrKey the feature vector (array of FeatureElements) or a Key to initialize a 0-vector
     */
    constructor(featureOrKey: FeatureElement[] | Key) {
        if (featureOrKey instanceof Key) {
            this.feature = new Array<FeatureElement>(featureOrKey.getSize());
            for (let i = 0; i < this.feature.length; ++i) {
                this.feature[i] = new FeatureElement();
            }
        } else {
            this.feature = featureOrKey;
        }
    }

    /**
     * return the size of the feature vector
     * @return
     */
    getSize(): number {
        return this.feature.length;
    }

    /**
     * this method returns the element of this vector at the given index
     * @param index
     * @return
     */
    getFeatureElement(index: number): FeatureElement {
        return this.feature[index];
    }

    /**
     * This adds up the energy and note ids of two feature vectors.
     * But be aware that the vectors should have the same size. Otherwise correctness of this operation cannot be ensured.
     * @param feature the feature vector to be added
     * @return
     */
    add(feature: FeatureVector): boolean {
        const maxIndex = (this.getSize() < feature.getSize()) ? this.getSize() : feature.getSize();

        for (let i = 0; i < maxIndex; ++i) {
            const e = feature.getFeatureElement(i);
            this.feature[i].addEnergy(e.getEnergy());
            this.feature[i].addNoteIds(e.getNoteIds());
        }

        return this.feature.length === feature.getSize();
    }

    /**
     * This adds only an energy vector to the feature vector, no ids.
     * But be aware that the vectors should have the same size. Otherwise correctness of this operation cannot be ensured.
     * @param energy
     * @return
     */
    addEnergy(energy: number[]): boolean {
        const maxIndex = (this.feature.length < energy.length) ? this.feature.length : energy.length;

        for (let i = 0; i < maxIndex; ++i)
            this.feature[i].addEnergy(energy[i]);

        return this.feature.length === energy.length;
    }

    /**
     * converts this class instance into a JSON object
     * @return
     */
    toJson(): Record<string, unknown> {
        const energyVector: number[] = [];
        const idVector: string[][] = [];

        for (let i = 0; i < this.feature.length; ++i) {
            const fe = this.feature[i];
            energyVector.push(fe.getEnergy());
            idVector.push([...fe.getNoteIds()]);
        }

        return {
            nrg: energyVector,
            ids: idVector
        };
    }
}

/**
 * This class represents one element of a pitch feature vector, i.e. an energy value
 * on a frequency or chroma band and note id associations to it.
 * Port of meico.pitches.FeatureElement
 * @author Axel Berndt.
 */
export class FeatureElement {
    private energy: number = 0.0;
    private noteIds: string[] = [];

    /**
     * constructor
     * @param energy an energy value (optional)
     * @param noteIds note associations (optional)
     */
    constructor(energy?: number, noteIds?: string[]) {
        if (energy !== undefined) {
            this.energy = energy;
        }
        if (noteIds !== undefined) {
            this.noteIds = [...noteIds];
            this.cleanupMultipleEntries();
        }
    }

    /**
     * this method removes multiple entries of note ids and, hence, reduces memory consumption
     */
    private cleanupMultipleEntries(): void {
        let size = this.noteIds.length;
        for (let i = 0; i < size - 1; ++i) {
            const id1 = this.noteIds[i];
            let j = i + 1;
            while (j < size) {
                const id2 = this.noteIds[j];
                if (id2 === id1) {
                    this.noteIds.splice(j, 1);
                    --size;
                    continue;
                }
                ++j;
            }
        }
    }

    /**
     * setter for energy
     * @param energy
     */
    setEnergy(energy: number): void {
        this.energy = energy;
    }

    /**
     * adds the given amount of energy
     * @param energy
     */
    addEnergy(energy: number): void {
        this.energy += energy;
    }

    /**
     * add a note association to the list of note ids
     * @param noteId
     */
    addNoteId(noteId: string): void {
        // check if the id is already in the list, we do not need double entries
        for (const id of this.noteIds) {
            if (id === noteId)      // found it
                return;             // done
        }
        this.noteIds.push(noteId);  // add it
    }

    /**
     * add several note ids at once
     * @param ids
     */
    addNoteIds(ids: string[]): void {
        for (const id of ids) {
            this.addNoteId(id);
        }
    }

    /**
     * removes an entry from the list of note ids
     * @param noteId
     * @return false if the entry was already in and has not been added a second time, otherwise true
     */
    removeNoteId(noteId: string): boolean {
        let thisIdWasInTheList = false;

        for (let i = 0; i < this.noteIds.length; ++i) {
            const id = this.noteIds[i];
            if (id === noteId) {
                this.noteIds.splice(i, 1);
                thisIdWasInTheList = true;
                --i;
            }
        }

        return thisIdWasInTheList;
    }

    /**
     * getter for the energy value
     * @return
     */
    getEnergy(): number {
        return this.energy;
    }

    /**
     * getter for the note ids
     * @return
     */
    getNoteIds(): string[] {
        return this.noteIds;
    }
}

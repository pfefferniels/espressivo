import { Attribute, Element } from '../../../xml/XomTypes.js';
import { AbstractXmlSubtree } from '../../../xml/AbstractXmlSubtree.js';
import { Helper } from '../../../mei/Helper.js';
import { Mpm } from '../../../mpm/Mpm.js';
import { Author } from './Author.js';
import { Comment } from './Comment.js';
import { RelatedResource } from './RelatedResource.js';

export class Metadata extends AbstractXmlSubtree {
    private readonly authors: Author[] = [];
    private readonly comments: Comment[] = [];
    private readonly relatedResources: RelatedResource[] = [];

    private constructor() { super(); }

    static createMetadata(xml: Element): Metadata | null;
    static createMetadata(author: Author): Metadata | null;
    static createMetadata(comment: Comment): Metadata | null;
    static createMetadata(relatedResources: RelatedResource[]): Metadata | null;
    static createMetadata(author: Author | null, comment: Comment | null, relatedResources: RelatedResource[] | null): Metadata | null;
    static createMetadata(arg1: Element | Author | Comment | RelatedResource[] | null, arg2?: Comment | null, arg3?: RelatedResource[] | null): Metadata | null {
        try {
            const m = new Metadata();
            if (arg1 instanceof Element) {
                m.parseData(arg1);
            } else if (Array.isArray(arg1)) {
                const metadata = new Element("metadata", Mpm.MPM_NAMESPACE);
                if (arg1.length > 0) {
                    const rrElt = new Element("relatedResources", Mpm.MPM_NAMESPACE);
                    metadata.appendChild(rrElt);
                    for (const r of arg1) rrElt.appendChild(r.getXml()!);
                }
                m.parseData(metadata);
            } else {
                const metadata = new Element("metadata", Mpm.MPM_NAMESPACE);
                const author = (arg1 !== null && arg1 !== undefined && 'getName' in arg1 && 'getNumber' in (arg1 as any)) ? arg1 as Author : (arg2 === undefined ? arg1 as Author | null : arg1 as Author | null);
                const comment = arg2 !== undefined ? arg2 : (arg1 !== null && arg1 !== undefined && 'getText' in (arg1 as any) ? arg1 as unknown as Comment : null);
                const relatedResources = arg3 ?? null;

                if (arg2 === undefined && arg3 === undefined) {
                    // Single argument factory
                    if (arg1 !== null && arg1 !== undefined) {
                        if ('getName' in arg1 && 'getNumber' in (arg1 as any)) {
                            // It's an Author
                            metadata.appendChild((arg1 as Author).getXml()!);
                        } else if ('getText' in (arg1 as any)) {
                            // It's a Comment
                            metadata.appendChild((arg1 as unknown as Comment).getXml()!);
                        }
                    }
                } else {
                    if (author !== null && author !== undefined) metadata.appendChild(author.getXml()!);
                    if (comment !== null && comment !== undefined) metadata.appendChild(comment.getXml()!);
                    if (relatedResources !== null && relatedResources.length > 0) {
                        const rrElt = new Element("relatedResources", Mpm.MPM_NAMESPACE);
                        metadata.appendChild(rrElt);
                        for (const r of relatedResources) rrElt.appendChild(r.getXml()!);
                    }
                }
                m.parseData(metadata);
            }
            return m;
        } catch (e) { console.error(e); return null; }
    }

    protected parseData(xml: Element): void {
        if (xml === null) throw new Error("Cannot generate Metadata object. XML Element is null.");
        this.setXml(xml);
        const children = this.getXml()!.getChildElements();
        for (let i = 0; i < children.size(); ++i) {
            const child = children.get(i);
            switch (child.getLocalName()) {
                case "author": { const a = Author.createAuthor(child); if (a !== null) this.authors.push(a); break; }
                case "comment": { const c = Comment.createComment(child); if (c !== null) this.comments.push(c); break; }
                case "relatedResources": {
                    const resources = Helper.getAllChildElements("resource", child);
                    if (resources) { for (const resource of resources) { const r = RelatedResource.createRelatedResource(resource); if (r !== null) this.relatedResources.push(r); } }
                    break;
                }
            }
        }
        if (((this.authors.length + this.comments.length) === 0) && this.relatedResources.length === 0)
            throw new Error("Cannot generate empty Metadata object.");
    }

    addAuthor(author: Author): number { if (author === null) return -1; this.getXml()!.appendChild(author.getXml()!); this.authors.push(author); return this.authors.length - 1; }
    getAuthors(): Author[] { return this.authors; }
    getAuthorByIndex(index: number): Author | null { return index < this.authors.length ? this.authors[index] : null; }
    getAuthorByName(name: string): Author[] { return this.authors.filter(a => a.getName() === name); }
    removeAuthorByName(name: string): void { const auts = this.getAuthorByName(name); for (const aut of auts) { this.getXml()!.removeChild(aut.getXml()!); const idx = this.authors.indexOf(aut); if (idx !== -1) this.authors.splice(idx, 1); } }
    removeAuthor(author: Author): void { const idx = this.authors.indexOf(author); if (idx !== -1) { this.getXml()!.removeChild(author.getXml()!); this.authors.splice(idx, 1); } }

    addComment(comment: Comment): number { if (comment === null) return -1; this.getXml()!.appendChild(comment.getXml()!); this.comments.push(comment); return this.comments.length - 1; }
    getComments(): Comment[] { return this.comments; }
    getComment(index: number): Comment { return this.comments[index]; }
    removeCommentByIndex(index: number): void { const c = this.getComment(index); this.getXml()!.removeChild(c.getXml()!); this.comments.splice(index, 1); }
    removeComment(comment: Comment): void { const idx = this.comments.indexOf(comment); if (idx !== -1) { this.getXml()!.removeChild(comment.getXml()!); this.comments.splice(idx, 1); } }

    addRelatedResource(relatedResource: RelatedResource): number {
        if (relatedResource === null) return -1;
        let rrElt = Helper.getFirstChildElement("relatedResources", this.getXml()!);
        if (rrElt === null) { rrElt = new Element("relatedResources", Mpm.MPM_NAMESPACE); this.getXml()!.appendChild(rrElt); }
        rrElt.appendChild(relatedResource.getXml()!);
        this.relatedResources.push(relatedResource);
        return this.relatedResources.length - 1;
    }
    getRelatedResources(): RelatedResource[] { return this.relatedResources; }
    getRelatedResource(index: number): RelatedResource | null { return index < this.relatedResources.length ? this.relatedResources[index] : null; }
    removeRelatedResourceByIndex(index: number): void { this.removeRelatedResource(this.relatedResources[index]); }
    removeRelatedResource(relatedResource: RelatedResource | null): void {
        if (relatedResource === null) return;
        const rrElt = Helper.getFirstChildElement("relatedResources", this.getXml()!);
        if (rrElt === null) return;
        rrElt.removeChild(relatedResource.getXml()!);
        const idx = this.relatedResources.indexOf(relatedResource);
        if (idx !== -1) this.relatedResources.splice(idx, 1);
        if (rrElt.getChildCount() === 0) this.getXml()!.removeChild(rrElt);
    }
}

import { describe, it, expect, vi } from 'vitest';
import { Mpm } from '../../../../src/mpm/Mpm.js';
import { Metadata } from '../../../../src/mpm/elements/metadata/Metadata.js';
import { Author } from '../../../../src/mpm/elements/metadata/Author.js';
import { Comment } from '../../../../src/mpm/elements/metadata/Comment.js';
import { RelatedResource } from '../../../../src/mpm/elements/metadata/RelatedResource.js';
import { Element, Attribute, Text } from '../../../../src/xml/XomTypes.js';

/**
 * Reference: meico/src/meico/mpm/elements/metadata/{Metadata,Author,Comment,RelatedResource}.java
 */
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

function element(
  name: string,
  attributes: Record<string, string> = {},
  children: (Element | Text)[] = [],
): Element {
  const e = new Element(name, Mpm.MPM_NAMESPACE);
  for (const [attName, value] of Object.entries(attributes))
    e.addAttribute(new Attribute(attName, value));
  for (const c of children) e.appendChild(c);
  return e;
}

/** Runs body with console.error silenced. */
function quiet<T>(body: () => T): T {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    return body();
  } finally {
    err.mockRestore();
  }
}

describe('Author', () => {
  it('creates an author from name, number and id', () => {
    const a = Author.createAuthor('Axel Berndt', 1, 'author-1')!;
    expect(a.getName()).toBe('Axel Berndt');
    expect(a.getNumber()).toBe(1);
    expect(a.getId()).toBe('author-1');
    expect(a.getXml()!.getLocalName()).toBe('author');
    expect(a.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
    expect(a.getXml()!.getValue()).toBe('Axel Berndt');
  });

  it('leaves number and id off when they are null', () => {
    const a = Author.createAuthor('Anon', null, null)!;
    expect(a.getNumber()).toBeNull();
    expect(a.getId()).toBeNull();
    expect(a.getXml()!.getAttributeCount()).toBe(0);
  });

  it('creates an author from an existing element and reads its text', () => {
    const xml = element('author', { number: '2' }, [new Text('Someone')]);
    xml.addAttribute(new Attribute('xml:id', XML_NS, 'author-2'));
    const a = Author.createAuthor(xml)!;
    expect(a.getXml()).toBe(xml);
    expect(a.getName()).toBe('Someone');
    expect(a.getNumber()).toBe(2);
    expect(a.getId()).toBe('author-2');
  });

  it('adds an empty text node when the element has no text child', () => {
    const xml = element('author');
    const a = Author.createAuthor(xml)!;
    expect(a.getName()).toBe('');
    expect(xml.getChildCount()).toBe(1);
    expect(xml.getChild(0)).toBeInstanceOf(Text);
  });

  it('adds an empty text node when the first child is an element', () => {
    const xml = element('author', {}, [element('nested')]);
    const a = Author.createAuthor(xml)!;
    expect(a.getName()).toBe('');
  });

  it('setName writes through to the xml text node', () => {
    const a = Author.createAuthor('First', null, null)!;
    a.setName('Second');
    expect(a.getName()).toBe('Second');
    expect(a.getXml()!.getValue()).toBe('Second');
  });

  it('setNumber adds, then updates the number attribute', () => {
    const a = Author.createAuthor('Anon', null, null)!;
    a.setNumber(3);
    expect(a.getNumber()).toBe(3);
    expect(a.getXml()!.getAttributeValue('number')).toBe('3');
    a.setNumber(4);
    expect(a.getNumber()).toBe(4);
    expect(a.getXml()!.getAttributeValue('number')).toBe('4');
  });

  it('setNumber(null) clears the number', () => {
    const a = Author.createAuthor('Anon', 3, null)!;
    a.setNumber(null);
    expect(a.getNumber()).toBeNull();
    a.setNumber(null);
    expect(a.getNumber()).toBeNull();
  });

  it('setId adds the id in the xml namespace, then updates it', () => {
    const a = Author.createAuthor('Anon', null, null)!;
    a.setId('author-x');
    expect(a.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('author-x');
    a.setId('author-y');
    expect(a.getId()).toBe('author-y');
  });

  it('setId(null) clears the id', () => {
    const a = Author.createAuthor('Anon', null, 'author-x')!;
    a.setId(null);
    expect(a.getId()).toBeNull();
    a.setId(null);
    expect(a.getId()).toBeNull();
  });

  it('returns null for a null element', () => {
    expect(quiet(() => Author.createAuthor(null as unknown as Element))).toBeNull();
  });
});

describe('Comment', () => {
  it('creates a comment from text and id', () => {
    const c = Comment.createComment('a remark', 'comment-1')!;
    expect(c.getText()).toBe('a remark');
    expect(c.getId()).toBe('comment-1');
    expect(c.getXml()!.getLocalName()).toBe('comment');
    expect(c.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
    expect(c.getXml()!.getValue()).toBe('a remark');
  });

  it('leaves the id off when it is null', () => {
    const c = Comment.createComment('a remark', null)!;
    expect(c.getId()).toBeNull();
    expect(c.getXml()!.getAttributeCount()).toBe(0);
  });

  it('creates a comment from an existing element and reads its text', () => {
    const xml = element('comment', {}, [new Text('from xml')]);
    xml.addAttribute(new Attribute('xml:id', XML_NS, 'comment-2'));
    const c = Comment.createComment(xml)!;
    expect(c.getXml()).toBe(xml);
    expect(c.getText()).toBe('from xml');
    expect(c.getId()).toBe('comment-2');
  });

  it('adds an empty text node when the element has no text child', () => {
    const xml = element('comment');
    const c = Comment.createComment(xml)!;
    expect(c.getText()).toBe('');
    expect(xml.getChildCount()).toBe(1);
  });

  it('setText writes through to the xml text node', () => {
    const c = Comment.createComment('first', null)!;
    c.setText('second');
    expect(c.getText()).toBe('second');
    expect(c.getXml()!.getValue()).toBe('second');
  });

  it('setId adds and updates the id, setId(null) clears it', () => {
    const c = Comment.createComment('x', null)!;
    c.setId('c1');
    expect(c.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('c1');
    c.setId('c2');
    expect(c.getId()).toBe('c2');
    c.setId(null);
    expect(c.getId()).toBeNull();
    c.setId(null);
    expect(c.getId()).toBeNull();
  });

  it('returns null for a null element', () => {
    expect(quiet(() => Comment.createComment(null as unknown as Element))).toBeNull();
  });
});

describe('RelatedResource', () => {
  it('creates a resource from uri and type', () => {
    const r = RelatedResource.createRelatedResource('score.mei', 'mei')!;
    expect(r.getUri()).toBe('score.mei');
    expect(r.getType()).toBe('mei');
    expect(r.getXml()!.getLocalName()).toBe('resource');
    expect(r.getXml()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
  });

  it('strips whitespace from the type, which has to be an XML token', () => {
    const r = RelatedResource.createRelatedResource('score.mei', ' me i \n')!;
    expect(r.getType()).toBe('mei');
  });

  it('creates a resource from an existing element', () => {
    const xml = element('resource', { uri: 'a.msm', type: 'msm' });
    const r = RelatedResource.createRelatedResource(xml)!;
    expect(r.getXml()).toBe(xml);
    expect(r.getUri()).toBe('a.msm');
    expect(r.getType()).toBe('msm');
  });

  it('defaults missing uri and type attributes to empty strings and writes them back', () => {
    const xml = element('resource');
    const r = RelatedResource.createRelatedResource(xml)!;
    expect(r.getUri()).toBe('');
    expect(r.getType()).toBe('');
    expect(xml.getAttributeValue('uri')).toBe('');
    expect(xml.getAttributeValue('type')).toBe('');
  });

  it('setUri and setType write through to the xml', () => {
    const r = RelatedResource.createRelatedResource('a', 'b')!;
    r.setUri('c');
    r.setType('d');
    expect(r.getXml()!.getAttributeValue('uri')).toBe('c');
    expect(r.getXml()!.getAttributeValue('type')).toBe('d');
  });

  it('returns null when the type is missing, mirroring the null check in Java', () => {
    expect(
      RelatedResource.createRelatedResource('a.mei', undefined as unknown as string),
    ).toBeNull();
  });

  it('returns null for a null element', () => {
    expect(
      quiet(() => RelatedResource.createRelatedResource(null as unknown as Element)),
    ).toBeNull();
  });
});

describe('Metadata', () => {
  describe('factories', () => {
    it('creates metadata from a single author', () => {
      const author = Author.createAuthor('Axel', 1, null)!;
      const m = Metadata.createMetadata(author)!;
      expect(m.getAuthors().length).toBe(1);
      // The factory re-parses the assembled element, so the metadata holds a fresh
      // Author wrapper around the very element the caller passed in.
      expect(m.getAuthors()[0]).not.toBe(author);
      expect(m.getAuthors()[0].getXml()).toBe(author.getXml());
      expect(m.getAuthors()[0].getName()).toBe('Axel');
      expect(m.getAuthors()[0].getNumber()).toBe(1);
      expect(m.getComments().length).toBe(0);
      expect(m.getXml()!.getLocalName()).toBe('metadata');
    });

    it('creates metadata from a single comment', () => {
      const comment = Comment.createComment('hello', null)!;
      const m = Metadata.createMetadata(comment)!;
      expect(m.getComments().length).toBe(1);
      expect(m.getComments()[0].getText()).toBe('hello');
      expect(m.getAuthors().length).toBe(0);
    });

    it('creates metadata from a list of related resources', () => {
      const r1 = RelatedResource.createRelatedResource('a.mei', 'mei')!;
      const r2 = RelatedResource.createRelatedResource('b.msm', 'msm')!;
      const m = Metadata.createMetadata([r1, r2])!;
      expect(m.getRelatedResources().length).toBe(2);
      expect(m.getRelatedResources()[0].getUri()).toBe('a.mei');
      expect(
        m.getXml()!.getFirstChildElement('relatedResources', Mpm.MPM_NAMESPACE),
      ).not.toBeNull();
    });

    it('creates metadata from author, comment and resources at once', () => {
      const m = Metadata.createMetadata(
        Author.createAuthor('Axel', 1, null)!,
        Comment.createComment('hello', null)!,
        [RelatedResource.createRelatedResource('a.mei', 'mei')!],
      )!;
      expect(m.getAuthors().length).toBe(1);
      expect(m.getComments().length).toBe(1);
      expect(m.getRelatedResources().length).toBe(1);
    });

    it('accepts nulls for the parts that are not given', () => {
      const m = Metadata.createMetadata(Author.createAuthor('Axel', 1, null)!, null, null)!;
      expect(m.getAuthors().length).toBe(1);
      expect(m.getComments().length).toBe(0);
      expect(m.getRelatedResources().length).toBe(0);
    });

    it('parses an existing metadata element', () => {
      const xml = element('metadata', {}, [
        element('author', { number: '1' }, [new Text('Axel')]),
        element('comment', {}, [new Text('hello')]),
        element('relatedResources', {}, [
          element('resource', { uri: 'a.mei', type: 'mei' }),
          element('resource', { uri: 'b.msm', type: 'msm' }),
        ]),
      ]);
      const m = Metadata.createMetadata(xml)!;
      expect(m.getXml()).toBe(xml);
      expect(m.getAuthors().length).toBe(1);
      expect(m.getAuthors()[0].getName()).toBe('Axel');
      expect(m.getComments().length).toBe(1);
      expect(m.getRelatedResources().length).toBe(2);
    });

    it('ignores metadata children it does not know', () => {
      const xml = element('metadata', {}, [
        element('somethingElse'),
        element('comment', {}, [new Text('hello')]),
      ]);
      const m = Metadata.createMetadata(xml)!;
      expect(m.getComments().length).toBe(1);
    });

    it('refuses to create empty metadata', () => {
      expect(quiet(() => Metadata.createMetadata(element('metadata')))).toBeNull();
    });

    it('refuses an empty list of related resources', () => {
      expect(quiet(() => Metadata.createMetadata([]))).toBeNull();
    });
  });

  describe('authors', () => {
    function metadata(): Metadata {
      return Metadata.createMetadata(Comment.createComment('anchor', null)!)!;
    }

    it('addAuthor appends to the list and the xml and returns the index', () => {
      const m = metadata();
      const a = Author.createAuthor('Axel', 1, null)!;
      expect(m.addAuthor(a)).toBe(0);
      expect(m.addAuthor(Author.createAuthor('Ben', 2, null)!)).toBe(1);
      expect(m.getAuthors().length).toBe(2);
      expect(a.getXml()!.getParent()).toBe(m.getXml());
    });

    it('addAuthor rejects null', () => {
      expect(metadata().addAuthor(null as never)).toBe(-1);
    });

    it('getAuthorByIndex returns the author or null when out of range', () => {
      const m = metadata();
      const a = Author.createAuthor('Axel', 1, null)!;
      m.addAuthor(a);
      expect(m.getAuthorByIndex(0)).toBe(a);
      expect(m.getAuthorByIndex(1)).toBeNull();
    });

    it('getAuthorByName finds every author with that name', () => {
      const m = metadata();
      m.addAuthor(Author.createAuthor('Axel', 1, null)!);
      m.addAuthor(Author.createAuthor('Axel', 2, null)!);
      m.addAuthor(Author.createAuthor('Ben', 3, null)!);
      expect(m.getAuthorByName('Axel').length).toBe(2);
      expect(m.getAuthorByName('Nobody').length).toBe(0);
    });

    it('removeAuthorByName removes all matches from the list and the xml', () => {
      const m = metadata();
      m.addAuthor(Author.createAuthor('Axel', 1, null)!);
      m.addAuthor(Author.createAuthor('Axel', 2, null)!);
      const ben = Author.createAuthor('Ben', 3, null)!;
      m.addAuthor(ben);

      m.removeAuthorByName('Axel');
      expect(m.getAuthors()).toEqual([ben]);
      expect(m.getXml()!.getChildElements('author', Mpm.MPM_NAMESPACE).size()).toBe(1);
    });

    it('removeAuthor removes exactly the given author', () => {
      const m = metadata();
      const a = Author.createAuthor('Axel', 1, null)!;
      const b = Author.createAuthor('Ben', 2, null)!;
      m.addAuthor(a);
      m.addAuthor(b);
      m.removeAuthor(a);
      expect(m.getAuthors()).toEqual([b]);
    });

    it('removeAuthor ignores an author that is not in the metadata', () => {
      const m = metadata();
      const a = Author.createAuthor('Axel', 1, null)!;
      m.addAuthor(a);
      m.removeAuthor(Author.createAuthor('Stranger', 9, null)!);
      expect(m.getAuthors()).toEqual([a]);
    });
  });

  describe('comments', () => {
    function metadata(): Metadata {
      return Metadata.createMetadata(Author.createAuthor('anchor', null, null)!)!;
    }

    it('addComment appends to the list and the xml and returns the index', () => {
      const m = metadata();
      const c = Comment.createComment('first', null)!;
      expect(m.addComment(c)).toBe(0);
      expect(m.addComment(Comment.createComment('second', null)!)).toBe(1);
      expect(m.getComments().length).toBe(2);
      expect(c.getXml()!.getParent()).toBe(m.getXml());
    });

    it('addComment rejects null', () => {
      expect(metadata().addComment(null as never)).toBe(-1);
    });

    it('getComment returns the comment at an index', () => {
      const m = metadata();
      const c = Comment.createComment('first', null)!;
      m.addComment(c);
      expect(m.getComment(0)).toBe(c);
    });

    it('removeCommentByIndex removes from the list and the xml', () => {
      const m = metadata();
      m.addComment(Comment.createComment('first', null)!);
      const second = Comment.createComment('second', null)!;
      m.addComment(second);

      m.removeCommentByIndex(0);
      expect(m.getComments()).toEqual([second]);
      expect(m.getXml()!.getChildElements('comment', Mpm.MPM_NAMESPACE).size()).toBe(1);
    });

    it('removeComment removes exactly the given comment', () => {
      const m = metadata();
      const first = Comment.createComment('first', null)!;
      const second = Comment.createComment('second', null)!;
      m.addComment(first);
      m.addComment(second);
      m.removeComment(first);
      expect(m.getComments()).toEqual([second]);
    });

    it('removeComment ignores a comment that is not in the metadata', () => {
      const m = metadata();
      const first = Comment.createComment('first', null)!;
      m.addComment(first);
      m.removeComment(Comment.createComment('stranger', null)!);
      expect(m.getComments()).toEqual([first]);
    });
  });

  describe('related resources', () => {
    function metadata(): Metadata {
      return Metadata.createMetadata(Comment.createComment('anchor', null)!)!;
    }

    it('addRelatedResource creates the relatedResources container on demand', () => {
      const m = metadata();
      expect(m.getXml()!.getFirstChildElement('relatedResources', Mpm.MPM_NAMESPACE)).toBeNull();

      const r = RelatedResource.createRelatedResource('a.mei', 'mei')!;
      expect(m.addRelatedResource(r)).toBe(0);

      const container = m.getXml()!.getFirstChildElement('relatedResources', Mpm.MPM_NAMESPACE)!;
      expect(container).not.toBeNull();
      expect(container.getChildElements().size()).toBe(1);
    });

    it('addRelatedResource reuses an existing container', () => {
      const m = metadata();
      m.addRelatedResource(RelatedResource.createRelatedResource('a.mei', 'mei')!);
      expect(m.addRelatedResource(RelatedResource.createRelatedResource('b.msm', 'msm')!)).toBe(1);
      expect(m.getXml()!.getChildElements('relatedResources', Mpm.MPM_NAMESPACE).size()).toBe(1);
    });

    it('addRelatedResource rejects null', () => {
      expect(metadata().addRelatedResource(null as never)).toBe(-1);
    });

    it('getRelatedResource returns the resource or null when out of range', () => {
      const m = metadata();
      const r = RelatedResource.createRelatedResource('a.mei', 'mei')!;
      m.addRelatedResource(r);
      expect(m.getRelatedResource(0)).toBe(r);
      expect(m.getRelatedResource(1)).toBeNull();
    });

    it('removeRelatedResource keeps the container while other resources remain', () => {
      const m = metadata();
      const a = RelatedResource.createRelatedResource('a.mei', 'mei')!;
      const b = RelatedResource.createRelatedResource('b.msm', 'msm')!;
      m.addRelatedResource(a);
      m.addRelatedResource(b);

      m.removeRelatedResource(a);
      expect(m.getRelatedResources()).toEqual([b]);
      expect(
        m.getXml()!.getFirstChildElement('relatedResources', Mpm.MPM_NAMESPACE),
      ).not.toBeNull();
    });

    it('removeRelatedResource drops the container once it is empty', () => {
      // MPM does not allow an empty relatedResources element.
      const m = metadata();
      m.addRelatedResource(RelatedResource.createRelatedResource('a.mei', 'mei')!);
      m.removeRelatedResourceByIndex(0);

      expect(m.getRelatedResources().length).toBe(0);
      expect(m.getXml()!.getFirstChildElement('relatedResources', Mpm.MPM_NAMESPACE)).toBeNull();
    });

    it('removeRelatedResource ignores null', () => {
      const m = metadata();
      m.addRelatedResource(RelatedResource.createRelatedResource('a.mei', 'mei')!);
      m.removeRelatedResource(null);
      expect(m.getRelatedResources().length).toBe(1);
    });

    it('removeRelatedResource does nothing when there is no container', () => {
      const m = metadata();
      m.removeRelatedResource(RelatedResource.createRelatedResource('a.mei', 'mei')!);
      expect(m.getRelatedResources().length).toBe(0);
    });
  });
});

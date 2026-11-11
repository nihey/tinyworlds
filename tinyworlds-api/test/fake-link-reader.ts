import {
  nameOf,
  type LinkPreview,
  type LinkReader,
} from '../src/links/link-reader.js';

/**
 * Reads links from a table instead of the internet: a page that is in `pages` answers with
 * what is there, any other is away (`reached: false`, named by its own address).
 */
export class FakeLinkReader implements LinkReader {
  pages = new Map<string, Partial<LinkPreview>>();
  /** Every address asked for, in order. */
  asked: string[] = [];

  read(url: string): Promise<LinkPreview> {
    this.asked.push(url);
    const page = this.pages.get(url);
    return Promise.resolve({
      reached: page !== undefined,
      title: nameOf(url),
      description: null,
      icon: null,
      picture: null,
      ...page,
    });
  }

  reset(): void {
    this.pages.clear();
    this.asked = [];
  }
}

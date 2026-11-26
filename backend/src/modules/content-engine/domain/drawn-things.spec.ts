import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DRAWN_THING_CATEGORIES,
  drawnThings,
  drawnThingsOf,
  findDrawnThingsDirectory,
  thingSilhouetteSvg,
  thingSvg,
  toThe,
} from './drawn-things';

describe('the library of drawn things', () => {
  const things = drawnThings();

  it('is on this host, with its licence beside it', () => {
    const directory = findDrawnThingsDirectory()!;
    expect(directory).not.toBeNull();
    expect(
      readFileSync(join(directory, 'LICENSE-fluent-emoji.txt'), 'utf8'),
    ).toContain('MIT License');
    expect(things.length).toBeGreaterThanOrEqual(250);
  });

  it('holds exactly what the catalog lists, under the same names', () => {
    const catalog = readFileSync(
      join(findDrawnThingsDirectory()!, 'catalog.txt'),
      'utf8',
    )
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => line.split('|').map((part) => part.trim()));
    expect(
      things.map((thing) => [thing.key, thing.ar, thing.category]),
    ).toEqual(catalog.map(([, key, ar, , category]) => [key, ar, category]));
  });

  it('names every thing once, in a known kind', () => {
    expect(new Set(things.map((thing) => thing.key)).size).toBe(things.length);
    // An answer must name one drawing only.
    expect(new Set(things.map((thing) => thing.ar)).size).toBe(things.length);
    expect(new Set(things.map((thing) => thing.the)).size).toBe(things.length);
    for (const thing of things) {
      expect(DRAWN_THING_CATEGORIES).toContain(thing.category);
      expect(thing.key).toMatch(/^[a-z][a-z-]*$/);
      expect(thing.ar).toMatch(/^[؀-ۿ ]+$/);
      expect(thing.the).toMatch(/^[؀-ۿ ]+$/);
    }
  });

  it('holds plain drawings only: nothing that runs, links out or names an id', () => {
    for (const thing of things) {
      expect(thing.body.startsWith('<')).toBe(true);
      // Several drawings share one picture: an id would collide.
      expect(thing.body).not.toMatch(
        /<script|<style|<image|<use|<text|<foreignObject|href|\bid=|url\(|\bon\w+=/i,
      );
    }
  });

  it('has enough of each main kind to dress a puzzle', () => {
    for (const category of [
      'animal',
      'food',
      'object',
      'vehicle',
      'play',
    ] as const) {
      expect(drawnThingsOf(category).length).toBeGreaterThanOrEqual(12);
    }
  });

  it('says «to the thing» the way it is written', () => {
    expect(toThe('القطة')).toBe('للقطة');
    expect(toThe('شنطة الظهر')).toBe('لشنطة الظهر');
    expect(toThe('قوس قزح')).toBe('لقوس قزح');
  });

  it('places a drawing by its centre, and its shadow in one colour', () => {
    const cat = things.find((thing) => thing.key === 'cat')!;
    expect(thingSvg(cat, 100, 60, 40)).toBe(
      `<svg x="80" y="40" width="40" height="40" viewBox="0 0 32 32" fill="none">${cat.body}</svg>`,
    );
    for (const thing of things) {
      const shadow = thingSilhouetteSvg(thing, 0, 0, 32, '#1B1F3B');
      const fills = [...shadow.matchAll(/ fill="([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(new Set(fills.filter((fill) => fill !== 'none'))).toEqual(
        new Set(['#1B1F3B']),
      );
      expect(shadow).not.toContain('opacity=');
    }
  });
});

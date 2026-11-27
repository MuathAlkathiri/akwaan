import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { composeBomb } from './composed-bomb';
import {
  composeDifference,
  differenceDeck,
  differenceScenes,
} from './composed-difference';

describe('وش الفرق؟ (bomb-spot-difference)', () => {
  it('has a reviewed catalogue of scenes, four things each', () => {
    expect(differenceScenes().length).toBeGreaterThanOrEqual(20);
    for (const scene of differenceScenes()) {
      expect(scene.things.length).toBe(4);
      expect(new Set(scene.things.map((thing) => thing.key)).size).toBe(4);
      for (const thing of scene.things)
        expect(thing.answers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('never names the answer in its own prompt', () => {
    for (const { scene, thing } of differenceDeck()) {
      void scene;
      for (const variant of ['went-missing', 'showed-up']) {
        const item = composeDifference(`x:${thing.key}`, variant);
        const words = ` ${normalizeAnswer(item.prompt)} `;
        for (const answer of thing.answers)
          expect(words).not.toContain(` ${normalizeAnswer(answer)} `);
      }
    }
  });

  it('asks the drawing for every thing, and the edit for the one', () => {
    for (let ordinal = 0; ordinal < differenceDeck().length; ordinal += 1) {
      const item = composeDifference(`job:${ordinal}`, 'went-missing');
      const scene = differenceScenes().find(
        (one) => one.key === item.request.sceneKey,
      )!;
      for (const thing of scene.things)
        expect(item.request.drawPrompt).toContain(thing.english);
      expect(item.request.editPrompt).toContain(item.request.thingEnglish);
      expect(item.request.drawPrompt).toMatch(/No text/);
    }
  });

  it('names one drawing per scene, whatever thing is asked', () => {
    const byScene = new Map<string, Set<string>>();
    for (let ordinal = 0; ordinal < differenceDeck().length; ordinal += 1) {
      const { request } = composeDifference(`job:${ordinal}`, 'went-missing');
      if (!byScene.has(request.sceneKey))
        byScene.set(request.sceneKey, new Set());
      byScene.get(request.sceneKey)!.add(request.sceneDrawingKey);
    }
    expect(byScene.size).toBe(differenceScenes().length);
    for (const keys of byScene.values()) expect(keys.size).toBe(1);
  });

  it('says which picture lacks the thing', () => {
    expect(composeDifference('j:0', 'went-missing').request.missingFrom).toBe(
      'second',
    );
    expect(composeDifference('j:0', 'showed-up').request.missingFrom).toBe(
      'first',
    );
    expect(composeDifference('j:0', 'showed-up').prompt).toContain('انضاف');
    expect(composeDifference('j:0', 'went-missing').prompt).toContain('اختفى');
  });

  it('gives one batch different scenes before any scene comes round again', () => {
    const scenes = differenceScenes().length;
    const keys = Array.from({ length: scenes }, (_, ordinal) =>
      composeDifference(`batch-a:${ordinal}`, 'went-missing'),
    );
    expect(new Set(keys.map((item) => item.request.sceneKey)).size).toBe(
      scenes,
    );
    const all = Array.from({ length: differenceDeck().length }, (_, ordinal) =>
      composeDifference(`batch-a:${ordinal}`, 'went-missing'),
    );
    expect(new Set(all.map((item) => item.answerKey)).size).toBe(all.length);
  });

  it('comes out of composeBomb with distinct answers and an image request', () => {
    for (let ordinal = 0; ordinal < 12; ordinal += 1) {
      const item = composeBomb('bomb-spot-difference', `b:${ordinal}`);
      expect(item.difference).toBeDefined();
      expect(item.svg).toBe('');
      expect(item.answerKey).toMatch(/^difference:/);
      const folded = item.acceptedAnswers.map(normalizeAnswer);
      expect(new Set(folded).size).toBe(folded.length);
    }
  });
});

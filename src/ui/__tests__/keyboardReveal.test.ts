import { REVEAL_MARGIN, measureWindowRect, revealOffset } from '../keyboardReveal';

const viewport = { top: 100, bottom: 500 }; // the area above the keyboard, in window dp

describe('revealOffset (scroll needed to show the focused field)', () => {
  it('a fully visible field needs no scroll', () => {
    expect(revealOffset({ top: 200, bottom: 300 }, viewport, 40)).toBeNull();
  });

  it('a field under the keyboard scrolls down until its bottom is visible (+ margin)', () => {
    expect(revealOffset({ top: 520, bottom: 600 }, viewport, 40)).toBe(40 + (600 - (500 - REVEAL_MARGIN)));
  });

  it('a field just touching the margin is moved; exactly at the margin is left alone', () => {
    expect(revealOffset({ top: 400, bottom: 485 }, viewport, 0)).toBe(1);
    expect(revealOffset({ top: 400, bottom: 484 }, viewport, 0)).toBeNull();
  });

  it('a field taller than the visible area: its bottom (the typing position) wins', () => {
    expect(revealOffset({ top: 50, bottom: 900 }, viewport, 10)).toBe(10 + (900 - 484));
  });

  it('a field above the visible area scrolls up, never below 0', () => {
    expect(revealOffset({ top: 60, bottom: 160 }, viewport, 200)).toBe(200 - (116 - 60));
    expect(revealOffset({ top: 60, bottom: 160 }, viewport, 10)).toBe(0);
  });
});

describe('measureWindowRect', () => {
  it('reads the native window frame', async () => {
    const node = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 120, 300, 80),
    };
    await expect(measureWindowRect(node)).resolves.toEqual({ top: 120, bottom: 200 });
  });

  it('no node, or an unusable frame, is null', async () => {
    await expect(measureWindowRect(null)).resolves.toBeNull();
    const broken = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, NaN, 0, 0),
    };
    await expect(measureWindowRect(broken)).resolves.toBeNull();
  });
});

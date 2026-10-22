import { describe, expect, it } from 'vitest';
import { fixtureDifficulty } from '../src/difficulty.js';

describe('fixtureDifficulty', () => {
  it('лидер таблицы — трудный соперник', () => {
    expect(fixtureDifficulty(1, 16)).toBe('hard');
    expect(fixtureDifficulty(5, 16)).toBe('hard');
  });

  it('середина таблицы — средний', () => {
    expect(fixtureDifficulty(6, 16)).toBe('mid');
    expect(fixtureDifficulty(8, 16)).toBe('mid');
    expect(fixtureDifficulty(10, 16)).toBe('mid');
  });

  it('нижняя треть — лёгкий', () => {
    expect(fixtureDifficulty(11, 16)).toBe('easy');
    expect(fixtureDifficulty(16, 16)).toBe('easy');
  });
});

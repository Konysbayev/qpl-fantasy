// Қарсыластың қиындығы кестедегі орны бойынша: жоғарғы үштен бір — қиын, төменгі — жеңіл.

export type Difficulty = 'easy' | 'mid' | 'hard';

export function fixtureDifficulty(opponentRank: number, clubs: number): Difficulty {
  if (opponentRank <= clubs / 3) return 'hard';
  if (opponentRank > (clubs * 2) / 3) return 'easy';
  return 'mid';
}

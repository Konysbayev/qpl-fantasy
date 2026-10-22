// Next.js бетіне енгізілген деректерді (self.__next_f) алады және мәтіннен JSON мәнін оқиды.

export class ParseError extends Error {}

const PUSH_RE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

export function extractFlightText(html: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(PUSH_RE)) parts.push(JSON.parse(m[1]) as string);
  if (parts.length === 0) throw new ParseError('На странице нет встроенных данных (self.__next_f)');
  return parts.join('');
}

// start позициясындағы { немесе [ үшін жұп жақшаны тауып, кесіндіні JSON ретінде оқиды
export function readJsonAt(text: string, start: number): unknown {
  const open = text[start];
  if (open !== '{' && open !== '[') throw new ParseError(`На позиции ${start} нет начала JSON`);
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new ParseError(`JSON с позиции ${start} не закрыт`);
}

// Кілт бойынша барлық мәндерді (объект немесе массив) табады
export function findJsonValues(text: string, key: string): unknown[] {
  const out: unknown[] = [];
  const needle = `"${key}":`;
  let i = text.indexOf(needle);
  while (i !== -1) {
    const at = i + needle.length;
    if (text[at] === '{' || text[at] === '[') {
      try {
        out.push(readJsonAt(text, at));
      } catch {
        // сынған кесінді — келесісін іздейміз
      }
    }
    i = text.indexOf(needle, at);
  }
  return out;
}

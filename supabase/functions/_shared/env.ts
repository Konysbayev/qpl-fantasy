// Deno ортасы: құпиялар мен базаға қосылу (тек index.ts файлдарында қолданылады)
import postgres from 'npm:postgres@3.4.7';

export function secret(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Нет секрета ${name}`);
  return v;
}

// Пулер транзакция режимінде дайындалған сұраулар жұмыс істемейді
export const sql = postgres(secret('SUPABASE_DB_URL'), { prepare: false, max: 3, idle_timeout: 20 });

export const nowSec = (): number => Math.floor(Date.now() / 1000);

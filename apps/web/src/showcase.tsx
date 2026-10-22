// Компоненттер витринасы (тек әзірлеуге, өндіріске жиналмайды): макет SkyV3Chest деректерімен, ?theme=dark&sheet=1
import { createRoot } from 'react-dom/client';
import type { ClubKit } from '../../../packages/core/src/types.js';
import clubsJson from '../../../supabase/seed/clubs.json';
import { BottomNav } from './components/BottomNav.js';
import { Chip3D } from './components/Chip3D.js';
import { GK_KIT } from './components/Kit.js';
import { Pitch } from './components/Pitch.js';
import { PlayerToken, type PlayerTokenProps } from './components/PlayerToken.js';
import { Sheet } from './components/Sheet.js';
import { LangProvider } from './i18n/useT.js';
import { ThemeProvider, useTheme } from './theme/ThemeProvider.js';

const params = new URLSearchParams(location.search);
(window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'showcase', colorScheme: params.get('theme') === 'dark' ? 'dark' : 'light' } };

const clubs = new Map((clubsJson as { code: string; logo: string; kit: ClubKit }[]).map((c) => [c.code, c]));
const mk = (name: string, code: string, points: number | null, o: { c?: boolean; v?: boolean; gk?: boolean; pos?: string; bench?: boolean } = {}): PlayerTokenProps => {
  const club = clubs.get(code)!;
  return {
    name, clubCode: code, strip: club.kit.strip, points, role: o.c ? 'captain' : o.v ? 'vice' : null, kit: o.gk ? GK_KIT : club.kit,
    logoUrl: club.logo, onClick: () => {}, variant: o.bench ? 'bench' : 'pitch', posLabel: o.pos
  };
};

const rows = [
  [mk('Дәулетов', 'ҚСР', 18, { c: true }), mk('Мұратов', 'АҚТ', 4)],
  [mk('Әбілов', 'ҚАЙ', 3), mk('Тоқтаров', 'ҚАЙ', 12), mk('Рахимов', 'ОРД', 5, { v: true }), mk('Қасымов', 'АҚТ', 2)],
  [mk('Ахметов', 'ЕЛМ', 2), mk('Жақсылықов', 'ЕЛМ', 8), mk('Серікбаев', 'АҚТ', 1), mk('Омаров', 'ТОБ', 6)],
  [mk('Сейітов', 'ҚАЙ', 6, { gk: true })]
];
const bench = [
  mk('Ержанов', 'ТОБ', 0, { gk: true, pos: 'ҚҚ', bench: true }), mk('Сәрсенов', 'ОРД', 1, { pos: 'ҚОР', bench: true }),
  mk('Исаев', 'ТОБ', 2, { pos: 'ЖҚ', bench: true }), mk('Байжанов', 'ОРД', 0, { pos: 'ШАБ', bench: true })
];
// Ең ауыр жағдай: қатарда 5 ойыншы, өте ұзын тектер
const wide = [
  [mk('Құдайбергеновтерұлы', 'АСТ', 11, { c: true }), mk('Машаду Мата', 'ҚАЙ', 9), mk('Жақсылықов', 'ЖЕҢ', 7, { v: true }), mk('Милованович', 'ТОБ', 6), mk('Исламхан', 'КСП', null)]
];

function Showcase() {
  const t = useTheme();
  return (
    <div style={{ background: t.bg, color: t.ink, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', flexWrap: 'wrap' }}>
        <Chip3D tone="primary">12-тур</Chip3D>
        <Chip3D tone="gold">К</Chip3D>
        <Chip3D tone="soft">6.0 млн</Chip3D>
      </div>
      <div style={{ margin: '12px 16px 0', height: 470, display: 'flex' }}>
        <Pitch rows={rows} />
      </div>
      <section style={{ margin: '12px 16px 0', background: t.card, borderRadius: 24, padding: '10px 8px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: t.cardShadow }}>
        <span style={{ padding: '0 8px', fontFamily: 'Rubik, system-ui, sans-serif', fontSize: 14, fontWeight: 700 }}>Запас</span>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          {bench.map((p, i) => <PlayerToken key={i} {...p} />)}
        </div>
      </section>
      <BottomNav current="team" onNavigate={() => {}} />
      <div style={{ margin: '0 16px 16px', height: 170, display: 'flex' }}>
        <Pitch rows={wide} />
      </div>
      <Sheet open={params.get('sheet') === '1'} onClose={() => {}} label="Ойыншы картасы">
        <p style={{ padding: '0 16px' }}>Ойыншы картасы (9-тапсырма)</p>
      </Sheet>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <LangProvider lang="kk">
      <Showcase />
    </LangProvider>
  </ThemeProvider>
);

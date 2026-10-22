// Стиль «C 3.1»: спецификацияның 3.1 кестесі мен бекітілген макеттердегі мәндер (SkyV3Chest, Transfer, Player).

export interface Tokens {
  bg: string;
  card: string;
  card2: string;
  ink: string;
  muted: string;
  line: string;
  sheetLine: string;
  primary: string;
  lip: string;
  soft: string;
  softLip: string;
  primaryText: string;
  markTop: string;
  markBottom: string;
  gold: string;
  goldLip: string;
  onGold: string;
  vice: string;
  viceLip: string;
  onVice: string;
  viceBand: string;
  viceBandEdge: string;
  grass1: string;
  grass2: string;
  surroundTop: string;
  surroundBottom: string;
  pitchLine: string;
  chip: string;
  chipShadow: string;
  cardShadow: string;
  buttonShadow: string;
  navShadow: string;
  pitchShadow: string;
  tileLip: string;
  numShadow: string;
  kitLine: string;
  watermarkOp: number;
  selRow: string;
  behind: string;
  scrim: string;
  easy: [string, string];
  mid: [string, string];
  hard: [string, string];
}

export const LIGHT: Tokens = {
  bg: '#EAF2F8', card: '#FFFFFF', card2: '#F2F7FB', ink: '#0F1C26', muted: '#5B6B78', line: '#E1EAF1', sheetLine: '#D5E0E8',
  primary: '#0A74AA', lip: '#075A85', soft: '#DDEFF8', softLip: '#BCDDEE', primaryText: '#08608E',
  markTop: '#3AA7DF', markBottom: '#0A74AA',
  gold: '#F5BF2E', goldLip: '#C48A08', onGold: '#3D2A00',
  vice: '#5B6B78', viceLip: '#3E4C57', onVice: '#FFFFFF', viceBand: '#C3CDD5', viceBandEdge: '#8D99A3',
  grass1: '#52B66F', grass2: '#4BAE67', surroundTop: '#2C8447', surroundBottom: '#3A9A57', pitchLine: 'rgba(255,255,255,0.62)',
  chip: '#FFFFFF', chipShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 0 rgba(15,28,38,0.12), 0 6px 12px rgba(15,28,38,0.2)',
  cardShadow: '0 4px 0 #D3E1EB, 0 10px 24px rgba(15,28,38,0.06)',
  buttonShadow: '0 3px 0 #D3E1EB, 0 6px 14px rgba(15,28,38,0.06)',
  navShadow: '0 4px 0 #D3E1EB, 0 12px 28px rgba(15,28,38,0.12)',
  pitchShadow: '0 4px 0 #2A7A42',
  tileLip: '#DCE7EF', numShadow: 'rgba(10,116,170,0.16)', kitLine: 'rgba(15,28,38,0.35)', watermarkOp: 0.07,
  selRow: '#EEF7FC', behind: '#3A9A57', scrim: 'rgba(10,20,28,0.45)',
  easy: ['#DDEFF8', '#08608E'], mid: ['#FDEFD2', '#7A4A00'], hard: ['#FBDCCB', '#8A2E0B']
};

export const DARK: Tokens = {
  bg: '#0E1621', card: '#18232E', card2: '#213040', ink: '#EEF3F7', muted: '#93A4B2', line: '#263546', sheetLine: '#34465A',
  primary: '#176C99', lip: '#0F4E70', soft: '#1C3446', softLip: '#122535', primaryText: '#8ED0F2',
  markTop: '#3AA7DF', markBottom: '#176C99',
  gold: '#F2C14E', goldLip: '#B98A1C', onGold: '#3D2A00',
  vice: '#93A4B2', viceLip: '#5E6E7B', onVice: '#0E1621', viceBand: '#A9B6C1', viceBandEdge: '#6E7C88',
  grass1: '#2B7A48', grass2: '#276F42', surroundTop: '#123F25', surroundBottom: '#1A5532', pitchLine: 'rgba(255,255,255,0.36)',
  chip: '#18232E', chipShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 3px 0 rgba(0,0,0,0.35), 0 6px 14px rgba(0,0,0,0.4)',
  cardShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 0 rgba(0,0,0,0.25)',
  buttonShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 3px 0 rgba(0,0,0,0.35)',
  navShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 24px rgba(0,0,0,0.45)',
  pitchShadow: '0 4px 0 rgba(0,0,0,0.3)',
  tileLip: 'rgba(0,0,0,0.25)', numShadow: 'rgba(142,208,242,0.18)', kitLine: 'rgba(0,0,0,0.55)', watermarkOp: 0.12,
  selRow: '#1C3446', behind: '#1A5532', scrim: 'rgba(5,10,15,0.62)',
  easy: ['#1C3446', '#8ED0F2'], mid: ['#3A2F17', '#F2C97A'], hard: ['#3E2219', '#F3A07E']
};

export const FONT_NUM = 'Rubik, system-ui, sans-serif';
export const FONT_TEXT = 'Nunito, system-ui, sans-serif';

// Көлемді SVG-футболка (SkyV3Chest): клуб түстері, жылтыр мен көлеңке, бүктемелер, сол жақ кеудеде логотип, жеңде білезік.
import { useId } from 'react';
import type { ClubKit } from '../../../../packages/core/src/types.js';
import { useTheme } from '../theme/ThemeProvider.js';
import { ARMBAND_D, COLLAR_D, CUFFS_D, FOLDS_D, SHIRT_D, SLEEVE_D, STRIPE_D } from './shapes.js';

// Қақпашылар клубқа қарамай бір формада (макет бойынша)
export const GK_KIT: ClubKit = { shirt: '#2F3A44', sleeves: '#2F3A44', trim: '#9ED3F0', stripes: null, strip: ['#2F3A44', '#9ED3F0'] };

export interface KitProps {
  kit: ClubKit;
  logoUrl: string | null;
  size: number;
  armband: 'captain' | 'vice' | null;
}

export function Kit({ kit, logoUrl, size, armband }: KitProps) {
  const t = useTheme();
  const id = useId().replace(/:/g, '');
  // Үлкен футболкада (алаңда) — көлеңке мен бүктемелер
  const big = size >= 50;
  const band = armband === 'captain' ? [t.gold, t.goldLip] : armband === 'vice' ? [t.viceBand, t.viceBandEdge] : null;
  const logo = Math.round(size * 0.24);
  return (
    <div data-kit="" style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {big && <div aria-hidden="true" style={{ position: 'absolute', left: 10, right: 10, bottom: -1, height: 9, borderRadius: '50%', background: 'rgba(0,0,0,0.32)', filter: 'blur(3px)' }} />}
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'relative', display: 'block' }}>
        <defs>
          <linearGradient id={`kit${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="0.42" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id={`sleeve${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
          </linearGradient>
        </defs>
        <path d={SHIRT_D} fill={kit.shirt} />
        {kit.stripes && <path data-part="stripes" d={STRIPE_D} fill={kit.stripes} />}
        <path d={SLEEVE_D} fill={kit.sleeves} />
        {band && <path data-part="armband" d={ARMBAND_D} fill={band[0]} stroke={band[1]} strokeWidth={0.5} />}
        <path d={COLLAR_D} fill="none" stroke={kit.trim} strokeWidth={2.2} strokeLinecap="round" />
        <path d={CUFFS_D} fill="none" stroke={kit.trim} strokeWidth={2} />
        <path d={SHIRT_D} fill="none" stroke={t.kitLine} strokeWidth={0.9} strokeLinejoin="round" />
      </svg>
      {logoUrl && (
        <img src={logoUrl} alt="" style={{ position: 'absolute', left: size * 0.5, top: size * 0.2, width: logo, height: logo, objectFit: 'contain', filter: 'drop-shadow(0 0.5px 0.5px rgba(0,0,0,0.45))' }} />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}>
        <path d={SLEEVE_D} fill={`url(#sleeve${id})`} />
        <path d={SHIRT_D} fill={`url(#kit${id})`} />
        {big && <path d={FOLDS_D} fill="none" stroke="rgba(0,0,0,0.13)" strokeWidth={0.8} strokeLinecap="round" />}
      </svg>
    </div>
  );
}

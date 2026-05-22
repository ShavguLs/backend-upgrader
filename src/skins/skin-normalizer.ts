export interface NormalizedSkin {
  marketHashName: string;
  name: string;
  weapon: string | null;
  category: string | null;
  rarity: string | null;
  rarityColor: string | null;
  exterior: string | null;
}

const EXTERIORS = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle-Scarred',
];

const RARITY_BY_COLOR: Record<string, string> = {
  '#b0c3d9': 'Consumer Grade',
  '#5e98d9': 'Industrial Grade',
  '#4b69ff': 'Mil-Spec Grade',
  '#8847ff': 'Restricted',
  '#d32ce6': 'Classified',
  '#eb4b4b': 'Covert',
  '#e4ae39': 'Extraordinary',
};

const HEX6 = /^[0-9a-f]{6}$/;

export function parseExterior(marketHashName: string): string | null {
  for (const exterior of EXTERIORS) {
    if (marketHashName.endsWith(`(${exterior})`)) {
      return exterior;
    }
  }
  return null;
}

export function stripExteriorSuffix(marketHashName: string): string {
  for (const exterior of EXTERIORS) {
    const suffix = ` (${exterior})`;
    if (marketHashName.endsWith(suffix)) {
      return marketHashName.slice(0, -suffix.length);
    }
  }
  return marketHashName;
}

export function parseWeapon(marketHashName: string): string | null {
  const base = stripExteriorSuffix(marketHashName);
  const pipeIndex = base.indexOf('|');
  if (pipeIndex === -1) {
    return null;
  }
  const weapon = base.slice(0, pipeIndex).trim();
  return weapon.length > 0 ? weapon : null;
}

export function normalizeRarityColor(
  color: string | undefined | null,
): string | null {
  if (!color) {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (!HEX6.test(hex)) {
    return null;
  }
  return `#${hex}`;
}

export function mapRarityColor(
  color: string | undefined | null,
): string | null {
  const normalized = normalizeRarityColor(color);
  if (!normalized) {
    return null;
  }
  return RARITY_BY_COLOR[normalized] || null;
}

export function normalizeSkin(input: {
  marketHashName: string;
  category?: string;
  rarityColor?: string;
}): NormalizedSkin {
  const name = stripExteriorSuffix(input.marketHashName);
  return {
    marketHashName: input.marketHashName,
    name,
    weapon: parseWeapon(input.marketHashName),
    category: input.category || null,
    rarity: mapRarityColor(input.rarityColor),
    rarityColor: normalizeRarityColor(input.rarityColor),
    exterior: parseExterior(input.marketHashName),
  };
}

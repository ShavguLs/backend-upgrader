export interface NormalizedSkin {
  marketHashName: string;
  name: string;
  weapon: string | null;
  category: string | null;
  rarity: string | null;
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
};

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

export function mapRarityColor(
  color: string | undefined | null,
): string | null {
  if (!color) {
    return null;
  }
  return RARITY_BY_COLOR[color.toLowerCase()] || null;
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
    exterior: parseExterior(input.marketHashName),
  };
}

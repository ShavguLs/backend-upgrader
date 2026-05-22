import {
  mapRarityColor,
  normalizeRarityColor,
  normalizeSkin,
  parseExterior,
  parseWeapon,
  stripExteriorSuffix,
} from './skin-normalizer';

describe('skin-normalizer', () => {
  describe('parseExterior', () => {
    it('parses each known exterior suffix', () => {
      expect(parseExterior('AK-47 | Redline (Field-Tested)')).toBe(
        'Field-Tested',
      );
      expect(parseExterior('AWP | Asiimov (Factory New)')).toBe('Factory New');
      expect(parseExterior('M4A1-S | Decimator (Minimal Wear)')).toBe(
        'Minimal Wear',
      );
      expect(parseExterior('USP-S | Cortex (Well-Worn)')).toBe('Well-Worn');
      expect(parseExterior('Glock-18 | Sand Dune (Battle-Scarred)')).toBe(
        'Battle-Scarred',
      );
    });

    it('returns null when no exterior present', () => {
      expect(parseExterior('Karambit | Doppler')).toBeNull();
      expect(parseExterior('Sticker | Foo')).toBeNull();
    });
  });

  describe('stripExteriorSuffix', () => {
    it('removes exterior suffix from display name', () => {
      expect(stripExteriorSuffix('AK-47 | Redline (Field-Tested)')).toBe(
        'AK-47 | Redline',
      );
      expect(stripExteriorSuffix('Karambit | Doppler')).toBe(
        'Karambit | Doppler',
      );
    });
  });

  describe('parseWeapon', () => {
    it('parses left side of pipe', () => {
      expect(parseWeapon('AK-47 | Redline (Field-Tested)')).toBe('AK-47');
      expect(
        parseWeapon('Desert Eagle | Mecha Industries (Field-Tested)'),
      ).toBe('Desert Eagle');
    });

    it('returns null when no pipe present', () => {
      expect(parseWeapon('Sticker Capsule')).toBeNull();
    });
  });

  describe('normalizeRarityColor', () => {
    it('canonicalizes valid hex values', () => {
      expect(normalizeRarityColor('#D32CE6')).toBe('#d32ce6');
      expect(normalizeRarityColor('d32ce6')).toBe('#d32ce6');
      expect(normalizeRarityColor('  #EB4B4B  ')).toBe('#eb4b4b');
    });

    it('returns null for invalid values', () => {
      expect(normalizeRarityColor('#fff')).toBeNull();
      expect(normalizeRarityColor('blue')).toBeNull();
      expect(normalizeRarityColor('')).toBeNull();
      expect(normalizeRarityColor(undefined)).toBeNull();
      expect(normalizeRarityColor(null)).toBeNull();
      expect(normalizeRarityColor('#zzzzzz')).toBeNull();
    });
  });

  describe('mapRarityColor', () => {
    it('maps known colors', () => {
      expect(mapRarityColor('#d32ce6')).toBe('Classified');
      expect(mapRarityColor('#eb4b4b')).toBe('Covert');
      expect(mapRarityColor('#4b69ff')).toBe('Mil-Spec Grade');
    });

    it('accepts uppercase and missing hash', () => {
      expect(mapRarityColor('D32CE6')).toBe('Classified');
    });

    it('returns null for unknown or missing color', () => {
      expect(mapRarityColor('#ffffff')).toBeNull();
      expect(mapRarityColor(undefined)).toBeNull();
      expect(mapRarityColor(null)).toBeNull();
    });
  });

  describe('normalizeSkin', () => {
    it('produces full normalized record', () => {
      const result = normalizeSkin({
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        category: 'Rifles',
        rarityColor: '#D32CE6',
      });

      expect(result).toEqual({
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        name: 'AK-47 | Redline',
        weapon: 'AK-47',
        category: 'Rifles',
        rarity: 'Classified',
        rarityColor: '#d32ce6',
        exterior: 'Field-Tested',
      });
    });

    it('leaves rarity and rarityColor null when input color is invalid', () => {
      const result = normalizeSkin({
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        category: 'Rifles',
        rarityColor: 'not-a-color',
      });

      expect(result.rarity).toBeNull();
      expect(result.rarityColor).toBeNull();
    });
  });
});

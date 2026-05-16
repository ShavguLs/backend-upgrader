import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const localUser = {
  steamId: 'local-test-user',
  displayName: 'Local Test User',
  profileUrl: 'http://localhost/local-test-user',
  avatar: 'http://localhost/local-test-user-avatar.png',
};

const skins = [
  {
    marketHashName: 'AK-47 | Redline (Field-Tested)',
    name: 'AK-47 | Redline',
    weapon: 'AK-47',
    category: 'Rifle',
    rarity: 'Classified',
    exterior: 'Field-Tested',
    priceRub: '1000.00',
  },
  {
    marketHashName: 'AWP | Asiimov (Field-Tested)',
    name: 'AWP | Asiimov',
    weapon: 'AWP',
    category: 'Sniper Rifle',
    rarity: 'Covert',
    exterior: 'Field-Tested',
    priceRub: '6500.00',
  },
  {
    marketHashName: 'M4A1-S | Decimator (Minimal Wear)',
    name: 'M4A1-S | Decimator',
    weapon: 'M4A1-S',
    category: 'Rifle',
    rarity: 'Classified',
    exterior: 'Minimal Wear',
    priceRub: '1800.00',
  },
  {
    marketHashName: 'Glock-18 | Water Elemental (Factory New)',
    name: 'Glock-18 | Water Elemental',
    weapon: 'Glock-18',
    category: 'Pistol',
    rarity: 'Classified',
    exterior: 'Factory New',
    priceRub: '950.00',
  },
  {
    marketHashName: 'USP-S | Cortex (Minimal Wear)',
    name: 'USP-S | Cortex',
    weapon: 'USP-S',
    category: 'Pistol',
    rarity: 'Classified',
    exterior: 'Minimal Wear',
    priceRub: '750.00',
  },
  {
    marketHashName: 'Desert Eagle | Mecha Industries (Field-Tested)',
    name: 'Desert Eagle | Mecha Industries',
    weapon: 'Desert Eagle',
    category: 'Pistol',
    rarity: 'Classified',
    exterior: 'Field-Tested',
    priceRub: '520.00',
  },
  {
    marketHashName: 'P250 | Sand Dune (Field-Tested)',
    name: 'P250 | Sand Dune',
    weapon: 'P250',
    category: 'Pistol',
    rarity: 'Consumer Grade',
    exterior: 'Field-Tested',
    priceRub: '25.00',
  },
  {
    marketHashName: 'MAC-10 | Neon Rider (Minimal Wear)',
    name: 'MAC-10 | Neon Rider',
    weapon: 'MAC-10',
    category: 'SMG',
    rarity: 'Covert',
    exterior: 'Minimal Wear',
    priceRub: '1250.00',
  },
  {
    marketHashName: 'Karambit | Doppler (Factory New)',
    name: 'Karambit | Doppler',
    weapon: 'Karambit',
    category: 'Knife',
    rarity: 'Covert',
    exterior: 'Factory New',
    priceRub: '85000.00',
  },
  {
    marketHashName: 'AK-47 | Slate (Factory New)',
    name: 'AK-47 | Slate',
    weapon: 'AK-47',
    category: 'Rifle',
    rarity: 'Restricted',
    exterior: 'Factory New',
    priceRub: '450.00',
  },
];

async function main() {
  await prisma.user.upsert({
    where: { steamId: localUser.steamId },
    update: {
      displayName: localUser.displayName,
      profileUrl: localUser.profileUrl,
      avatar: localUser.avatar,
      wallet: {
        upsert: {
          update: {
            balance: new Prisma.Decimal('10000.00'),
            currency: 'RUB',
          },
          create: {
            balance: new Prisma.Decimal('10000.00'),
            currency: 'RUB',
          },
        },
      },
    },
    create: {
      ...localUser,
      wallet: {
        create: {
          balance: new Prisma.Decimal('10000.00'),
          currency: 'RUB',
        },
      },
    },
  });

  const lastSyncedAt = new Date();

  for (const skin of skins) {
    await prisma.skin.upsert({
      where: { marketHashName: skin.marketHashName },
      update: {
        name: skin.name,
        weapon: skin.weapon,
        category: skin.category,
        rarity: skin.rarity,
        exterior: skin.exterior,
        imageUrl: `https://steamcommunity-a.akamaihd.net/economy/image/local/${encodeURIComponent(skin.marketHashName)}`,
        priceRub: new Prisma.Decimal(skin.priceRub),
        provider: 'local-seed',
        providerItemId: skin.marketHashName,
        providerRawData: skin,
        lastSyncedAt,
        isActive: true,
      },
      create: {
        ...skin,
        imageUrl: `https://steamcommunity-a.akamaihd.net/economy/image/local/${encodeURIComponent(skin.marketHashName)}`,
        priceRub: new Prisma.Decimal(skin.priceRub),
        provider: 'local-seed',
        providerItemId: skin.marketHashName,
        providerRawData: skin,
        lastSyncedAt,
        isActive: true,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

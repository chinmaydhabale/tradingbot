import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding default strategies to local database...');

  const count = await prisma.strategy.count();
  if (count > 0) {
    console.log('Database already has strategies. Seeding skipped.');
    return;
  }

  await prisma.strategy.createMany({
    data: [
      {
        name: 'EMA-Crossover-Fast',
        description: 'Fast exponential moving averages crossover.',
        config: JSON.stringify({ emaFast: 9, emaSlow: 21 }),
        isActive: true,
        mode: 'AUTO_TRADE',
      },
      {
        name: 'Mean-Reversion-RSI',
        description: 'RSI exit-boundary oversold/overbought scaling strategy.',
        config: JSON.stringify({ rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 }),
        isActive: true,
        mode: 'PAPER_ONLY',
      },
    ],
  });

  console.log('Strategies successfully seeded into SQLite!');
}

main()
  .catch((e) => {
    console.error('Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

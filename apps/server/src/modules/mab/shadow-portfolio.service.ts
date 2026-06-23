import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ShadowPortfolioService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run shadow portfolio equity updates daily at 11:45 PM
   */
  @Cron('45 23 * * *')
  async updateShadowPortfolios(): Promise<void> {
    console.log('Updating shadow portfolios and performance comparison metrics...');

    try {
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true },
      });

      if (activeStrategies.length === 0) return;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const trades = await this.prisma.trade.findMany({
        where: { status: 'CLOSED', entryTime: { gte: thirtyDaysAgo } },
      });

      // 1. Calculate actual MAB returns (trades executed by AUTO_TRADE strategies)
      const mabPnL = trades
        .filter((t) => t.type === 'PAPER') // Paper transactions represent live tests
        .reduce((sum, t) => sum + (t.pnl || 0), 0);

      const mabEquity = 1000.0 + mabPnL; // Standard $1,000 initial benchmark

      // 2. Calculate equal-weighted portfolio performance
      // Sum PnL of all trades divided by number of active strategies to simulate split capital
      const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const equalWeightEquity = 1000.0 + totalPnL / activeStrategies.length;

      // 3. Calculate 100% single best strategy performance
      const strategyTotals: { [id: string]: number } = {};
      for (const t of trades) {
        strategyTotals[t.strategyId] = (strategyTotals[t.strategyId] || 0) + (t.pnl || 0);
      }

      const bestPnL = Math.max(...Object.values(strategyTotals), 0.0);
      const singleBestEquity = 1000.0 + bestPnL;

      // Save comparison snapshot to SQLite database
      await this.prisma.shadowPortfolioSnapshot.create({
        data: {
          mabEquity,
          equalWeightEquity,
          singleBestEquity,
        },
      });

      console.log(`[SHADOW PORTFOLIO] Snapshot created. MAB: $${mabEquity.toFixed(2)} | Equal Weight: $${equalWeightEquity.toFixed(2)} | Single Best: $${singleBestEquity.toFixed(2)}`);
    } catch (error) {
      console.error('Error compiling shadow portfolio equity curves:', error);
    }
  }
}

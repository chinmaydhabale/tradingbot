import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MetaBacktesterService {
  constructor(private prisma: PrismaService) {}

  /**
   * Evaluates the historical accuracy of the Meta Strategy reallocation decisions
   * Returns a comparative backtest log showing actual switching vs baseline performance
   */
  async runMetaBacktest(days: number = 30): Promise<any> {
    console.log(`Starting Meta Strategy backtest over the last ${days} days...`);

    try {
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // 1. Fetch MAB reallocation logs from database
      const mabAllocations = await this.prisma.auditDecision.findMany({
        where: {
          module: 'MAB_ALLOCATOR',
          action: 'REALLOCATE_CAPITAL',
          time: { gte: sinceDate },
        },
        orderBy: { time: 'asc' },
      });

      // 2. Fetch all closed trades in that timeframe
      const trades = await this.prisma.trade.findMany({
        where: {
          status: 'CLOSED',
          entryTime: { gte: sinceDate },
        },
      });

      if (mabAllocations.length === 0 || trades.length === 0) {
        return { message: 'Insufficient allocation logs or trade history for meta backtest.', success: false };
      }

      // Group trades PnL by strategy and day
      const dailyStrategyPnL: { [dateStr: string]: { [strategyId: string]: number } } = {};

      for (const t of trades) {
        const dateStr = t.exitTime ? t.exitTime.toISOString().split('T')[0] : '';
        if (dateStr) {
          if (!dailyStrategyPnL[dateStr]) dailyStrategyPnL[dateStr] = {};
          dailyStrategyPnL[dateStr][t.strategyId] = (dailyStrategyPnL[dateStr][t.strategyId] || 0) + (t.pnl || 0);
        }
      }

      // 3. Replay loop: Calculate equity day-by-day
      let simulatedMabCapital = 1000.0;
      let simulatedHoldEqualCapital = 1000.0;

      const dailyEquities = [];

      for (let i = days; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().split('T')[0];

        // Find active MAB allocation weights for this date
        const activeAlloc = mabAllocations.find((a) => a.time.toISOString().split('T')[0] === dateStr);
        const dailyPnLMap = dailyStrategyPnL[dateStr] || {};

        if (activeAlloc) {
          const parsedData = JSON.parse(activeAlloc.data);
          const allocations = parsedData.allocations || [];

          // Actual allocations sum
          let dayMabPnL = 0;
          let dayEqualPnL = 0;

          for (const alloc of allocations) {
            const pnl = dailyPnLMap[alloc.strategyId] || 0.0;
            // Proportional allocation PnL impact
            dayMabPnL += pnl * alloc.allocationFraction;
            dayEqualPnL += pnl * (1 / allocations.length);
          }

          simulatedMabCapital += dayMabPnL;
          simulatedHoldEqualCapital += dayEqualPnL;

          dailyEquities.push({
            date: dateStr,
            mabEquity: simulatedMabCapital,
            equalWeightEquity: simulatedHoldEqualCapital,
          });
        }
      }

      const backtestSummary = {
        daysChecked: days,
        finalMabEquity: simulatedMabCapital,
        finalEqualWeightEquity: simulatedHoldEqualCapital,
        mabNetOutperformancePct: ((simulatedMabCapital - simulatedHoldEqualCapital) / simulatedHoldEqualCapital) * 100,
        dailyPaths: dailyEquities,
        success: true,
      };

      // Log results to Audit Layer
      await this.prisma.auditDecision.create({
        data: {
          module: 'WFA_ENGINE',
          action: 'META_STRATEGY_BACKTEST_RUN',
          correlationId: `meta_bt_${Date.now()}`,
          data: JSON.stringify(backtestSummary),
          provenance: 'chained-meta-backtest-logs',
        },
      });

      return backtestSummary;
    } catch (error) {
      console.error('Error running Meta Strategy backtest:', error);
      return { success: false, error: error.message };
    }
  }
}

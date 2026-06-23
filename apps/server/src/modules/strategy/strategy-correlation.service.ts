import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class StrategyCorrelationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Runs daily at 3:30 AM to calculate returns correlation across strategies
   */
  @Cron('0 3 * * *')
  async computeCorrelations(): Promise<void> {
    console.log('Calculating strategy correlations...');

    try {
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true },
      });

      if (activeStrategies.length < 2) return;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const strategyReturns: { [strategyId: string]: number[] } = {};

      // Load return series grouped by day
      for (const strategy of activeStrategies) {
        const trades = await this.prisma.trade.findMany({
          where: { strategyId: strategy.id, status: 'CLOSED', entryTime: { gte: thirtyDaysAgo } },
          orderBy: { entryTime: 'asc' },
        });

        // Group returns by date key
        const dailyPnls: { [dateStr: string]: number } = {};
        for (const t of trades) {
          const dateStr = t.exitTime ? t.exitTime.toISOString().split('T')[0] : '';
          if (dateStr) {
            dailyPnls[dateStr] = (dailyPnls[dateStr] || 0) + (t.pnl || 0);
          }
        }

        // Project returns list (last 30 calendar days)
        const returnsArray: number[] = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          const dateStr = d.toISOString().split('T')[0];
          returnsArray.push(dailyPnls[dateStr] || 0.0);
        }
        strategyReturns[strategy.id] = returnsArray;
      }

      // Calculate Pearson correlation matrix
      const matrix: { [pairKey: string]: number } = {};

      for (let i = 0; i < activeStrategies.length; i++) {
        for (let j = i + 1; j < activeStrategies.length; j++) {
          const s1 = activeStrategies[i];
          const s2 = activeStrategies[j];

          const r = this.calculatePearsonCorrelation(strategyReturns[s1.id], strategyReturns[s2.id]);
          matrix[`${s1.name}__${s2.name}`] = r;

          if (r > 0.85) {
            console.warn(`[CORRELATION WARNING] High correlation detected between ${s1.name} and ${s2.name}: ${r.toFixed(2)}`);
          }
        }
      }

      // Log correlation audit trail record
      await this.prisma.auditDecision.create({
        data: {
          module: 'CORRELATION_ENGINE',
          action: 'COMPUTE_CORRELATION_MATRIX',
          correlationId: `corr_matrix_${Date.now()}`,
          data: JSON.stringify(matrix),
          provenance: 'chained-correlation-logs',
        },
      });

      console.log('[CORRELATION ENGINE] Completed correlation matrix run.');
    } catch (error) {
      console.error('Error computing strategy correlations:', error);
    }
  }

  private calculatePearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0 || n !== y.length) return 0.0;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const diffX = x[i] - meanX;
      const diffY = y[i] - meanY;
      num += diffX * diffY;
      denX += diffX * diffX;
      denY += diffY * diffY;
    }

    if (denX === 0 || denY === 0) return 0.0;
    return num / Math.sqrt(denX * denY);
  }
}

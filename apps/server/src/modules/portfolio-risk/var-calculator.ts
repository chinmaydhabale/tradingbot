import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class VarCalculatorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run portfolio-wide VaR calculations every hour
   */
  @Cron('0 * * * *')
  async computePortfolioRisk(): Promise<void> {
    console.log('Calculating Portfolio Value at Risk (VaR)...');

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const trades = await this.prisma.trade.findMany({
        where: {
          status: 'CLOSED',
          entryTime: { gte: thirtyDaysAgo },
        },
      });

      if (trades.length < 5) {
        console.log('Insufficient trade data for VaR. Defaulting to nominal metrics.');
        return;
      }

      // Group returns by day to find daily PnLs
      const dailyPnls: { [dateStr: string]: number } = {};

      for (const trade of trades) {
        const exitDate = trade.exitTime ? trade.exitTime.toISOString().split('T')[0] : '';
        if (exitDate) {
          dailyPnls[exitDate] = (dailyPnls[exitDate] || 0) + (trade.pnl || 0);
        }
      }

      const returnsList = Object.values(dailyPnls).sort((a, b) => a - b);

      if (returnsList.length < 3) {
        console.log('Insufficient daily returns data to compile risk vectors.');
        return;
      }

      // 95% confidence -> 5th percentile of sorted losses
      const index95 = Math.floor(returnsList.length * 0.05);
      const var95Value = Math.abs(returnsList[index95]);

      // Log risk assessment results to Audit Layer
      await this.prisma.auditDecision.create({
        data: {
          module: 'RISK_ENGINE',
          action: 'PORTFOLIO_VAR_CALC',
          correlationId: `risk_var_${Date.now()}`,
          data: JSON.stringify({
            confidenceLevel: 0.95,
            varValue: var95Value,
            worstLosses: returnsList.slice(0, 3),
            totalPeriodsChecked: returnsList.length,
          }),
          provenance: 'chained-risk-logs',
        },
      });

      console.log(`[RISK ENGINE] Portfolio 24h VaR (95% Confidence): $${var95Value.toFixed(2)}`);
    } catch (error) {
      console.error('Error during VaR calculation:', error);
    }
  }
}

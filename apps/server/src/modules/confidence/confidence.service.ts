import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ConfidenceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Recalculate confidence scores for all strategies every 15 minutes
   */
  @Cron('*/15 * * * *')
  async evaluateConfidence(): Promise<void> {
    console.log('Evaluating strategy confidence scores...');

    const strategies = await this.prisma.strategy.findMany();

    for (const strategy of strategies) {
      try {
        // 1. Get latest Edge Score from Database
        const latestEdge = await this.prisma.edgeScore.findFirst({
          where: { strategyId: strategy.id },
          orderBy: { time: 'desc' },
        });

        const c2Edge = latestEdge ? latestEdge.edgeScore7d : 50.0;

        // 2. Win Rate calculation (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentTrades = await this.prisma.trade.findMany({
          where: {
            strategyId: strategy.id,
            status: 'CLOSED',
            entryTime: { gte: thirtyDaysAgo },
          },
        });

        const wins = recentTrades.filter((t) => (t.pnl || 0) > 0);
        const winRate = recentTrades.length > 0 ? wins.length / recentTrades.length : 0.5;
        const c4WinRate = winRate * 100;

        // 3. Risk-Adjusted score based on Profit / Loss standard deviation
        let c5RiskAdj = 50.0;
        if (recentTrades.length >= 3) {
          const gains = recentTrades.map((t) => t.pnl || 0);
          const mean = gains.reduce((sum, val) => sum + val, 0) / gains.length;
          const variance = gains.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / gains.length;
          const stdDev = Math.sqrt(variance);

          // Sharpe approximation: mean / stdDev (with bounds)
          const sharpe = stdDev === 0 ? 0 : mean / stdDev;
          c5RiskAdj = Math.min(Math.max((sharpe + 1) * 50, 0), 100);
        }

        // 4. Sample size penalty (penalize if total trades < 15)
        const totalTradesCount = await this.prisma.trade.count({
          where: { strategyId: strategy.id, status: 'CLOSED' },
        });
        const c7SampleSize = Math.min(totalTradesCount / 15, 1.0) * 100;

        // 5. Placeholders for WFA (C1), Regime (C3), Monte Carlo (C6) [Phase 3 features]
        const c1Wfa = 60.0; // Mock default WFA
        const c3Regime = 55.0; // Mock default regime alignment
        const c6MonteCarlo = 70.0; // Mock default bootstrap survival

        // 6. Weighted Sum Confidence Score (0-100)
        const confidenceScore =
          0.20 * c1Wfa +
          0.20 * c2Edge +
          0.15 * c3Regime +
          0.10 * c4WinRate +
          0.15 * c5RiskAdj +
          0.10 * c6MonteCarlo +
          0.10 * c7SampleSize;

        // 7. Transition strategy operational modes based on scores
        let operationalMode = 'PAPER_ONLY';
        if (confidenceScore >= 80) {
          operationalMode = 'AUTO_TRADE';
        } else if (confidenceScore < 50) {
          operationalMode = 'NO_TRADE';
        }

        // Write snapshot to database
        await this.prisma.confidenceScore.create({
          data: {
            strategyId: strategy.id,
            confidenceScore,
            operationalMode,
            c1Wfa,
            c2Edge,
            c3Regime,
            c4WinRate,
            c5RiskAdj,
            c6MonteCarlo,
            c7SampleSize,
          },
        });

        // Update strategy mode in database
        if (strategy.mode !== operationalMode) {
          await this.prisma.strategy.update({
            where: { id: strategy.id },
            data: { mode: operationalMode },
          });

          await this.prisma.auditDecision.create({
            data: {
              strategyId: strategy.id,
              module: 'CONFIDENCE_ENGINE',
              action: 'UPDATE_MODE',
              correlationId: `conf_action_${strategy.id}`,
              data: JSON.stringify({ previousMode: strategy.mode, newMode: operationalMode, score: confidenceScore }),
              provenance: 'chained-confidence-logs',
            },
          });

          console.log(`[CONFIDENCE ENGINE] Strategy ${strategy.name} mode updated to ${operationalMode} (Score: ${confidenceScore.toFixed(1)})`);
        }
      } catch (error) {
        console.error(`Error in confidence evaluation for strategy ${strategy.id}:`, error);
      }
    }
  }
}

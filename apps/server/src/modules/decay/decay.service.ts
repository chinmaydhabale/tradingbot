import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DecayService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run strategy decay analysis every 15 minutes
   */
  @Cron('*/15 * * * *')
  async monitorDecay(): Promise<void> {
    console.log('Running strategy decay analysis...');

    const strategies = await this.prisma.strategy.findMany();

    for (const strategy of strategies) {
      try {
        const edgeScores = await this.calculateEdgeScores(strategy.id);
        const decayAnalysis = this.analyzeDecayVelocity(edgeScores);

        // Store edge score snapshot in database
        await this.prisma.edgeScore.create({
          data: {
            strategyId: strategy.id,
            edgeScore24h: edgeScores.h24,
            edgeScore3d: edgeScores.d3,
            edgeScore7d: edgeScores.d7,
            edgeScore30d: edgeScores.d30,
            edgeScore90d: edgeScores.d90,
            decayVelocity: decayAnalysis.velocity,
            decayAcceleration: decayAnalysis.acceleration,
            trendDirection: decayAnalysis.direction,
          },
        });

        // Auto-action logic based on edge decay
        if (decayAnalysis.direction === 'CRITICAL' && strategy.mode !== 'NO_TRADE') {
          await this.prisma.strategy.update({
            where: { id: strategy.id },
            data: { mode: 'NO_TRADE', isActive: false },
          });

          await this.logAudit(
            strategy.id,
            'DECAY_ENGINE',
            'DISABLE_STRATEGY',
            `decay_action_${strategy.id}`,
            { reason: 'Critical edge decay velocity detected', scores: edgeScores },
          );
          console.log(`[DECAY AUTO-ACTION] Strategy ${strategy.name} disabled (NO_TRADE).`);
        } else if (decayAnalysis.velocity > 0.4 && strategy.mode === 'AUTO_TRADE') {
          // Demote to paper trading only
          await this.prisma.strategy.update({
            where: { id: strategy.id },
            data: { mode: 'PAPER_ONLY' },
          });

          await this.logAudit(
            strategy.id,
            'DECAY_ENGINE',
            'DEMOTE_STRATEGY',
            `decay_action_${strategy.id}`,
            { reason: 'Significant edge decay velocity (>40%)', scores: edgeScores },
          );
          console.log(`[DECAY AUTO-ACTION] Strategy ${strategy.name} demoted to PAPER_ONLY.`);
        }
      } catch (error) {
        console.error(`Error analyzing decay for strategy ${strategy.id}:`, error);
      }
    }
  }

  /**
   * Helper to calculate statistical edge score based on closed trades history
   */
  private async calculateEdgeScores(strategyId: string) {
    const horizons = {
      h24: new Date(Date.now() - 24 * 60 * 60 * 1000),
      d3: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      d7: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      d30: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      d90: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    };

    const [t24h, t3d, t7d, t30d, t90d] = await Promise.all([
      this.getTradesForPeriod(strategyId, horizons.h24),
      this.getTradesForPeriod(strategyId, horizons.d3),
      this.getTradesForPeriod(strategyId, horizons.d7),
      this.getTradesForPeriod(strategyId, horizons.d30),
      this.getTradesForPeriod(strategyId, horizons.d90),
    ]);

    return {
      h24: this.computeMetricScore(t24h),
      d3: this.computeMetricScore(t3d),
      d7: this.computeMetricScore(t7d),
      d30: this.computeMetricScore(t30d),
      d90: this.computeMetricScore(t90d),
    };
  }

  private async getTradesForPeriod(strategyId: string, since: Date) {
    return this.prisma.trade.findMany({
      where: {
        strategyId,
        status: 'CLOSED',
        entryTime: { gte: since },
      },
    });
  }

  /**
   * Compute edge score (0-100) using Win Rate and Profit Factor metrics
   */
  private computeMetricScore(trades: any[]): number {
    if (trades.length < 3) return 50.0; // Default neutral score for small sample size

    const wins = trades.filter((t) => (t.pnl || 0) > 0);
    const winRate = wins.length / trades.length;

    let grossProfit = 0;
    let grossLoss = 0;

    for (const trade of trades) {
      const pnl = trade.pnl || 0;
      if (pnl > 0) grossProfit += pnl;
      else grossLoss += Math.abs(pnl);
    }

    const profitFactor = grossLoss === 0 ? 3.0 : grossProfit / grossLoss;

    // Normalize metric components
    const winRateScore = Math.min(winRate / 0.6, 1.0) * 100; // Optimal win rate set at 60%
    const profitFactorScore = Math.min((Math.max(profitFactor, 0.5) - 0.5) / 2.0, 1.0) * 100; // Scale PF 0.5-2.5 to 0-100

    // Equal weights
    return 0.5 * winRateScore + 0.5 * profitFactorScore;
  }

  /**
   * Compare short-term performance to baseline to extract decay velocity
   */
  private analyzeDecayVelocity(scores: { h24: number; d3: number; d7: number; d30: number; d90: number }) {
    const shortTerm = (scores.h24 + scores.d3 + scores.d7) / 3;
    const baseline = (scores.d30 + scores.d90) / 2;

    if (baseline === 0) return { velocity: 0, acceleration: 0, direction: 'STABLE' };

    // Decay velocity measures % degradation from baseline
    const velocity = (baseline - shortTerm) / baseline;

    let direction = 'STABLE';
    if (velocity > 0.6 || shortTerm < 20) {
      direction = 'CRITICAL';
    } else if (velocity > 0.3) {
      direction = 'DECAYING';
    } else if (velocity < -0.1) {
      direction = 'IMPROVING';
    }

    return {
      velocity,
      acceleration: 0, // Acceleration requires derivative comparison over multiple periods
      direction,
    };
  }

  private async logAudit(
    strategyId: string,
    module: string,
    action: string,
    correlationId: string,
    data: any,
  ): Promise<void> {
    await this.prisma.auditDecision.create({
      data: {
        strategyId,
        module,
        action,
        correlationId,
        data: JSON.stringify(data),
        provenance: 'chained-decay-logs',
      },
    });
  }
}

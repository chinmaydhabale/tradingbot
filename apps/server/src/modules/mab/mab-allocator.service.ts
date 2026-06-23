import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MabAllocatorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Rebalance capital allocations dynamically every day at 12:00 AM
   */
  @Cron('0 0 * * *')
  async reallocateCapital(): Promise<void> {
    console.log('Initiating MAB capital rebalancing cycle (Thompson Sampling)...');

    try {
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true, mode: 'AUTO_TRADE' },
      });

      if (activeStrategies.length === 0) {
        console.log('No active AUTO_TRADE strategies found for MAB. Skipping.');
        return;
      }

      const totalCapital = 1000.0; // Simulated $1000 total capital pool
      const strategyWeights: { [strategyId: string]: number } = {};
      let totalSampleValue = 0;

      // Thompson Sampling loop
      for (const strategy of activeStrategies) {
        // Fetch win/loss counts for beta parameters
        const closedTrades = await this.prisma.trade.findMany({
          where: { strategyId: strategy.id, status: 'CLOSED' },
          select: { pnl: true },
        });

        const wins = closedTrades.filter((t) => (t.pnl || 0) > 0).length;
        const losses = closedTrades.length - wins;

        // Prior parameters (Add pseudo-counts to avoid zero parameters)
        const alpha = wins + 1;
        const beta = losses + 1;

        // Draw sample from Beta(alpha, beta) distribution
        const sampleVal = this.sampleBeta(alpha, beta);
        strategyWeights[strategy.id] = sampleVal;
        totalSampleValue += sampleVal;
      }

      // Proportional capital weight allocations
      const allocations = [];
      for (const strategy of activeStrategies) {
        const rawWeight = strategyWeights[strategy.id];
        const allocationFraction = totalSampleValue === 0 ? 1 / activeStrategies.length : rawWeight / totalSampleValue;
        const allocatedAmount = totalCapital * allocationFraction;

        allocations.push({
          strategyId: strategy.id,
          strategyName: strategy.name,
          allocatedAmount,
          allocationFraction,
        });

        // Update strategy config with new capital allocation limits
        const currentConfig = typeof strategy.config === 'string' ? JSON.parse(strategy.config) : strategy.config;
        await this.prisma.strategy.update({
          where: { id: strategy.id },
          data: {
            config: JSON.stringify({
              ...currentConfig,
              allocatedCapital: allocatedAmount,
            }),
          },
        });
      }

      // Log allocation decision to Audit Layer
      await this.prisma.auditDecision.create({
        data: {
          module: 'MAB_ALLOCATOR',
          action: 'REALLOCATE_CAPITAL',
          correlationId: `mab_alloc_${Date.now()}`,
          data: JSON.stringify({ totalPool: totalCapital, allocations }),
          provenance: 'chained-mab-logs',
        },
      });

      console.log('[MAB ALLOCATOR] Reallocation completed:', JSON.stringify(allocations));
    } catch (error) {
      console.error('Error during MAB reallocation:', error);
    }
  }

  /**
   * Beta distribution sampler using Marsaglia and Tsang approximation for Gamma distributions
   */
  private sampleBeta(alpha: number, beta: number): number {
    const x = this.sampleGamma(alpha, 1);
    const y = this.sampleGamma(beta, 1);
    return x + y === 0 ? 0.5 : x / (x + y);
  }

  private sampleGamma(alpha: number, beta: number): number {
    let sum = 0;
    // Approximated Gamma sampler for integer pseudo-counts
    const shape = Math.max(Math.floor(alpha), 1);
    for (let i = 0; i < shape; i++) {
      sum += -Math.log(Math.random());
    }
    return sum * beta;
  }
}

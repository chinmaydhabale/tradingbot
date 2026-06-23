import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class StrategyRetirementService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run strategy retirement checks daily at 4:30 AM
   */
  @Cron('30 4 * * *')
  async evaluateRetirements(): Promise<void> {
    console.log('Evaluating strategy retirement criteria...');

    try {
      const activeStrategies = await this.prisma.strategy.findMany({
        where: { isActive: true },
      });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      for (const strategy of activeStrategies) {
        // Fetch all confidence snapshots in the last 30 days
        const snapshots = await this.prisma.confidenceScore.findMany({
          where: {
            strategyId: strategy.id,
            time: { gte: thirtyDaysAgo },
          },
          orderBy: { time: 'asc' },
        });

        // Skip if strategy has not been running for at least 30 days
        if (snapshots.length < 30) continue;

        // Check if all snapshots in the last 30 days have been NO_TRADE or confidence score < 45
        const isDeadEdge = snapshots.every((snap) => snap.confidenceScore < 45.0 || snap.operationalMode === 'NO_TRADE');

        if (isDeadEdge) {
          // Deactivate and retire strategy
          await this.prisma.strategy.update({
            where: { id: strategy.id },
            data: {
              isActive: false,
              mode: 'RETIRED',
            },
          });

          // Log retirement event to Audit Layer
          await this.prisma.auditDecision.create({
            data: {
              strategyId: strategy.id,
              module: 'RETIREMENT_ENGINE',
              action: 'AUTO_RETIRE_STRATEGY',
              correlationId: `retire_${strategy.id}_${Date.now()}`,
              data: JSON.stringify({
                reason: 'No statistical edge/confidence below 45 for 30 consecutive days',
                snapshotsCount: snapshots.length,
              }),
              provenance: 'chained-retirement-logs',
            },
          });

          console.warn(`[RETIREMENT ENGINE] ⚠️ Strategy retired: ${strategy.name} automatically disabled.`);
        }
      }
    } catch (error) {
      console.error('Error during strategy retirement sweeps:', error);
    }
  }
}

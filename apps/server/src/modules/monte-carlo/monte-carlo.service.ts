import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import { Worker } from 'worker_threads';
import * as path from 'path';

@Injectable()
export class MonteCarloService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run Monte Carlo simulations at 3:00 AM nightly
   */
  @Cron('0 3 * * *')
  async runNightlySimulations(): Promise<void> {
    console.log('Initiating nightly Monte Carlo risk simulations...');

    const strategies = await this.prisma.strategy.findMany();

    for (const strategy of strategies) {
      try {
        // Fetch all trade PnLs for this strategy
        const trades = await this.prisma.trade.findMany({
          where: { strategyId: strategy.id, status: 'CLOSED' },
          select: { pnl: true },
        });

        const returns = trades.map((t) => t.pnl || 0).filter((p) => p !== 0);

        if (returns.length < 5) {
          console.log(`Insufficient historical trades (${returns.length}/5) for Monte Carlo simulations on ${strategy.name}.`);
          continue;
        }

        // Setup background worker configuration
        const workerPath = path.resolve(__dirname, 'workers/monte-carlo.worker.js');
        const worker = new Worker(workerPath, {
          workerData: {
            returns,
            initialCapital: 1000.0, // Nominally simulate starting with $1,000
            simCount: 200,          // Kept small (200 instead of 1000) for VPS CPU limits
            steps: 50,              // Simulate next 50 trades
          },
        });

        worker.on('message', async (message) => {
          if (message.success) {
            // Save results to Audit Layer
            await this.prisma.auditDecision.create({
              data: {
                strategyId: strategy.id,
                module: 'MONTE_CARLO_ENGINE',
                action: 'MONTE_CARLO_RUN',
                correlationId: `mc_run_${strategy.id}_${Date.now()}`,
                data: JSON.stringify({
                  ruinProbability: message.ruinProbability,
                  medianDrawdown: message.medianDrawdown,
                  totalTradesChecked: returns.length,
                }),
                provenance: 'chained-monte-carlo-logs',
              },
            });
            console.log(`[MONTE CARLO] Completed for ${strategy.name}. Ruin Prob: ${(message.ruinProbability * 100).toFixed(1)}%`);
          }
        });

        worker.on('error', (err) => {
          console.error(`Monte Carlo worker error for strategy ${strategy.id}:`, err);
        });

      } catch (error) {
        console.error(`Error starting Monte Carlo simulation for ${strategy.id}:`, error);
      }
    }
  }
}

import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import { StrategyRunner, StrategyConfig } from '../strategy/strategy-runner';

@Injectable()
export class WfaOptimizerService {
  constructor(
    private prisma: PrismaService,
    private runner: StrategyRunner,
  ) {}

  /**
   * Run Walk Forward Optimization sequentially at 2:00 AM nightly
   */
  @Cron('0 2 * * *')
  async runNightlyOptimization(): Promise<void> {
    console.log('Starting nightly Walk Forward Analysis (WFA) optimization...');

    const strategies = await this.prisma.strategy.findMany({
      where: { isActive: true },
    });

    for (const strategy of strategies) {
      try {
        console.log(`Running WFA for strategy ${strategy.name}...`);
        
        // Fetch 90 days of 1-hour candles (or equivalent representation)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const candles = await this.prisma.ohlcv.findMany({
          where: {
            symbol: 'BTC/USDT',
            exchange: 'bybit',
            interval: '1m', // For VPS limits, we run on stored 1m candles but sample every 60th candle to simulate 1h interval
            time: { gte: ninetyDaysAgo },
          },
          orderBy: { time: 'asc' },
        });

        // Downsample to 1h candles to keep calculations fast
        const hourlyCandles = candles.filter((_, idx) => idx % 60 === 0);

        if (hourlyCandles.length < 500) {
          console.log(`Insufficient candle sample size (${hourlyCandles.length}/500) for WFA. Skipping.`);
          continue;
        }

        const wfaResult = await this.optimizeWalkForward(strategy.name, hourlyCandles);

        // Record WFA findings to Institutional Audit Layer
        await this.prisma.auditDecision.create({
          data: {
            strategyId: strategy.id,
            module: 'WFA_ENGINE',
            action: 'WFA_OPTIMIZE_RUN',
            correlationId: `wfa_run_${strategy.id}_${Date.now()}`,
            data: JSON.stringify(wfaResult),
            provenance: 'chained-wfa-logs',
          },
        });

        console.log(`[WFA] WFA completed for ${strategy.name}. Efficiency: ${wfaResult.efficiency.toFixed(2)}`);
      } catch (error) {
        console.error(`Error during WFA run for strategy ${strategy.id}:`, error);
      }
    }
  }

  /**
   * Performs WFA by splitting historical candles into overlapping training (IS) and testing (OOS) windows
   */
  private async optimizeWalkForward(strategyName: string, candles: any[]) {
    // We split 90 days of hourly candles (~2160 candles) into 3 rolling windows:
    // Window size: 30 days IS (720 candles), 10 days OOS (240 candles)
    // Shift step: 10 days (240 candles)
    const windowIsSize = 720;
    const windowOosSize = 240;
    const stepSize = 240;

    const windowsResults = [];
    let isPerformanceSum = 0;
    let oosPerformanceSum = 0;

    for (let wIndex = 0; wIndex < 3; wIndex++) {
      const isStart = wIndex * stepSize;
      const isEnd = isStart + windowIsSize;
      const oosStart = isEnd;
      const oosEnd = oosStart + windowOosSize;

      if (oosEnd > candles.length) break;

      const isCandles = candles.slice(isStart, isEnd);
      const oosCandles = candles.slice(oosStart, oosEnd);

      // Sweep parameters to find best configuration
      const bestParams = await this.parameterGridSweep(strategyName, isCandles);
      const isPnl = this.simulatePerformance(strategyName, isCandles, bestParams);
      const oosPnl = this.simulatePerformance(strategyName, oosCandles, bestParams);

      isPerformanceSum += isPnl;
      oosPerformanceSum += oosPnl;

      windowsResults.push({
        windowIndex: wIndex,
        optimizedParams: bestParams,
        inSamplePnl: isPnl,
        outOfSamplePnl: oosPnl,
        passed: oosPnl > 0,
      });
    }

    // Walk Forward Efficiency: OOS average return / IS average return
    const avgIs = isPerformanceSum / 3;
    const avgOos = oosPerformanceSum / 3;
    const efficiency = avgIs === 0 ? 0 : Math.max(avgOos / avgIs, 0);

    return {
      efficiency,
      windows: windowsResults,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Simple grid search over standard parameter configurations
   */
  private async parameterGridSweep(strategyName: string, candles: any[]): Promise<StrategyConfig> {
    const sweepRange = [
      { emaFast: 5, emaSlow: 20 },
      { emaFast: 9, emaSlow: 21 },
      { emaFast: 12, emaSlow: 26 },
    ];

    let bestPnl = -999999;
    let bestConfig = sweepRange[1];

    for (const config of sweepRange) {
      const pnl = this.simulatePerformance(strategyName, candles, config);
      if (pnl > bestPnl) {
        bestPnl = pnl;
        bestConfig = config;
      }
    }

    return bestConfig;
  }

  /**
   * Helper to run indicators inside historical backtest windows
   */
  private simulatePerformance(strategyName: string, candles: any[], config: StrategyConfig): number {
    let position = 0; // -1 Short, 0 Flat, 1 Long
    let entryPrice = 0;
    let totalPnl = 0;

    // Run simple step-by-step indicator updates over the period
    for (let i = 26; i < candles.length; i++) {
      const windowSlice = candles.slice(0, i + 1);
      const close = candles[i].close;
      
      const signal = this.calculateSignalMock(strategyName, windowSlice, config);

      if (signal === 'BUY' && position <= 0) {
        if (position === -1) {
          totalPnl += entryPrice - close; // Close short
        }
        position = 1;
        entryPrice = close;
      } else if (signal === 'SELL' && position >= 0) {
        if (position === 1) {
          totalPnl += close - entryPrice; // Close long
        }
        position = -1;
        entryPrice = close;
      }
    }

    return totalPnl;
  }

  private calculateSignalMock(strategyName: string, candles: any[], config: StrategyConfig): 'BUY' | 'SELL' | 'HOLD' {
    const closes = candles.map((c) => c.close);
    if (strategyName === 'EMA-Crossover-Fast') {
      const fast = config.emaFast || 9;
      const slow = config.emaSlow || 21;
      const len = closes.length;
      if (len < slow) return 'HOLD';
      
      const prevFastEma = closes[len - 2]; // Simplify calculation to mock ticks
      const currFastEma = closes[len - 1];
      if (currFastEma > prevFastEma) return 'BUY';
      if (currFastEma < prevFastEma) return 'SELL';
    }
    return 'HOLD';
  }
}

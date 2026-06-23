import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';
import { StrategyRunner } from './strategy-runner';
import { PaperTradingService } from './paper-trading.service';
import { MarketCircuitBreakerService } from '../risk/market-circuit-breaker.service';

@Injectable()
export class StrategyExecutionService {
  constructor(
    private prisma: PrismaService,
    private runner: StrategyRunner,
    private paperTrading: PaperTradingService,
    private circuitBreaker: MarketCircuitBreakerService,
  ) {}

  /**
   * Runs every 1 minute to check active strategies
   */
  @Cron('*/1 * * * *')
  async executeActiveStrategies(): Promise<void> {
    if (this.circuitBreaker.getIsLocked()) {
      console.warn(`[EXECUTION BLOCKED] Trading is currently locked by Circuit Breaker: ${this.circuitBreaker.getLockReason()}`);
      return;
    }
    console.log('Running active strategy evaluation cycles...');

    // Fetch all strategies (active & background shadow paper trading)
    const activeStrategies = await this.prisma.strategy.findMany();

    if (activeStrategies.length === 0) {
      console.log('No active strategies found. Skipping cycle.');
      return;
    }

    for (const strategy of activeStrategies) {
      try {
        const symbol = 'BTC/USDT'; // Configurable, default to BTC

        // Fetch recent 100 candles for indicator calculations
        const candles = await this.prisma.ohlcv.findMany({
          where: { symbol, exchange: 'bybit', interval: '1m' },
          orderBy: { time: 'desc' },
          take: 100,
        });

        // Reverse to chronological order (past to present)
        candles.reverse();

        if (candles.length < 50) {
          console.log(`Insufficient candles (${candles.length}/50) for ${strategy.name}. Skipping.`);
          continue;
        }

        const latestPrice = candles[candles.length - 1].close;

        // Run technical indicator logic
        const config = typeof strategy.config === 'string' ? JSON.parse(strategy.config) : strategy.config;
        const signal = await this.runner.runStrategy(
          strategy.name,
          candles,
          config,
        );

        console.log(`Strategy [${strategy.name}] generated signal: ${signal} at price: ${latestPrice}`);

        // Dispatch signals to the paper trading transaction gate
        await this.paperTrading.handleSignal(strategy.id, symbol, signal, latestPrice);
      } catch (error) {
        console.error(`Error executing strategy ${strategy.name}:`, error);
      }
    }
  }
}

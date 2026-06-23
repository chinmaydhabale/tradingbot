import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MarketCircuitBreakerService {
  private isLocked = false;
  private lockReason = '';

  constructor(private prisma: PrismaService) {}

  /**
   * Periodically check market volatility limits every 5 minutes
   */
  @Cron('*/5 * * * *')
  async monitorMarketCircuit(): Promise<void> {
    try {
      const symbol = 'BTC/USDT';
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const candles = await this.prisma.ohlcv.findMany({
        where: { symbol, exchange: 'bybit', interval: '1m', time: { gte: oneHourAgo } },
        orderBy: { time: 'asc' },
      });

      if (candles.length < 15) return;

      const firstPrice = candles[0].close;
      const latestPrice = candles[candles.length - 1].close;
      const priceVolatility = Math.abs(latestPrice - firstPrice) / firstPrice;

      // Volatility exceeds 10% inside 1 hour -> trigger circuit breaker halt
      if (priceVolatility >= 0.10) {
        this.isLocked = true;
        this.lockReason = `Extreme market movement detected: ${(priceVolatility * 100).toFixed(1)}% price shift in 1 hour. Halt triggered.`;
        
        console.warn(`[CIRCUIT BREAKER] ⚠️ TRADING LOCKED: ${this.lockReason}`);

        // Log breaker trigger in audit database
        await this.prisma.auditDecision.create({
          data: {
            module: 'CIRCUIT_BREAKER',
            action: 'HALT_TRADING',
            correlationId: `circuit_halt_${Date.now()}`,
            data: JSON.stringify({ volatility: priceVolatility, basePrice: firstPrice, haltPrice: latestPrice }),
            provenance: 'chained-circuit-logs',
          },
        });

        // Demote all strategies to NO_TRADE instantly
        await this.prisma.strategy.updateMany({
          data: { mode: 'NO_TRADE' },
        });
      } else if (this.isLocked && priceVolatility < 0.03) {
        // Recovery: if volatility drops below 3% in recent periods, auto-release lock
        this.isLocked = false;
        this.lockReason = '';
        console.log('[CIRCUIT BREAKER] Market stabilized. Release lock.');
      }
    } catch (error) {
      console.error('Error monitoring circuit breaker bounds:', error);
    }
  }

  /**
   * Check if circuit breaker is locked
   */
  getIsLocked(): boolean {
    return this.isLocked;
  }

  getLockReason(): string {
    return this.lockReason;
  }
}

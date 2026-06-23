import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DataQualityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cleans and validates incoming candle streams before database upsertions
   * Returns clean candle properties or null if bad tick detected
   */
  async cleanCandle(
    symbol: string,
    exchange: string,
    interval: string,
    timestamp: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number,
  ): Promise<{ time: Date; open: number; high: number; low: number; close: number; volume: number } | null> {
    
    // 1. Bad Tick Detection: Check for anomalous price swings (e.g. price change > 50% in a single candle)
    const lastCandle = await this.prisma.ohlcv.findFirst({
      where: { symbol, exchange, interval },
      orderBy: { time: 'desc' },
    });

    if (lastCandle) {
      const priceChangePct = Math.abs(close - lastCandle.close) / lastCandle.close;
      if (priceChangePct > 0.50) {
        console.warn(`[DATA QUALITY] Rejected anomalous bad tick on ${symbol} (Price shift: ${(priceChangePct * 100).toFixed(1)}%). Price: ${close}`);
        return null; // Discard outliers
      }

      // 2. Gap Detection & Interpolation (if time gap > 2 minutes on a 1m interval)
      const expectedTime = lastCandle.time.getTime() + 60 * 1000;
      const actualTime = timestamp;
      const gapSizeMs = actualTime - expectedTime;

      if (gapSizeMs > 60 * 1000) {
        const gapMinutes = Math.floor(gapSizeMs / (60 * 1000));
        console.log(`[DATA QUALITY] Gap detected on ${symbol} of ${gapMinutes} candles. Interpolating missing candles...`);

        // Linearly interpolate prices to fill database gaps
        const priceDiff = close - lastCandle.close;
        const priceStep = priceDiff / (gapMinutes + 1);

        for (let i = 1; i <= gapMinutes; i++) {
          const interpolatedTime = new Date(expectedTime + (i - 1) * 60 * 1000);
          const interpolatedPrice = lastCandle.close + priceStep * i;

          await this.prisma.ohlcv.upsert({
            where: {
              symbol_exchange_interval_time: {
                symbol,
                exchange,
                interval,
                time: interpolatedTime,
              },
            },
            create: {
              symbol,
              exchange,
              interval,
              time: interpolatedTime,
              open: interpolatedPrice,
              high: interpolatedPrice,
              low: interpolatedPrice,
              close: interpolatedPrice,
              volume: 0, // Mock zero volume for interpolated gaps
            },
            update: {},
          });
        }
      }
    }

    return {
      time: new Date(timestamp),
      open,
      high,
      low,
      close,
      volume,
    };
  }
}

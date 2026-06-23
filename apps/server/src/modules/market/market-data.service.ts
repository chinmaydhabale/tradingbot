import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { DataQualityService } from './data-quality.service';
import { DashboardGateway } from '../gateway/dashboard.gateway';

@Injectable()
export class MarketDataService implements OnModuleInit, OnModuleDestroy {
  private exchange: any;
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private dataQuality: DataQualityService,
    private gateway: DashboardGateway,
  ) {}

  async onModuleInit() {
    this.isRunning = true;
    try {
      const ccxt = await (Function('return import("ccxt")')() as Promise<any>);
      this.exchange = new ccxt.pro.bybit({
        enableRateLimit: true,
        options: {
          defaultType: 'swap',
        },
      });
      // Fetch historical candles to bootstrap the database immediately
      await this.seedHistoricalCandles();
      this.startIngestionLoop();
    } catch (err) {
      console.error('Failed to initialize CCXT pro bybit exchange:', err);
    }
  }

  private async seedHistoricalCandles() {
    try {
      console.log('Fetching historical candles for BTC/USDT to bootstrap the engine...');
      const symbol = 'BTC/USDT:USDT';
      const interval = '1m';
      
      const historicalCandles = await this.exchange.fetchOHLCV(symbol, interval, undefined, 100);
      
      if (historicalCandles && historicalCandles.length > 0) {
        console.log(`Fetched ${historicalCandles.length} historical candles. Seeding into SQLite...`);
        let seeded = 0;
        
        for (const candle of historicalCandles) {
          const [timestamp, open, high, low, close, volume] = candle;
          
          const cleaned = await this.dataQuality.cleanCandle(
            'BTC/USDT',
            'bybit',
            '1m',
            timestamp,
            open,
            high,
            low,
            close,
            volume,
          );
          
          if (!cleaned) continue;
          
          await this.prisma.ohlcv.upsert({
            where: {
              symbol_exchange_interval_time: {
                symbol: 'BTC/USDT',
                exchange: 'bybit',
                interval: '1m',
                time: cleaned.time,
              },
            },
            create: {
              symbol: 'BTC/USDT',
              exchange: 'bybit',
              interval: '1m',
              time: cleaned.time,
              open: cleaned.open,
              high: cleaned.high,
              low: cleaned.low,
              close: cleaned.close,
              volume: cleaned.volume,
            },
            update: {
              open: cleaned.open,
              high: cleaned.high,
              low: cleaned.low,
              close: cleaned.close,
              volume: cleaned.volume,
            },
          });
          seeded++;
        }
        console.log(`Successfully bootstrapped ${seeded} historical candles!`);
      }
    } catch (error) {
      console.error('Error bootstrapping historical candles:', error);
    }
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.exchange) {
      try {
        await this.exchange.close();
      } catch (err) {
        console.error('Error closing exchange websocket:', err);
      }
    }
  }

  private async startIngestionLoop() {
    const symbol = 'BTC/USDT:USDT';
    const interval = '1m';

    console.log(`Starting real-time market data ingestion loop for ${symbol}...`);

    while (this.isRunning) {
      try {
        const candles = await this.exchange.watchOHLCV(symbol, interval);
        if (candles && candles.length > 0) {
          const latestCandle = candles[candles.length - 1];
          const [timestamp, open, high, low, close, volume] = latestCandle;

          // Broadcast real-time BTC price tick to WebSocket clients!
          this.gateway.broadcastEvent('ticker', { symbol: 'BTC/USDT', price: close, timestamp });

          const cleaned = await this.dataQuality.cleanCandle(
            'BTC/USDT',
            'bybit',
            '1m',
            timestamp,
            open,
            high,
            low,
            close,
            volume,
          );

          if (!cleaned) continue;

          await this.prisma.ohlcv.upsert({
            where: {
              symbol_exchange_interval_time: {
                symbol: 'BTC/USDT',
                exchange: 'bybit',
                interval: '1m',
                time: cleaned.time,
              },
            },
            create: {
              symbol: 'BTC/USDT',
              exchange: 'bybit',
              interval: '1m',
              time: cleaned.time,
              open: cleaned.open,
              high: cleaned.high,
              low: cleaned.low,
              close: cleaned.close,
              volume: cleaned.volume,
            },
            update: {
              open: cleaned.open,
              high: cleaned.high,
              low: cleaned.low,
              close: cleaned.close,
              volume: cleaned.volume,
            },
          });
        }
      } catch (error) {
        console.error('CCXT Ingestion stream error, retrying in 5s:', error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

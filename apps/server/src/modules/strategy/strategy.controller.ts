import { Controller, Get, Patch, Param, Body, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Controller('api')
export class StrategyController {
  constructor(private prisma: PrismaService) {}

  @Get('strategies')
  async getStrategies() {
    return this.prisma.strategy.findMany({
      include: {
        confidenceScores: {
          take: 1,
          orderBy: { time: 'desc' },
        },
        edgeScores: {
          take: 1,
          orderBy: { time: 'desc' },
        },
      },
    });
  }

  @Patch('strategies/:id')
  async toggleStrategy(
    @Param('id') id: string,
    @Body() body: { isActive: boolean; mode?: string },
  ) {
    return this.prisma.strategy.update({
      where: { id },
      data: {
        isActive: body.isActive,
        mode: body.mode || undefined,
      },
    });
  }

  @Get('trades')
  async getTrades() {
    return this.prisma.trade.findMany({
      take: 50,
      orderBy: { entryTime: 'desc' },
      include: { strategy: true },
    });
  }

  @Get('audits')
  async getAudits() {
    return this.prisma.auditDecision.findMany({
      take: 50,
      orderBy: { time: 'desc' },
    });
  }

  @Get('regimes')
  async getRegimes() {
    return this.prisma.regimeTransition.findMany({
      take: 10,
      orderBy: { time: 'desc' },
    });
  }

  @Get('market/price')
  async getLatestPrice() {
    const latestCandle = await this.prisma.ohlcv.findFirst({
      where: { symbol: 'BTC/USDT', exchange: 'bybit', interval: '1m' },
      orderBy: { time: 'desc' },
    });
    return {
      symbol: 'BTC/USDT',
      price: latestCandle ? latestCandle.close : 64000.0,
      timestamp: latestCandle ? latestCandle.time.getTime() : Date.now(),
    };
  }


  @Get('strategies/performance')
  async getStrategiesPerformance() {
    const strategies = await this.prisma.strategy.findMany();
    const now = Date.now();
    const horizons = {
      '24h': now - 24 * 3600 * 1000,
      '2d': now - 2 * 24 * 3600 * 1000,
      '3d': now - 3 * 24 * 3600 * 1000,
      '4d': now - 4 * 24 * 3600 * 1000,
      '5d': now - 5 * 24 * 3600 * 1000,
      '7d': now - 7 * 24 * 3600 * 1000,
      '1m': now - 30 * 24 * 3600 * 1000,
    };

    const result = [];

    for (const strategy of strategies) {
      const trades = await this.prisma.trade.findMany({
        where: {
          strategyId: strategy.id,
          status: 'CLOSED',
        },
        orderBy: { exitTime: 'desc' },
      });

      const stats: Record<string, any> = {};
      for (const [key, limitTime] of Object.entries(horizons)) {
        const filtered = trades.filter(t => t.exitTime && new Date(t.exitTime).getTime() >= limitTime);
        const wins = filtered.filter(t => (t.pnl || 0) > 0);
        const losses = filtered.filter(t => (t.pnl || 0) <= 0);
        
        stats[key] = {
          totalTrades: filtered.length,
          wins: wins.length,
          losses: losses.length,
          winRate: filtered.length > 0 ? (wins.length / filtered.length) * 100 : 0,
          netPnl: filtered.reduce((sum, t) => sum + (t.pnl || 0), 0),
        };
      }

      result.push({
        id: strategy.id,
        name: strategy.name,
        mode: strategy.mode,
        isActive: strategy.isActive,
        stats,
      });
    }

    return result;
  }

  /**
   * Endpoint to initialize seed strategies (useful for scratch setup)
   */
  @Post('seed')
  async seedStrategies() {
    // Delete existing data to allow clean re-seeding
    await this.prisma.auditDecision.deleteMany();
    await this.prisma.trade.deleteMany();
    await this.prisma.confidenceScore.deleteMany();
    await this.prisma.edgeScore.deleteMany();
    await this.prisma.regimeTransition.deleteMany();
    await this.prisma.strategy.deleteMany();

    // 1. Create Strategies
    const emaStrat = await this.prisma.strategy.create({
      data: {
        name: 'EMA-Crossover-Fast',
        description: 'Fast exponential moving averages crossover.',
        config: JSON.stringify({ emaFast: 9, emaSlow: 21 }),
        isActive: true,
        mode: 'AUTO_TRADE',
      },
    });

    const rsiStrat = await this.prisma.strategy.create({
      data: {
        name: 'Mean-Reversion-RSI',
        description: 'RSI exit-boundary oversold/overbought scaling strategy.',
        config: JSON.stringify({ rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 }),
        isActive: true,
        mode: 'PAPER_ONLY',
      },
    });

    const bbStrat = await this.prisma.strategy.create({
      data: {
        name: 'Breakout-Bollinger',
        description: 'Bollinger Band breakout trend strategy.',
        config: JSON.stringify({ period: 20, stdDev: 2.0 }),
        isActive: true,
        mode: 'PAPER_ONLY',
      },
    });

    const macdStrat = await this.prisma.strategy.create({
      data: {
        name: 'MACD-Momentum',
        description: 'Moving Average Convergence Divergence trend momentum follower.',
        config: JSON.stringify({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }),
        isActive: true,
        mode: 'AUTO_TRADE',
      },
    });

    const confluenceStrat = await this.prisma.strategy.create({
      data: {
        name: 'Confluence-EMA-RSI',
        description: 'Trend-momentum confluence strategy combining EMA direction filter and RSI entry triggers.',
        config: JSON.stringify({ emaPeriod: 50, rsiPeriod: 14, rsiOversold: 40, rsiOverbought: 60 }),
        isActive: true,
        mode: 'PAPER_ONLY',
      },
    });

    const emaTripleStrat = await this.prisma.strategy.create({
      data: {
        name: 'EMA-Triple-Cross',
        description: 'Triple EMA crossover trend alignment strategy.',
        config: JSON.stringify({ emaFast: 9, emaMedium: 21, emaSlow: 50 }),
        isActive: true,
        mode: 'AUTO_TRADE',
      },
    });

    const stochStrat = await this.prisma.strategy.create({
      data: {
        name: 'Stochastic-Oscillator',
        description: 'Oversold/overbought Stochastic momentum crossover strategy.',
        config: JSON.stringify({ kPeriod: 14, dPeriod: 3, oversold: 20, overbought: 80 }),
        isActive: true,
        mode: 'PAPER_ONLY',
      },
    });

    // 2. Create historical Regime Transitions
    await this.prisma.regimeTransition.createMany({
      data: [
        {
          symbol: 'BTC/USDT',
          previousRegime: 'LOW_VOL',
          currentRegime: 'BULL_TREND',
          reason: 'EMA Crossover buy confirmation with volume expansion',
          time: new Date(Date.now() - 3600 * 1000 * 24 * 3), // 3 days ago
        },
        {
          symbol: 'BTC/USDT',
          previousRegime: 'BULL_TREND',
          currentRegime: 'HIGH_VOL',
          reason: 'CPI announcement caused volatile price swings',
          time: new Date(Date.now() - 3600 * 1000 * 24 * 2), // 2 days ago
        },
        {
          symbol: 'BTC/USDT',
          previousRegime: 'HIGH_VOL',
          currentRegime: 'BULL_TREND',
          reason: 'Consolidation resolved upwards with strong support',
          time: new Date(Date.now() - 3600 * 1000 * 12), // 12 hrs ago
        },
      ],
    });

    // 3. Create mock trades
    await this.prisma.trade.createMany({
      data: [
        {
          strategyId: emaStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 62500,
          exitPrice: 63800,
          quantity: 0.05,
          pnl: 65.0, // (63800 - 62500) * 0.05
          entryTime: new Date(Date.now() - 3600 * 1000 * 48),
          exitTime: new Date(Date.now() - 3600 * 1000 * 40),
          correlationId: 'corr_ema_001',
        },
        {
          strategyId: emaStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 63900,
          exitPrice: 63500,
          quantity: 0.05,
          pnl: -20.0, // (63500 - 63900) * 0.05
          entryTime: new Date(Date.now() - 3600 * 1000 * 36),
          exitTime: new Date(Date.now() - 3600 * 1000 * 30),
          correlationId: 'corr_ema_002',
        },
        {
          strategyId: rsiStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 61800,
          exitPrice: 62700,
          quantity: 0.04,
          pnl: 36.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 24),
          exitTime: new Date(Date.now() - 3600 * 1000 * 20),
          correlationId: 'corr_rsi_001',
        },
        {
          strategyId: bbStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 63000,
          exitPrice: 64200,
          quantity: 0.05,
          pnl: 60.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 18),
          exitTime: new Date(Date.now() - 3600 * 1000 * 12),
          correlationId: 'corr_bb_001',
        },
        {
          strategyId: macdStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 62900,
          exitPrice: 63700,
          quantity: 0.05,
          pnl: 40.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 10),
          exitTime: new Date(Date.now() - 3600 * 1000 * 6),
          correlationId: 'corr_macd_001',
        },
        {
          strategyId: confluenceStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 63500,
          exitPrice: 64000,
          quantity: 0.05,
          pnl: 25.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 5),
          exitTime: new Date(Date.now() - 3600 * 1000 * 2),
          correlationId: 'corr_conf_001',
        },
        {
          strategyId: emaTripleStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 63200,
          exitPrice: 64100,
          quantity: 0.05,
          pnl: 45.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 15),
          exitTime: new Date(Date.now() - 3600 * 1000 * 11),
          correlationId: 'corr_3ema_001',
        },
        {
          strategyId: stochStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'CLOSED',
          entryPrice: 63600,
          exitPrice: 64300,
          quantity: 0.05,
          pnl: 35.0,
          entryTime: new Date(Date.now() - 3600 * 1000 * 8),
          exitTime: new Date(Date.now() - 3600 * 1000 * 4),
          correlationId: 'corr_stoch_001',
        },
        {
          strategyId: emaStrat.id,
          symbol: 'BTC/USDT',
          side: 'BUY',
          type: 'PAPER',
          status: 'OPEN',
          entryPrice: 64200,
          quantity: 0.05,
          entryTime: new Date(Date.now() - 3600 * 1000 * 2),
          correlationId: 'corr_ema_active',
        },
      ],
    });

    // 4. Create historical Confidence Scores & Edge Scores
    await this.prisma.confidenceScore.createMany({
      data: [
        {
          strategyId: emaStrat.id,
          confidenceScore: 89.5,
          operationalMode: 'AUTO_TRADE',
          c1Wfa: 85,
          c2Edge: 90,
          c3Regime: 88,
          c4WinRate: 92,
          c5RiskAdj: 87,
          c6MonteCarlo: 91,
          c7SampleSize: 90,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: rsiStrat.id,
          confidenceScore: 62.0,
          operationalMode: 'PAPER_ONLY',
          c1Wfa: 60,
          c2Edge: 65,
          c3Regime: 55,
          c4WinRate: 64,
          c5RiskAdj: 70,
          c6MonteCarlo: 58,
          c7SampleSize: 62,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: bbStrat.id,
          confidenceScore: 78.0,
          operationalMode: 'PAPER_ONLY',
          c1Wfa: 75,
          c2Edge: 80,
          c3Regime: 72,
          c4WinRate: 82,
          c5RiskAdj: 76,
          c6MonteCarlo: 79,
          c7SampleSize: 80,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: macdStrat.id,
          confidenceScore: 85.0,
          operationalMode: 'AUTO_TRADE',
          c1Wfa: 82,
          c2Edge: 87,
          c3Regime: 84,
          c4WinRate: 88,
          c5RiskAdj: 83,
          c6MonteCarlo: 86,
          c7SampleSize: 85,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: confluenceStrat.id,
          confidenceScore: 72.5,
          operationalMode: 'PAPER_ONLY',
          c1Wfa: 70,
          c2Edge: 74,
          c3Regime: 68,
          c4WinRate: 75,
          c5RiskAdj: 73,
          c6MonteCarlo: 71,
          c7SampleSize: 74,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: emaTripleStrat.id,
          confidenceScore: 82.5,
          operationalMode: 'AUTO_TRADE',
          c1Wfa: 80,
          c2Edge: 84,
          c3Regime: 81,
          c4WinRate: 85,
          c5RiskAdj: 80,
          c6MonteCarlo: 83,
          c7SampleSize: 85,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: stochStrat.id,
          confidenceScore: 74.0,
          operationalMode: 'PAPER_ONLY',
          c1Wfa: 71,
          c2Edge: 75,
          c3Regime: 70,
          c4WinRate: 78,
          c5RiskAdj: 73,
          c6MonteCarlo: 74,
          c7SampleSize: 78,
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
      ],
    });

    await this.prisma.edgeScore.createMany({
      data: [
        {
          strategyId: emaStrat.id,
          edgeScore24h: 84.2,
          edgeScore3d: 82.1,
          edgeScore7d: 79.5,
          edgeScore30d: 75.0,
          edgeScore90d: 72.4,
          decayVelocity: 0.12,
          decayAcceleration: 0.01,
          trendDirection: 'IMPROVING',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: rsiStrat.id,
          edgeScore24h: 52.0,
          edgeScore3d: 55.4,
          edgeScore7d: 58.1,
          edgeScore30d: 61.2,
          edgeScore90d: 63.5,
          decayVelocity: -0.08,
          decayAcceleration: -0.02,
          trendDirection: 'STABLE',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: bbStrat.id,
          edgeScore24h: 74.5,
          edgeScore3d: 72.0,
          edgeScore7d: 69.1,
          edgeScore30d: 64.0,
          edgeScore90d: 60.5,
          decayVelocity: 0.15,
          decayAcceleration: 0.02,
          trendDirection: 'IMPROVING',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: macdStrat.id,
          edgeScore24h: 81.0,
          edgeScore3d: 79.4,
          edgeScore7d: 76.5,
          edgeScore30d: 71.0,
          edgeScore90d: 68.2,
          decayVelocity: 0.10,
          decayAcceleration: 0.01,
          trendDirection: 'IMPROVING',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: confluenceStrat.id,
          edgeScore24h: 68.4,
          edgeScore3d: 66.1,
          edgeScore7d: 64.0,
          edgeScore30d: 59.5,
          edgeScore90d: 57.0,
          decayVelocity: 0.05,
          decayAcceleration: 0.00,
          trendDirection: 'STABLE',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: emaTripleStrat.id,
          edgeScore24h: 78.5,
          edgeScore3d: 76.2,
          edgeScore7d: 74.0,
          edgeScore30d: 69.5,
          edgeScore90d: 66.8,
          decayVelocity: 0.08,
          decayAcceleration: 0.01,
          trendDirection: 'IMPROVING',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
        {
          strategyId: stochStrat.id,
          edgeScore24h: 70.2,
          edgeScore3d: 68.0,
          edgeScore7d: 65.5,
          edgeScore30d: 60.2,
          edgeScore90d: 58.0,
          decayVelocity: 0.06,
          decayAcceleration: 0.00,
          trendDirection: 'STABLE',
          time: new Date(Date.now() - 3600 * 1000 * 2),
        },
      ],
    });

    // 5. Create Audit decisions
    await this.prisma.auditDecision.createMany({
      data: [
        {
          module: 'MAB_ALLOCATOR',
          action: 'ACTIVATE',
          correlationId: 'corr_ema_001',
          data: JSON.stringify({ reason: 'EMA strategy Sharpe ratio 2.45 exceeds threshold', allocationWeight: 0.65 }),
          provenance: '0xabcde12345f7890',
          time: new Date(Date.now() - 3600 * 1000 * 48),
        },
        {
          module: 'WFA_ENGINE',
          action: 'PROMOTE',
          correlationId: 'corr_rsi_001',
          data: JSON.stringify({ reason: 'RSI strategy passed out-of-sample forward walk verification', winRate: 0.58 }),
          provenance: '0x12345abcdef7890',
          time: new Date(Date.now() - 3600 * 1000 * 24),
        },
        {
          module: 'DECAY_ENGINE',
          action: 'DEMOTE',
          correlationId: 'corr_bb_decay',
          data: JSON.stringify({ reason: 'Bollinger strategy edge score fell below 30', currentScore: 22.5 }),
          provenance: '0x7890abcdef12345',
          time: new Date(Date.now() - 3600 * 1000 * 12),
        },
      ],
    });

    return { message: 'Strategies, historical trades, regime logs, and audit trails successfully seeded!' };
  }
}

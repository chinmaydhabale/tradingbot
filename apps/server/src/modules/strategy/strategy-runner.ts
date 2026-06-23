import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EMA, RSI, BollingerBands, MACD, Stochastic } from 'technicalindicators';

export interface StrategyConfig {
  emaFast?: number;
  emaSlow?: number;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  period?: number;
  stdDev?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  emaPeriod?: number;
  emaMedium?: number;
  kPeriod?: number;
  dPeriod?: number;
  oversold?: number;
  overbought?: number;
}

@Injectable()
export class StrategyRunner {
  constructor(private prisma: PrismaService) {}

  /**
   * Run strategy logic on historical candles
   * Returns signal: 'BUY' | 'SELL' | 'HOLD'
   */
  async runStrategy(
    strategyName: string,
    candles: any[],
    config: StrategyConfig,
  ): Promise<'BUY' | 'SELL' | 'HOLD'> {
    if (candles.length < 50) return 'HOLD'; // Insufficient historical data

    const closes = candles.map((c) => c.close);

    switch (strategyName) {
      case 'EMA-Crossover-Fast':
        return this.runEmaCrossover(closes, config.emaFast || 9, config.emaSlow || 21);

      case 'Mean-Reversion-RSI':
        return this.runRsiMeanReversion(
          closes,
          config.rsiPeriod || 14,
          config.rsiOversold || 30,
          config.rsiOverbought || 70,
        );

      case 'Breakout-Bollinger':
        return this.runBollingerBreakout(
          closes,
          config.period || 20,
          config.stdDev || 2.0
        );

      case 'MACD-Momentum':
        return this.runMacdMomentum(
          closes,
          config.fastPeriod || 12,
          config.slowPeriod || 26,
          config.signalPeriod || 9
        );

      case 'Confluence-EMA-RSI':
        return this.runConfluenceEmaRsi(
          closes,
          config.emaPeriod || 50,
          config.rsiPeriod || 14,
          config.rsiOversold || 40,
          config.rsiOverbought || 60
        );

      case 'EMA-Triple-Cross':
        return this.runEmaTripleCross(
          closes,
          config.emaFast || 9,
          config.emaMedium || 21,
          config.emaSlow || 50
        );

      case 'Stochastic-Oscillator':
        return this.runStochasticOscillator(
          candles.map(c => c.high),
          candles.map(c => c.low),
          closes,
          config.kPeriod || 14,
          config.dPeriod || 3,
          config.oversold || 20,
          config.overbought || 80
        );

      default:
        return 'HOLD';
    }
  }

  private runEmaCrossover(closes: number[], fastPeriod: number, slowPeriod: number): 'BUY' | 'SELL' | 'HOLD' {
    const emaFastValues = EMA.calculate({ values: closes, period: fastPeriod });
    const emaSlowValues = EMA.calculate({ values: closes, period: slowPeriod });

    if (emaFastValues.length < 2 || emaSlowValues.length < 2) return 'HOLD';

    const prevFast = emaFastValues[emaFastValues.length - 2];
    const currFast = emaFastValues[emaFastValues.length - 1];
    
    const prevSlow = emaSlowValues[emaSlowValues.length - 2];
    const currSlow = emaSlowValues[emaSlowValues.length - 1];

    // Fast crosses above slow -> Bullish crossover
    if (prevFast <= prevSlow && currFast > currSlow) {
      return 'BUY';
    }
    // Fast crosses below slow -> Bearish crossunder
    if (prevFast >= prevSlow && currFast < currSlow) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runRsiMeanReversion(
    closes: number[],
    period: number,
    oversold: number,
    overbought: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const rsiValues = RSI.calculate({ values: closes, period });
    if (rsiValues.length < 2) return 'HOLD';

    const prevRsi = rsiValues[rsiValues.length - 2];
    const currRsi = rsiValues[rsiValues.length - 1];

    // Exit oversold boundary -> Buy trigger
    if (prevRsi <= oversold && currRsi > oversold) {
      return 'BUY';
    }
    // Exit overbought boundary -> Sell trigger
    if (prevRsi >= overbought && currRsi < overbought) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runBollingerBreakout(
    closes: number[],
    period: number,
    stdDev: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const bbValues = BollingerBands.calculate({ values: closes, period, stdDev });
    if (bbValues.length < 2) return 'HOLD';

    const prevClose = closes[closes.length - 2];
    const currClose = closes[closes.length - 1];

    const prevBB = bbValues[bbValues.length - 2];
    const currBB = bbValues[bbValues.length - 1];

    if (!prevBB || !currBB) return 'HOLD';

    // Close crosses above upper band -> BUY (breakout)
    if (prevClose <= prevBB.upper && currClose > currBB.upper) {
      return 'BUY';
    }
    // Close crosses below lower band -> SELL (breakdown)
    if (prevClose >= prevBB.lower && currClose < currBB.lower) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runMacdMomentum(
    closes: number[],
    fastPeriod: number,
    slowPeriod: number,
    signalPeriod: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const macdValues = MACD.calculate({
      values: closes,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    if (macdValues.length < 2) return 'HOLD';

    const prevVal = macdValues[macdValues.length - 2];
    const currVal = macdValues[macdValues.length - 1];

    if (!prevVal || !currVal || prevVal.histogram === undefined || currVal.histogram === undefined) {
      return 'HOLD';
    }

    // Histogram crosses above 0 -> BUY
    if (prevVal.histogram <= 0 && currVal.histogram > 0) {
      return 'BUY';
    }
    // Histogram crosses below 0 -> SELL
    if (prevVal.histogram >= 0 && currVal.histogram < 0) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runConfluenceEmaRsi(
    closes: number[],
    emaPeriod: number,
    rsiPeriod: number,
    rsiOversold: number,
    rsiOverbought: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const emaValues = EMA.calculate({ values: closes, period: emaPeriod });
    const rsiValues = RSI.calculate({ values: closes, period: rsiPeriod });

    if (emaValues.length < 2 || rsiValues.length < 2) return 'HOLD';

    const currClose = closes[closes.length - 1];
    const currEma = emaValues[emaValues.length - 1];

    const prevRsi = rsiValues[rsiValues.length - 2];
    const currRsi = rsiValues[rsiValues.length - 1];

    const isUptrend = currClose > currEma;
    const isDowntrend = currClose < currEma;

    // RSI crosses above oversold level in uptrend -> BUY
    if (isUptrend && prevRsi <= rsiOversold && currRsi > rsiOversold) {
      return 'BUY';
    }
    // RSI crosses below overbought level in downtrend -> SELL
    if (isDowntrend && prevRsi >= rsiOverbought && currRsi < rsiOverbought) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runEmaTripleCross(
    closes: number[],
    fastPeriod: number,
    mediumPeriod: number,
    slowPeriod: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const fastValues = EMA.calculate({ values: closes, period: fastPeriod });
    const medValues = EMA.calculate({ values: closes, period: mediumPeriod });
    const slowValues = EMA.calculate({ values: closes, period: slowPeriod });

    if (fastValues.length < 2 || medValues.length < 2 || slowValues.length < 2) return 'HOLD';

    const prevFast = fastValues[fastValues.length - 2];
    const currFast = fastValues[fastValues.length - 1];

    const prevMed = medValues[medValues.length - 2];
    const currMed = medValues[medValues.length - 1];

    const currSlow = slowValues[slowValues.length - 1];

    // Bullish: fast crosses above medium, while medium is above slow
    if (prevFast <= prevMed && currFast > currMed && currMed > currSlow) {
      return 'BUY';
    }

    // Bearish: fast crosses below medium, while medium is below slow
    if (prevFast >= prevMed && currFast < currMed && currMed < currSlow) {
      return 'SELL';
    }

    return 'HOLD';
  }

  private runStochasticOscillator(
    highs: number[],
    lows: number[],
    closes: number[],
    kPeriod: number,
    dPeriod: number,
    oversold: number,
    overbought: number,
  ): 'BUY' | 'SELL' | 'HOLD' {
    const stochValues = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: kPeriod,
      signalPeriod: dPeriod,
    });

    if (stochValues.length < 2) return 'HOLD';

    const prevVal = stochValues[stochValues.length - 2];
    const currVal = stochValues[stochValues.length - 1];

    if (!prevVal || !currVal || prevVal.k === undefined || prevVal.d === undefined || currVal.k === undefined || currVal.d === undefined) {
      return 'HOLD';
    }

    // K crosses above D below the oversold line -> BUY
    if (prevVal.k <= prevVal.d && currVal.k > currVal.d && currVal.k < oversold) {
      return 'BUY';
    }

    // K crosses below D above the overbought line -> SELL
    if (prevVal.k >= prevVal.d && currVal.k < currVal.d && currVal.k > overbought) {
      return 'SELL';
    }

    return 'HOLD';
  }
}

const { BollingerBands, MACD } = require('technicalindicators');

const closes = [
  64000, 64100, 64200, 64150, 64050, 64000, 63900, 63800, 63750, 63800,
  63900, 64000, 64100, 64200, 64300, 64400, 64500, 64600, 64550, 64500,
  64400, 64300, 64200, 64100, 64200, 64300, 64400, 64500, 64600, 64700,
  64800, 64900, 65000, 65100, 65200, 65100, 65000, 64900, 64800, 64700,
  64600, 64500, 64400, 64300, 64200, 64100, 64000, 63900, 63800, 63700
];

console.log('Closes length:', closes.length);

const bbInput = {
  period: 20,
  stdDev: 2,
  values: closes
};

try {
  const bbResult = BollingerBands.calculate(bbInput);
  console.log('BollingerBands first result:', bbResult[0]);
  console.log('BollingerBands last result:', bbResult[bbResult.length - 1]);
} catch (e) {
  console.error('BollingerBands failed:', e);
}

const macdInput = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  values: closes,
  SimpleMAOscillator: false,
  SimpleMASignal: false
};

try {
  const macdResult = MACD.calculate(macdInput);
  console.log('MACD first result:', macdResult[0]);
  console.log('MACD last result:', macdResult[macdResult.length - 1]);
} catch (e) {
  console.error('MACD failed:', e);
}

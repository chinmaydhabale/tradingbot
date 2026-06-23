import { parentPort, workerData } from 'worker_threads';

/**
 * Monte Carlo Simulation Background Worker Thread
 */
function runSimulation() {
  const { returns, initialCapital, simCount, steps } = workerData;

  if (!returns || returns.length === 0) {
    parentPort?.postMessage({ ruinProbability: 0, medianDrawdown: 0, success: false });
    return;
  }

  const simulations = [];
  let ruinCount = 0;

  for (let i = 0; i < simCount; i++) {
    let capital = initialCapital;
    let peak = capital;
    let maxDrawdown = 0;
    let ruined = false;

    for (let s = 0; s < steps; s++) {
      // Bootstrap selection: pick random return
      const randomIdx = Math.floor(Math.random() * returns.length);
      const ret = returns[randomIdx];
      capital += ret;

      if (capital <= 0) {
        ruined = true;
        capital = 0;
        break; // Account is ruined, stop path
      }

      if (capital > peak) peak = capital;
      const drawdown = peak === 0 ? 0 : (peak - capital) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    if (ruined) ruinCount++;
    simulations.push({ finalEquity: capital, maxDrawdown });
  }

  // Calculate median drawdown
  const drawdowns = simulations.map((s) => s.maxDrawdown).sort((a, b) => a - b);
  const medianDrawdown = drawdowns.length > 0 ? drawdowns[Math.floor(drawdowns.length / 2)] : 0;

  parentPort?.postMessage({
    ruinProbability: ruinCount / simCount,
    medianDrawdown,
    success: true,
  });
}

runSimulation();

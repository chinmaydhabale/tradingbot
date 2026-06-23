import { Injectable } from '@nestjs/common';

export interface SimulatedOrderResponse {
  filledPrice: number;
  filledQuantity: number;
  slippagePct: number;
  latencyMs: number;
}

@Injectable()
export class ExecutionSimulatorService {
  /**
   * Simulates realistic transaction fills (slippage + latency + partial fills)
   */
  async simulateFill(
    side: 'BUY' | 'SELL',
    requestedPrice: number,
    requestedQuantity: number,
  ): Promise<SimulatedOrderResponse> {
    
    // 1. Latency Simulation: Random execution delay between 50ms and 250ms
    const latencyMs = Math.floor(Math.random() * 200) + 50;
    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    // 2. Slippage Simulation: Slippage ranges from 0.02% to 0.08%
    const slippagePct = (Math.random() * 0.06 + 0.02) / 100;
    
    // For BUY, slippage shifts entry price UP. For SELL, slippage shifts exit price DOWN.
    const priceMultiplier = side === 'BUY' ? (1 + slippagePct) : (1 - slippagePct);
    const filledPrice = requestedPrice * priceMultiplier;

    // 3. Partial Fills Simulation: 8% chance of partial fill (e.g. filling between 70% and 95% of order size)
    let filledQuantity = requestedQuantity;
    const isPartialFill = Math.random() < 0.08;

    if (isPartialFill) {
      const fillPercentage = Math.random() * 0.25 + 0.70; // 70% to 95%
      filledQuantity = requestedQuantity * fillPercentage;
      console.log(`[EXEC SIMULATOR] Partial fill event: only ${Math.round(fillPercentage * 100)}% of order size filled.`);
    }

    return {
      filledPrice,
      filledQuantity,
      slippagePct,
      latencyMs,
    };
  }
}

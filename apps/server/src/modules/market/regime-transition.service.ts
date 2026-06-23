import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class RegimeTransitionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run transition probability predictions daily at 4:00 AM
   */
  @Cron('0 4 * * *')
  async predictTransitions(): Promise<void> {
    console.log('Calculating regime transition probability vectors (Markov chain)...');

    try {
      const transitions = await this.prisma.regimeTransition.findMany({
        take: 500, // Load recent transition paths
        orderBy: { time: 'asc' },
      });

      if (transitions.length < 10) {
        console.log('Insufficient transition history to build predictive vectors.');
        return;
      }

      // 1. Calculate frequency states
      // Structure: { [previousState]: { [currentState]: count } }
      const frequencyMatrix: { [prev: string]: { [curr: string]: number } } = {};
      const totalOutflow: { [state: string]: number } = {};

      for (const t of transitions) {
        const prev = t.previousRegime;
        const curr = t.currentRegime;

        if (!frequencyMatrix[prev]) frequencyMatrix[prev] = {};
        frequencyMatrix[prev][curr] = (frequencyMatrix[prev][curr] || 0) + 1;
        totalOutflow[prev] = (totalOutflow[prev] || 0) + 1;
      }

      // 2. Normalize frequencies into probability distributions (Markov chain)
      const probabilityMatrix: { [prev: string]: { [curr: string]: number } } = {};

      for (const prev of Object.keys(frequencyMatrix)) {
        probabilityMatrix[prev] = {};
        const outflow = totalOutflow[prev];

        for (const curr of Object.keys(frequencyMatrix[prev])) {
          const count = frequencyMatrix[prev][curr];
          probabilityMatrix[prev][curr] = outflow === 0 ? 0 : count / outflow;
        }
      }

      // 3. Log findings into Audit Layer
      await this.prisma.auditDecision.create({
        data: {
          module: 'REGIME_PREDICTION_ENGINE',
          action: 'COMPUTE_MARKOV_TRANSITION_PROBABILITY',
          correlationId: `regime_prob_${Date.now()}`,
          data: JSON.stringify(probabilityMatrix),
          provenance: 'chained-regime-predictions-logs',
        },
      });

      console.log('[REGIME PREDICTOR] Markov chain probabilities calculated:', JSON.stringify(probabilityMatrix));
    } catch (error) {
      console.error('Error in regime transition predictor calculations:', error);
    }
  }
}

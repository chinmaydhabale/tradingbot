import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ExplainabilityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Compiles a human-readable explanation of why a strategy was allocated a certain mode/capital
   */
  async generateStrategyExplanation(strategyId: string): Promise<string> {
    try {
      const strategy = await this.prisma.strategy.findUnique({
        where: { id: strategyId },
      });

      if (!strategy) return 'Strategy not found.';

      // Get latest confidence score snapshot
      const latestConfidence = await this.prisma.confidenceScore.findFirst({
        where: { strategyId },
        orderBy: { time: 'desc' },
      });

      if (!latestConfidence) {
        return `Strategy '${strategy.name}' has no recorded confidence snapshots yet. Evaluation pending.`;
      }

      const score = latestConfidence.confidenceScore;
      const mode = latestConfidence.operationalMode;

      let explanation = `Strategy '${strategy.name}' is currently running in *${mode}* mode with a composite confidence score of *${score.toFixed(1)}/100*.\n\n`;
      explanation += `### Score Component Attribution:\n`;
      explanation += `- **Walk Forward Analysis ($C_1$):** ${latestConfidence.c1Wfa.toFixed(1)}/100 (Weight: 20%)\n`;
      explanation += `- **Decay Edge ($C_2$):** ${latestConfidence.c2Edge.toFixed(1)}/100 (Weight: 20%)\n`;
      explanation += `- **Regime Match ($C_3$):** ${latestConfidence.c3Regime.toFixed(1)}/100 (Weight: 15%)\n`;
      explanation += `- **Win Rate ($C_4$):** ${latestConfidence.c4WinRate.toFixed(1)}/100 (Weight: 10%)\n`;
      explanation += `- **Risk-Adjusted PnL ($C_5$):** ${latestConfidence.c5RiskAdj.toFixed(1)}/100 (Weight: 15%)\n`;
      explanation += `- **Monte Carlo Survival ($C_6$):** ${latestConfidence.c6MonteCarlo.toFixed(1)}/100 (Weight: 10%)\n`;
      explanation += `- **Sample Size ($C_7$):** ${latestConfidence.c7SampleSize.toFixed(1)}/100 (Weight: 10%)\n\n`;

      if (mode === 'AUTO_TRADE') {
        explanation += `**Selection Logic:** Sourced from its strong performance in WFA validations and resilient returns correlation metrics. The MAB Allocator has activated this strategy to trade live capital.`;
      } else if (mode === 'PAPER_ONLY') {
        explanation += `**Selection Logic:** The strategy has a positive edge but remains below the 80/100 confidence threshold required for live execution. It continues running in paper-trading sandbox mode to collect more returns data.`;
      } else {
        explanation += `**Selection Logic:** Suspended. Composite confidence fell below 50/100, which usually signals performance decay or changes in market regime. Auto-protection gates have locked live and paper executions.`;
      }

      return explanation;
    } catch (error) {
      console.error('Error generating explainable AI log:', error);
      return `Failed to compile attribution summary: ${error.message}`;
    }
  }
}

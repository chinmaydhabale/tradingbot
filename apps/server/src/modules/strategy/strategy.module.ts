import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { StrategyRunner } from './strategy-runner';
import { PaperTradingService } from './paper-trading.service';
import { StrategyExecutionService } from './strategy-execution.service';
import { StrategyController } from './strategy.controller';
import { MarketCircuitBreakerService } from '../risk/market-circuit-breaker.service';
import { ExecutionSimulatorService } from './execution-simulator.service';
import { StrategyCorrelationService } from './strategy-correlation.service';

@Module({
  controllers: [StrategyController],
  providers: [PrismaService, StrategyRunner, PaperTradingService, StrategyExecutionService, MarketCircuitBreakerService, ExecutionSimulatorService, StrategyCorrelationService],
  exports: [PrismaService, StrategyRunner, PaperTradingService, StrategyExecutionService, MarketCircuitBreakerService, ExecutionSimulatorService, StrategyCorrelationService],
})
export class StrategyModule {}

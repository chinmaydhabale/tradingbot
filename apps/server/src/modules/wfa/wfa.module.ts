import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { StrategyRunner } from '../strategy/strategy-runner';
import { WfaOptimizerService } from './wfa-optimizer';
import { MetaBacktesterService } from './meta-backtester.service';

@Module({
  providers: [PrismaService, StrategyRunner, WfaOptimizerService, MetaBacktesterService],
  exports: [WfaOptimizerService, MetaBacktesterService],
})
export class WfaModule {}

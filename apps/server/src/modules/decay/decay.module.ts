import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { DecayService } from './decay.service';
import { StrategyRetirementService } from './strategy-retirement.service';

@Module({
  providers: [PrismaService, DecayService, StrategyRetirementService],
  exports: [DecayService, StrategyRetirementService],
})
export class DecayModule {}

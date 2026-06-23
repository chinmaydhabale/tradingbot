import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { VarCalculatorService } from './var-calculator';

@Module({
  providers: [PrismaService, VarCalculatorService],
  exports: [VarCalculatorService],
})
export class PortfolioRiskModule {}

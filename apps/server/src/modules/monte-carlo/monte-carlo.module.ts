import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MonteCarloService } from './monte-carlo.service';

@Module({
  providers: [PrismaService, MonteCarloService],
  exports: [MonteCarloService],
})
export class MonteCarloModule {}

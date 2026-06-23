import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { MabAllocatorService } from './mab-allocator.service';
import { ShadowPortfolioService } from './shadow-portfolio.service';

@Module({
  providers: [PrismaService, MabAllocatorService, ShadowPortfolioService],
  exports: [MabAllocatorService, ShadowPortfolioService],
})
export class MabModule {}

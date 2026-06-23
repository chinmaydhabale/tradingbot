import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ExplainabilityService } from './explainability.service';

@Module({
  providers: [PrismaService, ExplainabilityService],
  exports: [ExplainabilityService],
})
export class ExplainabilityModule {}

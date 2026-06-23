import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ConfidenceService } from './confidence.service';

@Module({
  providers: [PrismaService, ConfidenceService],
  exports: [ConfidenceService],
})
export class ConfidenceModule {}

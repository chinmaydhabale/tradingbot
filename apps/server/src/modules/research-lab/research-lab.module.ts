import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ResearchLabService } from './research-lab.service';
import { ResearchLabController } from './research-lab.controller';

@Module({
  controllers: [ResearchLabController],
  providers: [PrismaService, ResearchLabService],
  exports: [ResearchLabService],
})
export class ResearchLabModule {}

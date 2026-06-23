import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { DashboardGateway } from './dashboard.gateway';

@Module({
  providers: [PrismaService, DashboardGateway],
  exports: [DashboardGateway],
})
export class GatewayModule {}

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class DashboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    console.log(`Dashboard client connected: ${client.id}`);
    await this.sendInitialData(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`Dashboard client disconnected: ${client.id}`);
  }

  /**
   * Fetch and send current system records to newly connected clients
   */
  private async sendInitialData(client: Socket) {
    try {
      const strategies = await this.prisma.strategy.findMany();
      const trades = await this.prisma.trade.findMany({
        take: 10,
        orderBy: { entryTime: 'desc' },
      });
      const audits = await this.prisma.auditDecision.findMany({
        take: 10,
        orderBy: { time: 'desc' },
      });

      client.emit('initialState', {
        strategies,
        trades,
        audits,
      });
    } catch (error) {
      console.error('Error sending initial socket packet:', error);
    }
  }

  /**
   * Broadcast real-time status updates globally
   */
  broadcastEvent(event: string, payload: any) {
    if (this.server) {
      this.server.emit(event, payload);
    }
  }
}

import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { ResearchLabService } from './research-lab.service';

@Controller('api/research')
export class ResearchLabController {
  constructor(private researchLab: ResearchLabService) {}

  @Post('register')
  async register(
    @Body() body: { name: string; description: string; config: any },
  ) {
    return this.researchLab.registerSandboxStrategy(body.name, body.description, body.config);
  }

  @Post('backtest/:id')
  async runBacktest(@Param('id') id: string) {
    return this.researchLab.runSandboxBacktest(id);
  }

  @Post('promote/:id')
  async promote(@Param('id') id: string) {
    return this.researchLab.promoteToWfa(id);
  }
}

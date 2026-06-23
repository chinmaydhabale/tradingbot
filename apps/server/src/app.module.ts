import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';
import { MarketDataService } from './modules/market/market-data.service';
import { DataQualityService } from './modules/market/data-quality.service';
import { RegimeTransitionService } from './modules/market/regime-transition.service';
import { StrategyModule } from './modules/strategy/strategy.module';
import { DecayModule } from './modules/decay/decay.module';
import { ConfidenceModule } from './modules/confidence/confidence.module';
import { WfaModule } from './modules/wfa/wfa.module';
import { PortfolioRiskModule } from './modules/portfolio-risk/portfolio-risk.module';
import { MonteCarloModule } from './modules/monte-carlo/monte-carlo.module';
import { MabModule } from './modules/mab/mab.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { ResearchLabModule } from './modules/research-lab/research-lab.module';
import { ExplainabilityModule } from './modules/explainability/explainability.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    StrategyModule,
    DecayModule,
    ConfidenceModule,
    WfaModule,
    PortfolioRiskModule,
    MonteCarloModule,
    MabModule,
    GatewayModule,
    ResearchLabModule,
    ExplainabilityModule,
  ],
  controllers: [],
  providers: [PrismaService, MarketDataService, DataQualityService, RegimeTransitionService],
  exports: [PrismaService],
})
export class AppModule {}

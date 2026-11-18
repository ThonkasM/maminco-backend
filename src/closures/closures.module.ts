import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { RepositoryModule } from '../repository/repository.module';
import { ClosuresController } from './closures.controller';
import { ClosuresService } from './closures.service';

@Module({
  imports: [AuthModule, ReportsModule, RepositoryModule],
  controllers: [ClosuresController],
  providers: [ClosuresService],
  exports: [ClosuresService],
})
export class ClosuresModule {}

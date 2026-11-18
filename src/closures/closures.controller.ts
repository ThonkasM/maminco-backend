import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClosuresService } from './closures.service';
import { RunClosureDto } from './dto/closures.dto';

@ApiTags('closures')
@Controller('api/closures')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClosuresController {
  constructor(private readonly closures: ClosuresService) {}

  @Get('status')
  @Roles('ADMINISTRATOR', 'MANAGER')
  status() {
    return this.closures.status();
  }

  @Get()
  @Roles('ADMINISTRATOR', 'MANAGER')
  list(@Query('limit') limit?: string) {
    return this.closures.list(limit ? Math.min(Number(limit) || 30, 100) : 30);
  }

  @Post('run')
  @HttpCode(200)
  @Roles('ADMINISTRATOR', 'MANAGER')
  run(@Body() dto: RunClosureDto, @CurrentUser() user: AuthUser) {
    return this.closures.run(dto, user);
  }
}

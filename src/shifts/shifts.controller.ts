import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateShiftsDto } from './dto/shifts.dto';
import { ShiftsService } from './shifts.service';

@ApiTags('settings')
@Controller('api/settings/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  get() {
    return this.shifts.getDto();
  }

  @Put()
  @Roles('ADMINISTRATOR')
  update(@Body() dto: UpdateShiftsDto) {
    return this.shifts.replace(dto);
  }
}

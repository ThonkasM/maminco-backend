import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SetAvailabilityDto, UpdateMenuNoteDto } from './dto/menu.dto';
import { MenuService } from './menu.service';

@ApiTags('menu')
@Controller('api')
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get('public/menu')
  @Header('Cache-Control', 'public, max-age=30')
  publicMenu() {
    return this.menu.publicMenu();
  }

  @Get('menu/admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  adminMenu() {
    return this.menu.adminMenu();
  }

  @Put('menu/note')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER')
  updateNote(@Body() dto: UpdateMenuNoteDto) {
    return this.menu.updateNote(dto.note ?? null);
  }

  @Patch('menu/availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMINISTRATOR', 'MANAGER', 'CASHIER')
  setAvailability(@Body() dto: SetAvailabilityDto) {
    return this.menu.setAvailability(dto.productIds, dto.isAvailable);
  }
}

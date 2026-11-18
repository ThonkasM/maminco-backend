import { ParseUUIDPipe } from '@nestjs/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  UpdateTableDto,
  ListTablesQueryDto,
  TableResponseDto,
  ChangeTableStatusDto,
  PaginatedTableResponseDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('api/tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TablesController {
  constructor(private tablesService: TablesService) {}

  @Post()
  @Roles(UserRole.ADMINISTRATOR)
  async create(
    @Body() createTableDto: CreateTableDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.create(createTableDto);
  }

  @Get()
  @Roles(
    UserRole.ADMINISTRATOR,
    UserRole.MANAGER,
    UserRole.CASHIER,
    UserRole.WAITER,
  )
  async findAll(
    @Query() query: ListTablesQueryDto,
  ): Promise<PaginatedTableResponseDto<TableResponseDto>> {
    return this.tablesService.findAll(query);
  }

  @Get(':id')
  @Roles(
    UserRole.ADMINISTRATOR,
    UserRole.MANAGER,
    UserRole.CASHIER,
    UserRole.WAITER,
  )
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TableResponseDto> {
    return this.tablesService.findById(id);
  }

  @Get('area/:areaId')
  @Roles(
    UserRole.ADMINISTRATOR,
    UserRole.MANAGER,
    UserRole.CASHIER,
    UserRole.WAITER,
  )
  async findByAreaId(
    @Param('areaId', ParseUUIDPipe) areaId: string,
  ): Promise<TableResponseDto[]> {
    return this.tablesService.findByAreaId(areaId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateTableDto: UpdateTableDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.update(id, updateTableDto);
  }

  @Patch(':id/status')
  @Roles(
    UserRole.ADMINISTRATOR,
    UserRole.WAITER,
    UserRole.CASHIER,
    UserRole.MANAGER,
  )
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changeStatusDto: ChangeTableStatusDto,
  ): Promise<TableResponseDto> {
    return this.tablesService.changeStatus(id, changeStatusDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMINISTRATOR)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TableResponseDto> {
    return this.tablesService.deactivate(id);
  }

  @Get('stats/overview')
  @Roles(UserRole.ADMINISTRATOR)
  async getStats(): Promise<any> {
    return this.tablesService.getStats();
  }
}

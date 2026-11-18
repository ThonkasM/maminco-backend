import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateShiftsDto } from './dto/shifts.dto';
import {
  formatMinutes,
  parseTime,
  validateShifts,
  type ShiftWindow,
} from './domain/shifts';

export interface ShiftRecord extends ShiftWindow {
  id: string;
  sortOrder: number;
}

export interface ShiftsConfig {
  businessDayStartMinute: number;
  shifts: ShiftRecord[];
}

const CACHE_MS = 30_000;

@Injectable()
export class ShiftsService {
  private cache: { at: number; value: ShiftsConfig } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  invalidate() {
    this.cache = null;
  }

  async getConfig(): Promise<ShiftsConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.value;
    }
    const [setting, shifts] = await Promise.all([
      this.prisma.businessSetting.findUnique({ where: { id: 'default' } }),
      this.prisma.shift.findMany({
        orderBy: [{ sortOrder: 'asc' }, { startMinute: 'asc' }],
      }),
    ]);
    const value: ShiftsConfig = {
      businessDayStartMinute: setting?.businessDayStartMinute ?? 0,
      shifts: shifts.map((shift) => ({
        id: shift.id,
        name: shift.name,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute,
        sortOrder: shift.sortOrder,
      })),
    };
    this.cache = { at: Date.now(), value };
    return value;
  }

  async getDto() {
    const config = await this.getConfig();
    return {
      timeZone: this.config?.get<string>('REPORT_TIMEZONE') ?? 'America/La_Paz',
      businessDayStart: formatMinutes(config.businessDayStartMinute),
      shifts: config.shifts.map((shift) => ({
        id: shift.id,
        name: shift.name,
        start: formatMinutes(shift.startMinute),
        end: formatMinutes(shift.endMinute),
      })),
    };
  }

  async replace(dto: UpdateShiftsDto) {
    const dayStart = parseTime(dto.businessDayStart);
    if (dayStart === null) {
      throw new BadRequestException('Hora de inicio del día inválida.');
    }
    const windows = dto.shifts.map((shift) => ({
      name: shift.name.trim(),
      startMinute: parseTime(shift.start) ?? -1,
      endMinute: parseTime(shift.end) ?? -1,
    }));
    if (windows.some((w) => w.startMinute < 0 || w.endMinute < 0)) {
      throw new BadRequestException('Horas de turno inválidas.');
    }
    const errors = validateShifts(windows);
    if (errors.length > 0) throw new BadRequestException(errors.join(' '));

    await this.prisma.$transaction([
      this.prisma.businessSetting.upsert({
        where: { id: 'default' },
        create: { id: 'default', businessDayStartMinute: dayStart },
        update: { businessDayStartMinute: dayStart },
      }),
      this.prisma.shift.deleteMany({}),
      this.prisma.shift.createMany({
        data: windows.map((window, index) => ({
          name: window.name,
          startMinute: window.startMinute,
          endMinute: window.endMinute,
          sortOrder: index,
        })),
      }),
    ]);
    this.invalidate();
    return this.getDto();
  }
}

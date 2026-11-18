import { Area } from '@prisma/client';

type AreaSource = Pick<
  Area,
  'id' | 'name' | 'description' | 'isActive' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<Area, 'isVirtual'>>;

export class AreaResponseDto {
  id: string;
  name: string;
  description?: string;
  isVirtual: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  tablesCount?: number; // Cantidad de mesas en el área

  constructor(area: AreaSource, tablesCount?: number) {
    this.id = area.id;
    this.name = area.name;
    this.description = area.description ?? undefined;
    this.isVirtual = area.isVirtual ?? false;
    this.isActive = area.isActive;
    this.createdAt = area.createdAt;
    this.updatedAt = area.updatedAt;
    if (tablesCount !== undefined) {
      this.tablesCount = tablesCount;
    }
  }
}

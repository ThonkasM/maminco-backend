import { Injectable } from '@nestjs/common';
import { describeAvailability } from '../notifications/domain/notification-rules';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export interface MenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  image: { thumb: string; large: string } | null;
}

export interface MenuSection {
  id: string;
  name: string;
  description: string | null;
  products: MenuProduct[];
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
  ) {}

  private async sections(onlyAvailable: boolean): Promise<MenuSection[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: {
            isActive: true,
            deletedAt: null,
            ...(onlyAvailable ? { isAvailable: true } : {}),
          },
          orderBy: [{ price: 'desc' }, { name: 'asc' }],
        },
      },
    });
    return categories
      .filter((category) => category.products.length > 0)
      .map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        products: category.products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: Number(product.price),
          isAvailable: product.isAvailable,
          image: this.media.urlsFor(product.imageKey),
        })),
      }));
  }

  /** What the public sees: only categories with available products. */
  async publicMenu() {
    const sections = await this.sections(true);
    return {
      restaurant: 'Maminco',
      generatedAt: new Date().toISOString(),
      note: await this.readNote(),
      sections,
    };
  }

  /** What staff manage: every active product with its availability. */
  async adminMenu() {
    const sections = await this.sections(false);
    const all = sections.flatMap((section) => section.products);
    return {
      sections,
      note: await this.readNote(),
      totals: {
        products: all.length,
        available: all.filter((product) => product.isAvailable).length,
      },
    };
  }

  private async readNote(): Promise<string | null> {
    const setting = await this.prisma.menuSetting.findUnique({
      where: { id: 'default' },
    });
    return setting?.note?.trim() || null;
  }

  async updateNote(note: string | null) {
    const value = note?.trim() || null;
    await this.prisma.menuSetting.upsert({
      where: { id: 'default' },
      create: { id: 'default', note: value },
      update: { note: value },
    });
    return { note: value };
  }

  async setAvailability(productIds: string[], isAvailable: boolean) {
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        deletedAt: null,
        isActive: true,
        isAvailable: !isAvailable,
      },
      select: { id: true, name: true },
    });
    if (products.length > 0) {
      await this.prisma.product.updateMany({
        where: { id: { in: products.map((product) => product.id) } },
        data: { isAvailable },
      });
      void this.notifications.publishAutomatic(
        'MENU_UPDATE',
        describeAvailability(
          products.map((product) => product.name),
          isAvailable,
        ),
      );
    }
    return { updated: products.length };
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  ListNotificationsQueryDto,
  SendNotificationDto,
  SubscribePushDto,
  UnsubscribePushDto,
  UpdateRuleDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('api/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  mine(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.listForUser(
      user.id,
      query.limit,
      query.unreadOnly,
    );
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Get('push/config')
  pushConfig() {
    return this.notifications.pushConfig();
  }

  @Post('push/subscriptions')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribePushDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.subscribe(user.id, dto, userAgent);
  }

  @Delete('push/subscriptions')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribePushDto) {
    return this.notifications.unsubscribe(user.id, dto.endpoint);
  }

  @Post()
  @Roles('ADMINISTRATOR', 'MANAGER')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendNotificationDto) {
    return this.notifications.publish({
      type: 'ANNOUNCEMENT',
      title: dto.title,
      body: dto.body,
      roles: dto.roles,
      userIds: dto.userIds,
      createdById: user.id,
    });
  }

  @Get('history')
  @Roles('ADMINISTRATOR', 'MANAGER')
  history() {
    return this.notifications.history();
  }

  @Get('rules')
  @Roles('ADMINISTRATOR', 'MANAGER')
  rules() {
    return this.notifications.getRules();
  }

  @Put('rules/:type')
  @Roles('ADMINISTRATOR')
  updateRule(@Param('type') type: string, @Body() dto: UpdateRuleDto) {
    return this.notifications.updateRule(type, dto.enabled, dto.audienceRoles);
  }
}

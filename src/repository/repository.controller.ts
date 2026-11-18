import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { resolveCorsOrigins } from '../common/adapters/socket-io.adapter';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateFolderDto,
  FileUrlQueryDto,
  ListNodesQueryDto,
  SearchQueryDto,
  UpdateNodeDto,
  UploadFilesDto,
} from './dto/repository.dto';
import {
  MAX_FILES_PER_UPLOAD,
  MAX_FILE_BYTES,
  isInlineType,
} from './domain/repository-rules';
import { RepositoryService, type UploadedFile } from './repository.service';

@ApiExcludeController()
@Controller('api/repository')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMINISTRATOR', 'MANAGER')
export class RepositoryController {
  constructor(private readonly repository: RepositoryService) {}

  @Get('nodes')
  list(@Query() query: ListNodesQueryDto) {
    return this.repository.list(query.parentId);
  }

  @Post('folders')
  createFolder(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    return this.repository.createFolder(dto.parentId, dto.name, user.id);
  }

  @Post('files')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_UPLOAD },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadFilesDto,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    return this.repository.upload(dto.parentId, files, user.id);
  }

  @Patch('nodes/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNodeDto) {
    return this.repository.update(id, dto);
  }

  @Delete('nodes/:id/permanent')
  removePermanently(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.removePermanently(id);
  }

  @Delete('nodes/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.remove(id);
  }

  @Post('nodes/:id/restore')
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.restore(id);
  }

  @Get('trash')
  trash() {
    return this.repository.trash();
  }

  @Get('search')
  search(@Query() query: SearchQueryDto) {
    return this.repository.search(query.q);
  }

  @Get('usage')
  usage() {
    return this.repository.usage();
  }

  @Get('files/:id/url')
  fileUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FileUrlQueryDto,
  ) {
    return this.repository.fileUrl(id, query.download === '1');
  }
}

/**
 * Local-storage streaming. No guards: the short-lived signed token in the URL is the
 * credential, so it works inside <a> and <iframe> without an Authorization header.
 */
@ApiExcludeController()
@Controller('api/repository/files')
export class RepositoryContentController {
  constructor(private readonly repository: RepositoryService) {}

  @Get(':id/content')
  async content(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token: string | undefined,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const { node, stored } = await this.repository.openContent(id, token ?? '');
    const mime = node.mimeType ?? 'application/octet-stream';
    const inline = download !== '1' && isInlineType(mime);
    const encoded = encodeURIComponent(node.name).replace(/'/g, '%27');
    res.setHeader('Content-Type', mime);
    if (stored.size !== undefined) res.setHeader('Content-Length', stored.size);
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Allow the admin panel (another origin in development) to preview PDFs in an <iframe>.
    res.removeHeader('X-Frame-Options');
    const origins = resolveCorsOrigins().join(' ');
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors 'self' ${origins}`,
    );
    stored.stream.on('error', () => res.destroy());
    stored.stream.pipe(res);
  }
}

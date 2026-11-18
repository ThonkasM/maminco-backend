import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { McpServerFactory } from './infrastructure/mcp/mcp-server.factory';

@ApiExcludeController()
@Controller('api/mcp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class McpController {
  constructor(private readonly servers: McpServerFactory) {}

  @Post()
  @HttpCode(200)
  @Roles('MANAGER', 'ADMINISTRATOR')
  async handle(@Req() req: Request & { user: AuthUser }, @Res() res: Response) {
    const server = this.servers.create({ scope: 'analytics', actor: req.user });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Get()
  @Roles('MANAGER', 'ADMINISTRATOR')
  notAllowed(@Res() res: Response) {
    res
      .status(405)
      .set('Allow', 'POST')
      .json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      });
  }
}

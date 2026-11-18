import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Injectable } from '@nestjs/common';
import type { LlmToolDef } from '../../application/ports/llm.port';
import type {
  PendingAction,
  ToolClient,
  ToolClientFactory,
  ToolClientOptions,
  ToolResult,
} from '../../application/ports/tool-client.port';
import { McpServerFactory } from './mcp-server.factory';

@Injectable()
export class InMemoryToolClientFactory implements ToolClientFactory {
  constructor(private readonly servers: McpServerFactory) {}

  async create(options: ToolClientOptions): Promise<ToolClient> {
    const pending: PendingAction[] = [];
    const server = this.servers.create({ ...options, pending });
    const client = new Client({
      name: 'maminco-insights-agent',
      version: '1.0.0',
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    let cached: LlmToolDef[] | null = null;

    return {
      async listTools() {
        if (!cached) {
          const { tools } = await client.listTools();
          cached = tools.map((tool) => ({
            name: tool.name,
            description: tool.description ?? tool.title ?? tool.name,
            inputSchema: tool.inputSchema,
          }));
        }
        return cached;
      },
      async callTool(name, args): Promise<ToolResult> {
        const result = await client.callTool({ name, arguments: args });
        const blocks = (result.content ?? []) as {
          type: string;
          text?: string;
        }[];
        return {
          text: blocks
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('\n'),
          structured: result.structuredContent,
          isError: Boolean(result.isError),
        };
      },
      pendingActions: () => pending,
      async close() {
        await client.close();
        await server.close();
      },
    };
  }
}

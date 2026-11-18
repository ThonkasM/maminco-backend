import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function jsonResult(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const response = (error as { response?: { message?: string | string[] } })
      .response;
    const detail = response?.message;
    if (Array.isArray(detail)) return detail.join('; ');
    if (typeof detail === 'string') return detail;
    return error.message;
  }
  return 'Error desconocido';
}

export function rangeLabel(from?: string, to?: string): string {
  if (!from) return 'hoy';
  return !to || from === to ? from : `${from} a ${to}`;
}

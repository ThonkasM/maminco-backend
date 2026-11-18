import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LlmPort } from '../../application/ports/llm.port';
import { isModelAllowed } from './model-policy';
import { OpenAiCompatibleAdapter } from './openai-compatible.adapter';
import { LlmRegistry } from './llm-registry';
import { StubLlmAdapter } from './stub.adapter';

type ProviderFactory = (config: ConfigService) => LlmPort | null;

const logger = new Logger('LlmProviders');

const opencode: ProviderFactory = (config) => {
  const model = config.get<string>('OPENCODE_MODEL') ?? 'deepseek-v4.1-flash';
  if (!isModelAllowed(model, config.get<string>('OPENCODE_ALLOWED_MODELS'))) {
    logger.warn(`Modelo ${model} no permitido; se omite OpenCode.`);
    return null;
  }
  return new OpenAiCompatibleAdapter({
    id: 'opencode',
    label: `OpenCode · ${model}`,
    baseUrl:
      config.get<string>('OPENCODE_BASE_URL') ??
      'https://opencode.ai/inference/go',
    chatPath:
      config.get<string>('OPENCODE_CHAT_PATH') ?? '/openai/v1/chat/completions',
    apiKey: config.get<string>('OPENCODE_API_KEY'),
    model,
    timeoutMs: Number(config.get<string>('OPENCODE_TIMEOUT_MS') ?? 60000),
    external: true,
    userAgent: 'maminco-insights/1.0',
    headers: { 'x-opencode-session': randomUUID() },
  });
};

const custom: ProviderFactory = (config) => {
  const baseUrl = config.get<string>('CUSTOM_LLM_BASE_URL');
  const model = config.get<string>('CUSTOM_LLM_MODEL');
  if (!baseUrl || !model) return null;
  return new OpenAiCompatibleAdapter({
    id: 'custom',
    label: config.get<string>('CUSTOM_LLM_LABEL') ?? `Personalizado · ${model}`,
    baseUrl,
    chatPath:
      config.get<string>('CUSTOM_LLM_CHAT_PATH') ?? '/v1/chat/completions',
    apiKey: config.get<string>('CUSTOM_LLM_API_KEY'),
    model,
    timeoutMs: Number(config.get<string>('CUSTOM_LLM_TIMEOUT_MS') ?? 60000),
    external: true,
    userAgent: 'maminco-insights/1.0',
  });
};

export const PROVIDER_CATALOG: Record<string, ProviderFactory> = {
  opencode,
  custom,
};

export function buildLlmRegistry(config: ConfigService): LlmRegistry {
  const order = (config.get<string>('LLM_PROVIDERS') ?? 'opencode')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const engines: LlmPort[] = [];
  for (const id of order) {
    const factory = PROVIDER_CATALOG[id];
    if (!factory) {
      logger.warn(`Proveedor LLM desconocido: ${id}`);
      continue;
    }
    const engine = factory(config);
    if (engine) engines.push(engine);
  }
  return new LlmRegistry(engines, new StubLlmAdapter());
}

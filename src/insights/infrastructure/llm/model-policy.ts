const DEFAULT_ALLOWED = ['deepseek-*', 'glm-*', 'kimi-*', 'qwen*', 'minimax-*'];

function toRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function isModelAllowed(model: string, allowList?: string): boolean {
  if (/contributor/i.test(model)) return false;
  const patterns = (allowList ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const rules = patterns.length > 0 ? patterns : DEFAULT_ALLOWED;
  return rules.some((rule) => toRegex(rule).test(model));
}

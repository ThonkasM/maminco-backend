import * as fs from 'fs';
import * as path from 'path';

const SRC = __dirname;
const CLEAN_MODULES = ['orders', 'payments', 'printing', 'insights'];

function sourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const isSource = entry.name.endsWith('.ts');
    const isTest = entry.name.endsWith('.spec.ts') || entry.name === 'fakes.ts';
    return isSource && !isTest ? [full] : [];
  });
}

function importsOf(file: string): string[] {
  const content = fs.readFileSync(file, 'utf8');
  return [...content.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
}

function violations(layer: string, forbidden: RegExp[]): string[] {
  const found: string[] = [];
  for (const module of CLEAN_MODULES) {
    for (const file of sourceFiles(path.join(SRC, module, layer))) {
      for (const specifier of importsOf(file)) {
        if (forbidden.some((rule) => rule.test(specifier))) {
          found.push(`${path.relative(SRC, file)} -> ${specifier}`);
        }
      }
    }
  }
  return found;
}

describe('clean architecture dependency rule', () => {
  it('domain depends on neither the framework nor outer layers', () => {
    expect(
      violations('domain', [
        /^@nestjs\//,
        /infrastructure/,
        /\/application\//,
        /prisma\.service/,
        /\.gateway/,
        /\.controller/,
        /\/dto(\/|$)/,
      ]),
    ).toEqual([]);
  });

  it('application depends on ports, never on infrastructure or transport', () => {
    expect(
      violations('application', [
        /infrastructure/,
        /prisma\.service/,
        /\.gateway/,
        /\.controller/,
      ]),
    ).toEqual([]);
  });
});

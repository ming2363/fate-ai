import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
// Node 24.7+ strips local TypeScript; resolve the same aliases used by Next/tsc.
registerHooks({ load(url, context, next) {
  return next(url, url.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context);
}, resolve(specifier, context, next) {
  const candidate = specifier.startsWith('@/') ? pathToFileURL(resolve(specifier.slice(2))).href : specifier.startsWith('.') && context.parentURL ? new URL(specifier, context.parentURL).href : null;
  if (candidate?.startsWith('file:') && !candidate.includes('/node_modules/')) {
    if (existsSync(fileURLToPath(candidate))) return next(candidate, candidate.endsWith('.json') ? { ...context, importAttributes: { type: 'json' } } : context);
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(fileURLToPath(candidate + suffix))) return next(candidate + suffix, context);
  }
  return next(specifier, context);
}});
const { runWorker } = await import('../lib/server/report-worker.ts');
await runWorker();

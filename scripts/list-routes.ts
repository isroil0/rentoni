/**
 * Enumerates every route the API registers, by walking each router's own layer stack
 * with the prefix it is mounted at in src/routes/index.ts.
 *
 * Express 5 does not retain a router's mount path on its layers, so the prefixes are
 * declared here and kept in step with the mounting in src/routes/index.ts.
 */
import type { Router } from 'express';
import authRoutes from '../src/routes/auth.routes';
import publicRoutes from '../src/routes/public.routes';
import customerRoutes from '../src/routes/customer.routes';
import adminRoutes from '../src/routes/admin.routes';

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

const MOUNTS: [string, Router][] = [
  ['/auth', authRoutes],
  ['', publicRoutes],
  ['/customer', customerRoutes],
  ['/admin', adminRoutes],
];

export interface RouteRef {
  method: string;
  path: string;
}

function walk(stack: Layer[], prefix: string, out: RouteRef[]) {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        for (const [method, enabled] of Object.entries(layer.route.methods)) {
          if (enabled && method !== '_all') {
            out.push({ method: method.toUpperCase(), path: `${prefix}${p}`.replace(/\/$/, '') || '/' });
          }
        }
      }
    } else if (layer.handle?.stack) {
      walk(layer.handle.stack, prefix, out);
    }
  }
}

export function listRoutes(): RouteRef[] {
  const out: RouteRef[] = [{ method: 'GET', path: '/health' }];
  for (const [prefix, router] of MOUNTS) {
    walk((router as unknown as { stack: Layer[] }).stack, prefix, out);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}

if (require.main === module) {
  const routes = listRoutes();
  for (const r of routes) console.log(`${r.method.padEnd(6)} ${r.path}`);
  console.log(`\n${routes.length} routes`);
}

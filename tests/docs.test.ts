import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { listRoutes } from '../scripts/list-routes';

const spec = YAML.parse(
  fs.readFileSync(path.resolve(__dirname, '../docs/openapi.yaml'), 'utf8'),
) as {
  paths: Record<string, Record<string, { summary?: string; tags?: string[] }>>;
  components: { schemas: Record<string, unknown> };
  info: { title: string; version: string; description?: string };
};

/** `/admin/products/:id` -> `/admin/products/{id}` */
const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function documentedOperations(): Set<string> {
  const out = new Set<string>();
  for (const [p, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) out.add(`${method.toUpperCase()} ${p}`);
    }
  }
  return out;
}

describe('API documentation', () => {
  it('is a valid OpenAPI document', () => {
    expect(spec.info.title).toContain('Rentoni');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(50);
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(10);
  });

  it('documents every route the application registers', () => {
    const documented = documentedOperations();
    const missing = listRoutes()
      .map((r) => `${r.method} ${toOpenApiPath(r.path)}`)
      .filter((key) => !documented.has(key));

    expect(missing, `undocumented routes:\n${missing.join('\n')}`).toEqual([]);
  });

  it('does not document routes that do not exist', () => {
    const real = new Set(listRoutes().map((r) => `${r.method} ${toOpenApiPath(r.path)}`));
    const phantom = [...documentedOperations()].filter((key) => !real.has(key));

    expect(phantom, `documented but not implemented:\n${phantom.join('\n')}`).toEqual([]);
  });

  it('gives every operation a summary and a tag', () => {
    const untagged: string[] = [];
    for (const [p, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        if (!HTTP_METHODS.includes(method)) continue;
        if (!op.summary || !op.tags?.length) untagged.push(`${method.toUpperCase()} ${p}`);
      }
    }
    expect(untagged).toEqual([]);
  });

  it('describes the error envelope and the documented error codes', () => {
    const raw = JSON.stringify(spec);
    for (const code of [
      'INSUFFICIENT_STOCK',
      'DUPLICATE_SKU',
      'INVALID_STATUS_TRANSITION',
      'VALIDATION_ERROR',
      'ORDER_NOT_CANCELLABLE',
      'INVALID_RETURN_QUANTITY',
      'SETUP_ALREADY_COMPLETE',
    ]) {
      expect(raw, `error code ${code} should be documented`).toContain(code);
    }
  });

  it('documents the roles, inventory behaviour and status transitions', () => {
    const description = spec.info.description ?? '';
    expect(description).toContain('SUPER_ADMIN');
    expect(description).toContain('CUSTOMER');
    expect(description).toContain('ADJUSTMENT_IN');
    expect(description).toContain('PENDING');
    expect(description).toContain('OUT_OF_STOCK');
  });
});

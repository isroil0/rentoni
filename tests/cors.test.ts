import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { isOriginAllowed } from '../src/app';
import { API, app } from './helpers';

const ALLOWLIST = ['http://localhost:5173', 'http://127.0.0.1:5173'];

describe('CORS origin policy', () => {
  describe('outside production', () => {
    it('accepts the configured allowlist', () => {
      for (const origin of ALLOWLIST) {
        expect(isOriginAllowed(origin, ALLOWLIST, false)).toBe(true);
      }
    });

    it('accepts loopback and private LAN origins so a device on the network can connect', () => {
      const allowed = [
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://[::1]:5173',
        'http://192.168.0.111:5173',
        'http://10.0.0.5:5173',
        'http://172.16.4.2:5173',
        'http://172.31.255.254:5173',
        'https://192.168.1.50',
      ];
      for (const origin of allowed) {
        expect(isOriginAllowed(origin, ALLOWLIST, false), origin).toBe(true);
      }
    });

    it('still rejects public origins', () => {
      const rejected = [
        'http://evil.example',
        'https://rentoni.example.com',
        'http://8.8.8.8:5173',
        // 172.32 is outside the private 172.16–172.31 range.
        'http://172.32.0.1:5173',
        'http://192.169.0.1:5173',
        // Lookalikes that must not pass.
        'http://localhost.evil.example',
        'http://192.168.0.111.evil.example',
      ];
      for (const origin of rejected) {
        expect(isOriginAllowed(origin, ALLOWLIST, false), origin).toBe(false);
      }
    });
  });

  describe('in production', () => {
    it('honours only the explicit allowlist — private ranges get no free pass', () => {
      expect(isOriginAllowed('http://localhost:5173', ALLOWLIST, true)).toBe(true);
      for (const origin of ['http://192.168.0.111:5173', 'http://10.0.0.5:5173', 'http://127.0.0.1:9999']) {
        expect(isOriginAllowed(origin, ALLOWLIST, true), origin).toBe(false);
      }
    });

    it('supports a wildcard allowlist when explicitly configured', () => {
      expect(isOriginAllowed('https://anything.example', ['*'], true)).toBe(true);
    });
  });

  describe('over HTTP', () => {
    it('serves a LAN origin and rejects a public one with 403, never 500', async () => {
      const lan = await request(app())
        .get(`${API}/health`)
        .set('Origin', 'http://192.168.0.111:5173');
      expect(lan.status).toBe(200);
      expect(lan.headers['access-control-allow-origin']).toBe('http://192.168.0.111:5173');

      const publicOrigin = await request(app()).get(`${API}/health`).set('Origin', 'http://evil.example');
      expect(publicOrigin.status).toBe(403);
      expect(publicOrigin.body.error.code).toBe('FORBIDDEN');
    });

    it('still serves clients that send no Origin header at all', async () => {
      await request(app()).get(`${API}/health`).expect(200);
    });
  });
});

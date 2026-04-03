import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the Google GenAI module
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: class MockGenAI {
      models = {
        generateContent: async () => ({ text: 'You call that playing?' }),
      };
    },
  };
});

describe('POST /api/commentary', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    vi.resetModules();
    const mod = await import('./route');
    POST = mod.POST;
  });

  it('rejects invalid input', async () => {
    const req = new NextRequest('http://localhost/api/commentary', {
      method: 'POST',
      body: JSON.stringify({ score: 'not a number', event: 123 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid input');
  });

  it('accepts valid input and returns commentary', async () => {
    const req = new NextRequest('http://localhost/api/commentary', {
      method: 'POST',
      body: JSON.stringify({ score: 100, event: 'player died' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.commentary).toBeTruthy();
  });

  it('returns 429 when rate limited', async () => {
    const makeReq = () =>
      new NextRequest('http://localhost/api/commentary', {
        method: 'POST',
        body: JSON.stringify({ score: 50, event: 'milestone' }),
        headers: { 'x-forwarded-for': '5.6.7.8' },
      });

    // Send 11 requests from same IP — 11th should be rate limited
    for (let i = 0; i < 10; i++) {
      await POST(makeReq());
    }

    const res = await POST(makeReq());
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.commentary).toContain('Slow down');
  });
});

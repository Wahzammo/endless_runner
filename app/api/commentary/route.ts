import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Simple in-memory rate limiter: max 10 requests per minute per IP
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(ip, recent);
  return false;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { commentary: 'Slow down, you\'re not that interesting.' },
      { status: 429 }
    );
  }

  if (!ai) {
    return NextResponse.json(
      { commentary: 'My brain is offline. Lucky you.' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { score, event } = body;

    if (typeof score !== 'number' || typeof event !== 'string') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const prompt = `You are a sarcastic, smack-talking AI game commentator for an endless runner game.
    The player just experienced this event: "${event}".
    Their current score is ${score}.

    Deliver a short, punchy, one-sentence comment designed to distract, unsettle, or mock the player.
    Be witty, mean-spirited in a funny way, and highly critical of their performance.
    Keep it under 15 words. No emojis.`;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return NextResponse.json({ commentary: result.text || 'Pathetic.' });
  } catch (error) {
    console.error('Gemini error:', error);
    return NextResponse.json({ commentary: 'My circuits are failing just watching you play.' });
  }
}

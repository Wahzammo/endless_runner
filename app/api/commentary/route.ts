import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(request: NextRequest) {
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
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return NextResponse.json({ commentary: result.text || 'Pathetic.' });
  } catch (error) {
    console.error('Gemini error:', error);
    return NextResponse.json({ commentary: 'My circuits are failing just watching you play.' });
  }
}

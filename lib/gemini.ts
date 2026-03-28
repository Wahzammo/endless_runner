export async function generateCommentary(event: string, score: number): Promise<string> {
  try {
    const res = await fetch('/api/commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, event }),
    });
    if (!res.ok) return "I'd roast you, but this connection won't let me.";
    const data = await res.json();
    return data.commentary || 'Pathetic.';
  } catch {
    return "My circuits are failing just watching you play.";
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { CONSUMABLE_ITEMS_ABI, CONSUMABLE_ITEMS_ADDRESS } from '@/lib/contract';

const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

// Simple in-memory rate limiter: max 5 mints per minute per player address
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) ?? [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) return true;
  recent.push(now);
  rateLimitMap.set(key, recent);
  return false;
}

export async function POST(request: NextRequest) {
  if (!deployerKey || !CONSUMABLE_ITEMS_ADDRESS) {
    return NextResponse.json(
      { error: 'Server not configured for minting' },
      { status: 503 },
    );
  }

  let body: { playerAddress: string; tokenId: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { playerAddress, tokenId } = body;

  // Validate inputs
  if (
    typeof playerAddress !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(playerAddress)
  ) {
    return NextResponse.json({ error: 'Invalid player address' }, { status: 400 });
  }

  if (typeof tokenId !== 'number' || tokenId < 0 || tokenId > 3) {
    return NextResponse.json(
      { error: 'Invalid tokenId — must be 0 (health), 1 (invincible), 2 (timeslow), or 3 (fireball)' },
      { status: 400 },
    );
  }

  if (isRateLimited(playerAddress.toLowerCase())) {
    return NextResponse.json(
      { error: 'Too many mints — try again in a minute' },
      { status: 429 },
    );
  }

  try {
    const privateKey = deployerKey.startsWith('0x')
      ? (deployerKey as `0x${string}`)
      : (`0x${deployerKey}` as `0x${string}`);

    const account = privateKeyToAccount(privateKey);

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(),
    });

    const hash = await walletClient.writeContract({
      address: CONSUMABLE_ITEMS_ADDRESS,
      abi: CONSUMABLE_ITEMS_ABI,
      functionName: 'mint',
      args: [playerAddress as `0x${string}`, BigInt(tokenId), BigInt(1)],
    });

    // Wait for confirmation — the client needs to know the mint landed
    // before adding the item to the player's local inventory.
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return NextResponse.json({
      success: true,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
    });
  } catch (error: unknown) {
    console.error('Mint error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

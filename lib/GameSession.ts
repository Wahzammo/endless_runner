// ============================================================
// GameSession.ts — Sub Account + CDP Paymaster integration
//
// Uses Base Account SDK's Sub Accounts for silent burn-on-use:
//   1. Game start → SDK creates/retrieves a Sub Account (one popup
//      on first ever connect, zero popups after)
//   2. Server mints power-ups to the Sub Account address
//   3. Keys 1-4 → wallet_sendCalls from Sub Account → useAndBurn()
//      Gas sponsored by CDP Paymaster → no popup, no ETH needed
//
// The Sub Account persists across sessions (scoped to this app's
// domain). Its address is stable — power-ups survive between runs.
// ============================================================

import { encodeFunctionData, createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { baseSDK } from '@/components/Providers';
import {
  CONSUMABLE_ITEMS_ABI,
  CONSUMABLE_ITEMS_ADDRESS,
  TOKEN_ID_TO_POWERUP,
} from './contract';
import type { PowerUpId } from './PowerUpSystem';

// ─── State ──────────────────────────────────────────────────

let subAccountAddress: Address | null = null;
let universalAddress: Address | null = null;

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// ─── Session lifecycle ──────────────────────────────────────

/**
 * Start a game session — creates or retrieves the Sub Account.
 * First-ever call triggers ONE wallet popup (Base Account connect +
 * Sub Account creation). Subsequent calls in the same browser are
 * silent because the Sub Account already exists.
 */
export async function startSession(): Promise<{
  subAccount: Address;
  universal: Address;
}> {
  const provider = baseSDK.getProvider();

  // eth_requestAccounts triggers the connect popup on first use.
  // With defaultAccount: 'sub', accounts[0] = sub, accounts[1] = universal.
  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
    params: [],
  })) as Address[];

  subAccountAddress = accounts[0];
  universalAddress = accounts[1] ?? accounts[0];

  if (!subAccountAddress) {
    throw new Error('Failed to create or retrieve Sub Account');
  }

  return { subAccount: subAccountAddress, universal: universalAddress };
}

/**
 * Try to get the existing Sub Account without triggering a popup.
 * Returns null if no Sub Account exists for this app yet.
 */
export async function getExistingSubAccount(): Promise<Address | null> {
  try {
    const sub = await baseSDK.subAccount.get();
    if (sub?.address) {
      subAccountAddress = sub.address as Address;
      return subAccountAddress;
    }
  } catch {
    // No sub account exists yet
  }
  return null;
}

/** Get the current Sub Account address (null if session not started). */
export function getSubAccountAddress(): Address | null {
  return subAccountAddress;
}

/** Get the current Universal Account address. */
export function getUniversalAddress(): Address | null {
  return universalAddress;
}

/** Clear in-memory session state. Sub Account persists on-chain. */
export function endSession() {
  subAccountAddress = null;
  universalAddress = null;
}

// ─── Burn on use ────────────────────────────────────────────

/**
 * Burn a power-up NFT from the Sub Account — silent, no popup.
 * Gas is sponsored by the CDP Paymaster.
 *
 * Called mid-game when the player presses keys 1-4. The game effect
 * is already applied optimistically by PowerUpSystem.useFromInventory.
 *
 * @returns The wallet_sendCalls ID (for receipt polling if needed)
 */
export async function burnPowerUp(tokenId: number): Promise<string | null> {
  if (!subAccountAddress || !CONSUMABLE_ITEMS_ADDRESS) return null;

  try {
    const provider = baseSDK.getProvider();

    const callsId = (await provider.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0',
        chainId: `0x${baseSepolia.id.toString(16)}`,
        from: subAccountAddress,
        calls: [{
          to: CONSUMABLE_ITEMS_ADDRESS,
          data: encodeFunctionData({
            abi: CONSUMABLE_ITEMS_ABI,
            functionName: 'useAndBurn',
            args: [BigInt(tokenId)],
          }),
          value: '0x0',
        }],
        capabilities: {
          paymasterService: {
            url: process.env.NEXT_PUBLIC_PAYMASTER_URL,
          },
        },
      }],
    })) as string;

    return callsId;
  } catch (err) {
    console.error('Silent burn failed:', err);
    return null;
  }
}

// ─── Inventory reads ────────────────────────────────────────

/**
 * Get inventory counts for the Sub Account (or any address).
 * Uses balanceOfBatch for a single RPC call.
 */
export async function getInventoryCounts(
  playerAddress: Address,
): Promise<Map<PowerUpId, number>> {
  if (!CONSUMABLE_ITEMS_ADDRESS) return new Map();

  try {
    const tokenIds = [BigInt(0), BigInt(1), BigInt(2), BigInt(3)];
    const accounts = tokenIds.map(() => playerAddress);

    const result = await publicClient.readContract({
      address: CONSUMABLE_ITEMS_ADDRESS,
      abi: CONSUMABLE_ITEMS_ABI,
      functionName: 'balanceOfBatch',
      args: [accounts, tokenIds],
    });

    const counts = new Map<PowerUpId, number>();
    const balances = result as bigint[];
    for (let i = 0; i < balances.length; i++) {
      const id = TOKEN_ID_TO_POWERUP[i as keyof typeof TOKEN_ID_TO_POWERUP];
      if (id) counts.set(id, Number(balances[i]));
    }
    return counts;
  } catch {
    return new Map();
  }
}

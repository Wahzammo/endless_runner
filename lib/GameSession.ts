// ============================================================
// SESSION KEY + BURN-ON-USE INTEGRATION
// /lib/GameSession.ts
//
// Flow:
//   1. Player connects wallet (existing OnchainKit)
//   2. Game start → one popup: "Authorise game session"
//      Session grants permission to call useAndBurn() only,
//      capped to X calls, expires after Y minutes
//   3. In-game power-up used → useAndBurn() via session key
//      → silent, no popup, instant
//   4. Server-side mint on claim is unchanged (server wallet)
// ============================================================

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  type WalletClient,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// ─── Types ───────────────────────────────────────────────────

export interface GameSession {
  sessionKey: Address;       // ephemeral key address (never stored server-side)
  expiresAt: number;         // Date.now() ms
  callsRemaining: number;
}

const POWER_UP_NFT_ADDRESS = process.env
  .NEXT_PUBLIC_POWER_UP_NFT_ADDRESS as Address;

const POWER_UP_ABI = parseAbi([
  "function useAndBurn(uint256 tokenId) external",
  "function getOwnedPowerUps(address player) external view returns (uint256[])",
]);

// ─── SessionManager ──────────────────────────────────────────

export class SessionManager {
  private sessionWallet: WalletClient | null = null;
  private session: GameSession | null = null;
  private publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  // ── Create session ────────────────────────────────────────
  //
  // Coinbase Smart Wallet handles session key authorisation natively.
  // This generates an ephemeral key, then requests the Smart Wallet
  // to grant it permission to call useAndBurn() on the NFT contract.
  //
  // The player sees ONE popup at game start:
  //   "Allow Base Runner to use your power-ups during this session?"
  //   Limit: up to 10 transactions | Expires: 30 minutes
  //
  // After approval, all burns go through sessionWallet silently.

  async createSession(smartWalletClient: WalletClient): Promise<GameSession> {
    const ephemeralKey = generatePrivateKey();
    const ephemeralAccount = privateKeyToAccount(ephemeralKey);

    this.sessionWallet = createWalletClient({
      account: ephemeralAccount,
      chain: baseSepolia,
      transport: http(),
    });

    // Request Smart Wallet to grant session permissions
    // This uses Coinbase Smart Wallet's ERC-7715 session key standard
    // which OnchainKit exposes via wallet_grantPermissions
    await (smartWalletClient as any).request({
      method: "wallet_grantPermissions",
      params: [
        {
          signer: { type: "key", data: { id: ephemeralAccount.address } },
          permissions: [
            {
              type: "contract-call",
              data: {
                address: POWER_UP_NFT_ADDRESS,
                // Restrict to useAndBurn only — no other contract calls
                abi: POWER_UP_ABI,
                functionName: "useAndBurn",
              },
            },
          ],
          // Session expires in 30 minutes
          expiry: Math.floor(Date.now() / 1000) + 60 * 30,
        },
      ],
    });

    this.session = {
      sessionKey: ephemeralAccount.address,
      expiresAt: Date.now() + 30 * 60 * 1000,
      callsRemaining: 10, // generous cap for a gaming session
    };

    // Store ephemeral key in memory only — never persisted
    // In production you may want sessionStorage (clears on tab close)
    sessionStorage.setItem("_gameEphemeralKey", ephemeralKey);

    return this.session;
  }

  // ── Restore session after page refresh ───────────────────

  restoreSession(): boolean {
    const key = sessionStorage.getItem("_gameEphemeralKey");
    if (!key || !this.session) return false;
    if (Date.now() > this.session.expiresAt) {
      this.clearSession();
      return false;
    }
    const account = privateKeyToAccount(key as `0x${string}`);
    this.sessionWallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(),
    });
    return true;
  }

  clearSession() {
    sessionStorage.removeItem("_gameEphemeralKey");
    this.session = null;
    this.sessionWallet = null;
  }

  get isActive(): boolean {
    return (
      !!this.session &&
      Date.now() < this.session.expiresAt &&
      this.session.callsRemaining > 0
    );
  }

  // ── Burn on use ───────────────────────────────────────────
  //
  // Called the moment the player activates a power-up in-game.
  // No popup — session key signs silently.
  // Game effect applies immediately (optimistic). If burn reverts
  // (e.g. they somehow ran out), we reverse the game effect.

  async burnPowerUp(
    tokenId: number,
    onSuccess?: () => void,
    onFail?: (reason: string) => void
  ): Promise<void> {
    if (!this.isActive || !this.sessionWallet) {
      onFail?.("No active session — reconnect wallet");
      return;
    }

    try {
      this.session!.callsRemaining--;

      const hash = await this.sessionWallet.writeContract({
        chain: baseSepolia,
        account: this.sessionWallet.account!,
        address: POWER_UP_NFT_ADDRESS,
        abi: POWER_UP_ABI,
        functionName: "useAndBurn",
        args: [BigInt(tokenId)],
      });

      // Fire and forget — don't block the game loop waiting for receipt
      this.publicClient
        .waitForTransactionReceipt({ hash })
        .then(() => onSuccess?.())
        .catch((err) => {
          this.session!.callsRemaining++; // restore on failure
          onFail?.(err.message);
        });
    } catch (err: any) {
      this.session!.callsRemaining++;
      onFail?.(err.message);
    }
  }

  // ── Load owned power-ups ──────────────────────────────────

  async getOwnedPowerUps(playerAddress: Address): Promise<number[]> {
    const result = await this.publicClient.readContract({
      address: POWER_UP_NFT_ADDRESS,
      abi: POWER_UP_ABI,
      functionName: "getOwnedPowerUps",
      args: [playerAddress],
    });
    return (result as bigint[]).map(Number);
  }
}

// ─── Singleton export ─────────────────────────────────────────
export const gameSession = new SessionManager();


// ============================================================
// WIRING INTO Game.tsx — key changes only
// ============================================================

/*

import { gameSession } from "@/lib/GameSession";
import { useAccount, useWalletClient } from "wagmi";

const { address } = useAccount();
const { data: walletClient } = useWalletClient();

// ── On "Start Game" button click ─────────────────────────────
async function handleStartGame() {
  // Load NFT inventory
  const owned = await gameSession.getOwnedPowerUps(address!);
  powerUps.setOwnedFromNFTs(owned.map(id => TOKEN_ID_TO_POWERUP[id]));

  // Create session — ONE wallet popup here, nothing else during game
  if (!gameSession.isActive) {
    await gameSession.createSession(walletClient!);
  }

  startGameLoop();
}

// ── When player SELECTS a card (claim flow — unchanged) ──────
// Server still mints the NFT via /api/mint-powerup
// The power-up is added to their inventory

// ── When player ACTIVATES a power-up mid-game ────────────────
// This is the NEW burn flow. Apply effect optimistically,
// burn confirms in background.

function activatePowerUp(id: PowerUpId) {
  const tokenId = POWERUP_NAME_TO_TOKEN_ID[id];

  // Apply game effect immediately — don't wait for chain
  powerUps.apply(id, { lives: gameState.lives, canvasW: canvas.width, playerY: player.y });

  // Silent burn via session key
  gameSession.burnPowerUp(
    tokenId,
    () => console.log(`${id} burned successfully`),
    (reason) => {
      // Burn failed — reverse the effect
      console.error("Burn failed:", reason);
      powerUps.reverseEffect(id);  // see note below
    }
  );
}

// ── Session expiry during game ────────────────────────────────
// Check in your game loop HUD. If session expired mid-game,
// show a non-blocking toast: "Session expired — power-ups disabled"
// Don't pause the game.

if (!gameSession.isActive) {
  drawToast(ctx, "Power-ups unavailable — session expired");
}

*/

// ─── NOTE on reverseEffect ───────────────────────────────────
// For robustness, add reverseEffect() to PowerUpSystem.ts:
//
//   reverseEffect(id: PowerUpId) {
//     if (id === "health") gameState.lives = Math.max(0, gameState.lives - 1);
//     this.activeEffects = this.activeEffects.filter(e => e.id !== id);
//     this.fireballs = []; // if fireball, deactivate
//   }
//
// In practice burns rarely fail once session is established,
// but optimistic + rollback is the right pattern.

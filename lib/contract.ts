export const ONCHAIN_ARCADE_ABI = [
  {
    type: 'function',
    name: 'submitScore',
    inputs: [{ name: '_score', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getTopScores',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        internalType: 'struct OnchainArcade.Score[]',
        components: [
          { name: 'player', type: 'address', internalType: 'address' },
          { name: 'score', type: 'uint256', internalType: 'uint256' },
          { name: 'timestamp', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ScoreSubmitted',
    inputs: [
      { name: 'player', type: 'address', indexed: true, internalType: 'address' },
      { name: 'score', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;

const rawAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const isValidAddress = rawAddress && /^0x[a-fA-F0-9]{40}$/.test(rawAddress);

export const ONCHAIN_ARCADE_ADDRESS: `0x${string}` | undefined = isValidAddress
  ? (rawAddress as `0x${string}`)
  : undefined;

// ─── ConsumableItems (ERC-1155 power-up NFTs) ────────────────

// Token ID ↔ PowerUpId mapping (must match ConsumableItems.sol constants)
export const TOKEN_ID_TO_POWERUP = {
  0: 'health',
  1: 'invincible',
  2: 'timeslow',
  3: 'fireball',
} as const;

export const POWERUP_TO_TOKEN_ID = {
  health: 0,
  invincible: 1,
  timeslow: 2,
  fireball: 3,
} as const;

export const CONSUMABLE_ITEMS_ABI = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'id', type: 'uint256', internalType: 'uint256' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'useAndBurn',
    inputs: [{ name: 'tokenId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getOwnedPowerUps',
    inputs: [{ name: 'player', type: 'address', internalType: 'address' }],
    outputs: [
      { name: '', type: 'uint256[]', internalType: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [
      { name: 'account', type: 'address', internalType: 'address' },
      { name: 'id', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOfBatch',
    inputs: [
      { name: 'accounts', type: 'address[]', internalType: 'address[]' },
      { name: 'ids', type: 'uint256[]', internalType: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'event',
    name: 'ItemUsed',
    inputs: [
      { name: 'player', type: 'address', indexed: true, internalType: 'address' },
      { name: 'tokenId', type: 'uint256', indexed: true, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;

const rawPowerUpAddress = process.env.NEXT_PUBLIC_POWER_UP_NFT_ADDRESS;
const isValidPowerUpAddress = rawPowerUpAddress && /^0x[a-fA-F0-9]{40}$/.test(rawPowerUpAddress);

export const CONSUMABLE_ITEMS_ADDRESS: `0x${string}` | undefined = isValidPowerUpAddress
  ? (rawPowerUpAddress as `0x${string}`)
  : undefined;

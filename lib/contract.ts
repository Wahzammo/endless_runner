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

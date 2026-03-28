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

export const ONCHAIN_ARCADE_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

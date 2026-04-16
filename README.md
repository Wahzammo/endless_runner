# Base Runner: Psych-Out Arcade

An endless runner on Base with a sarcastic AI commentator and onchain high scores.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the environment template and fill in your values:
   ```
   cp .env.example .env.local
   ```

   | Variable | Required | Description |
   |---|---|---|
   | `GEMINI_API_KEY` | Yes | Google Gemini API key (server-side only — never exposed to browser) |
   | `NEXT_PUBLIC_CONTRACT_ADDRESS` | Yes | Deployed `OnchainArcade` contract address on Base Sepolia |
   | `APP_URL` | No | URL where the app is hosted |

3. Run the app:
   ```
   npm run dev
   ```

## Contract Deployment

The `OnchainArcade.sol` contract in `contracts/` needs to be deployed to Base Sepolia before score submission and the leaderboard will work. Set the deployed address as `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local`.

## Architecture

- **Game:** Canvas-based endless runner with speed ramp and obstacle generation
- **AI Commentator:** Gemini AI via a server-side API route (`/api/commentary`) — trash-talks on death and milestones
- **Onchain Scores:** `submitScore()` writes to Base Sepolia via wagmi; leaderboard reads `getTopScores()` live
- **Wallet:** Coinbase Smart Wallet via wagmi on Base Sepolia

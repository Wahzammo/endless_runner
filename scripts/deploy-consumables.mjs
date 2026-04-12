// Deploy ConsumableItems.sol to Base Sepolia
// Usage: npx hardhat run scripts/deploy-consumables.mjs --network baseSepolia
//
// Requires DEPLOYER_PRIVATE_KEY in .env.local
// The deployer becomes the contract owner (can mint items for players).

import hre from "hardhat";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x")
    ? process.env.DEPLOYER_PRIVATE_KEY
    : `0x${process.env.DEPLOYER_PRIVATE_KEY}`;

  const account = privateKeyToAccount(privateKey);
  const artifact = await hre.artifacts.readArtifact("ConsumableItems");

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http("https://sepolia.base.org"),
  });

  console.log(`Deploying ConsumableItems from ${account.address}...`);

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  });

  console.log(`Transaction hash: ${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log(`\nConsumableItems deployed to: ${receipt.contractAddress}`);
  console.log(`\nAdd this to your .env.local:`);
  console.log(`NEXT_PUBLIC_POWER_UP_NFT_ADDRESS="${receipt.contractAddress}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

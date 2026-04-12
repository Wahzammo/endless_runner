// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title ConsumableItems — persistent cross-run on-chain inventory
/// @notice ERC-1155 contract for Base Runner power-ups. Items are minted
///         by the server (owner) as free milestone rewards and burned by
///         the player when activated mid-run via session key.
contract ConsumableItems is ERC1155, Ownable {
    // Token IDs — must match PowerUpId mapping in the frontend
    uint256 public constant HEALTH = 0;
    uint256 public constant INVINCIBLE = 1;
    uint256 public constant TIMESLOW = 2;
    uint256 public constant FIREBALL = 3;

    uint256 public constant NUM_ITEM_TYPES = 4;

    event ItemUsed(address indexed player, uint256 indexed tokenId);

    constructor() ERC1155("") Ownable(msg.sender) {}

    /// @notice Mint a power-up to a player's wallet. Only callable by the
    ///         server wallet (contract owner) via /api/mint-powerup.
    function mint(address to, uint256 id, uint256 amount) external onlyOwner {
        require(id < NUM_ITEM_TYPES, "Invalid item type");
        _mint(to, id, amount, "");
    }

    /// @notice Mint multiple items in one transaction (batch).
    function mintBatch(
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external onlyOwner {
        for (uint256 i = 0; i < ids.length; i++) {
            require(ids[i] < NUM_ITEM_TYPES, "Invalid item type");
        }
        _mintBatch(to, ids, amounts, "");
    }

    /// @notice Burn one item from the caller's inventory. Called mid-run
    ///         via session key — no wallet popup for the player.
    function useAndBurn(uint256 tokenId) external {
        require(balanceOf(msg.sender, tokenId) > 0, "No item to burn");
        _burn(msg.sender, tokenId, 1);
        emit ItemUsed(msg.sender, tokenId);
    }

    /// @notice Returns which item types the player owns (has balance > 0).
    ///         Used by the frontend to populate the power-up card pool.
    function getOwnedPowerUps(address player) external view returns (uint256[] memory) {
        // Count how many types the player owns
        uint256 count = 0;
        for (uint256 i = 0; i < NUM_ITEM_TYPES; i++) {
            if (balanceOf(player, i) > 0) count++;
        }

        // Build the result array
        uint256[] memory owned = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < NUM_ITEM_TYPES; i++) {
            if (balanceOf(player, i) > 0) {
                owned[idx] = i;
                idx++;
            }
        }

        return owned;
    }
}

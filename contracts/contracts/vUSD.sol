// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title vUSD
 * @notice Official ERC-4626 Tokenized Vault for 1mol Yield USD.
 * Adheres strictly to EIP-4626 standard.
 *
 * - Deposit: Users deposit underlying USD stable asset (USDC) -> Mints vUSD shares.
 * - Yield Accrual: Yield from 1inch liquidity strategies is deposited into the vault,
 *   increasing totalAssets() and therefore the asset value of each vUSD share.
 * - Redeem / Withdraw: Users burn vUSD shares -> Receives underlying USD asset + accrued yield.
 */
contract vUSD is ERC4626, Ownable {
    using SafeERC20 for IERC20;

    event YieldAccrued(address indexed source, uint256 yieldAmount, uint256 newTotalAssets);

    constructor(IERC20 underlyingAsset_)
        ERC4626(underlyingAsset_)
        ERC20("1mol Yield USD", "vUSD")
        Ownable(msg.sender)
    {}

    /**
     * @notice Injects yield earned from 1inch shared liquidity strategies into the vault.
     * This increases totalAssets(), raising the conversion rate (share price) for all vUSD holders.
     */
    function accrueYield(uint256 yieldAmount) external {
        require(yieldAmount > 0, "Yield must be > 0");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), yieldAmount);
        emit YieldAccrued(msg.sender, yieldAmount, totalAssets());
    }
}

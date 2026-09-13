// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EarnVault
 * @notice Layer 2 of the protocol, a nested ERC-4626 vault.
 *
 * Underlying asset: vUSD (the Layer 1 receipt).
 * Shares: stvUSD - share-appreciating in the wstETH sense, so the holder's
 * balance stays constant and each share redeems for more vUSD over time.
 *
 * There is no emission token. Restaking earns its return from the vUSD the
 * vault holds and from a higher loyalty curve, not from minting a reward token.
 */
contract EarnVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor(IERC20 _vUsdStakingToken)
        ERC4626(_vUsdStakingToken)
        ERC20("1mol Staked Yield USD", "stvUSD")
        Ownable(msg.sender)
    {}

    /**
     * @notice Redeem the caller's entire position back to vUSD.
     */
    function exit() external returns (uint256 assets) {
        assets = redeem(balanceOf(msg.sender), msg.sender, msg.sender);
    }

}

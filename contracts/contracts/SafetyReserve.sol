// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SafetyReserve
 * @notice First-loss capital that absorbs market-making shortfalls before they
 *         reach depositors' share price.
 *
 * Market making on real inventory occasionally loses money: a strategy is
 * filled on the wrong side of a fast move, or a rebalance settles worse than
 * quoted. Paying out every unit of profit leaves nothing to absorb that, so a
 * fraction of each realised gain is retained here instead.
 *
 * Distribution of realised profit (basis points, configurable):
 *   8_500  compounds into the vault, lifting the ERC-4626 share price
 *   1_000  retained here as first-loss capital
 *     500  protocol treasury
 *
 * Losses are covered from this balance up to whatever it holds; anything beyond
 * that is reported as uncovered and does hit the share price. The contract does
 * not pretend to guarantee principal - it bounds the drawdown it can actually
 * fund, and says so when it cannot.
 */
contract SafetyReserve is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable asset;
    address public vault;

    uint256 public totalCovered;
    uint256 public totalContributed;

    event Contributed(address indexed from, uint256 amount, uint256 balance);
    event LossCovered(uint256 requested, uint256 covered, uint256 uncovered);
    event VaultUpdated(address vault);
    event TreasuryWithdrawal(address indexed to, uint256 amount);

    error NotVault();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(IERC20 asset_) Ownable(msg.sender) {
        require(address(asset_) != address(0), "Zero asset");
        asset = asset_;
    }

    function setVault(address vault_) external onlyOwner {
        require(vault_ != address(0), "Zero vault");
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    /// @notice Retains a slice of realised profit as first-loss capital.
    function contribute(uint256 amount) external {
        require(amount > 0, "Nothing to contribute");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        totalContributed += amount;
        emit Contributed(msg.sender, amount, asset.balanceOf(address(this)));
    }

    /**
     * @notice Covers a shortfall up to the reserve's balance.
     * @return covered Amount actually sent to the vault.
     * @return uncovered Shortfall the reserve could not fund, which will hit the
     *         share price. Reported rather than hidden.
     */
    function coverLoss(uint256 amount) external onlyVault returns (uint256 covered, uint256 uncovered) {
        uint256 available = asset.balanceOf(address(this));
        covered = amount > available ? available : amount;
        uncovered = amount - covered;

        if (covered > 0) {
            totalCovered += covered;
            asset.safeTransfer(vault, covered);
        }

        emit LossCovered(amount, covered, uncovered);
    }

    /// @notice Coverage currently available, in asset terms.
    function available() external view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    /**
     * @notice Coverage depth relative to the vault's assets, in bps.
     * @dev The figure a depositor should judge the reserve by - an absolute
     *      balance means little without the exposure it backs.
     */
    function coverageRatioBps(uint256 vaultAssets) external view returns (uint256) {
        if (vaultAssets == 0) return 0;
        return (asset.balanceOf(address(this)) * 10_000) / vaultAssets;
    }

    /**
     * @notice Withdraws reserve funds. Owner-only and deliberately unguarded by
     *         a timelock in this MVP - production should gate it behind one.
     */
    function withdrawToTreasury(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Zero recipient");
        asset.safeTransfer(to, amount);
        emit TreasuryWithdrawal(to, amount);
    }
}

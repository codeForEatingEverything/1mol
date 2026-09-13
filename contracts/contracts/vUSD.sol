// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISafetyReserve {
    function contribute(uint256 amount) external;
    function coverLoss(uint256 amount) external returns (uint256 covered, uint256 uncovered);
    function available() external view returns (uint256);
}

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

    uint256 public constant BPS = 10_000;

    /// @notice First-loss capital that absorbs shortfalls before the share price.
    ISafetyReserve public safetyReserve;

    /// @notice Protocol treasury receiving its slice of realised profit.
    address public treasury;

    /// @notice Profit split, in bps. The compounding share is the remainder.
    uint16 public reserveBps = 1_000; // 10% retained as first-loss capital
    uint16 public treasuryBps = 500; // 5% to treasury

    event YieldAccrued(address indexed source, uint256 yieldAmount, uint256 newTotalAssets);
    event ProfitDistributed(uint256 compounded, uint256 toReserve, uint256 toTreasury);
    event LossAbsorbed(uint256 requested, uint256 covered, uint256 uncovered);
    event SplitUpdated(uint16 reserveBps, uint16 treasuryBps);
    event SafetyReserveUpdated(address reserve);
    event TreasuryUpdated(address treasury);

    constructor(IERC20 underlyingAsset_)
        ERC4626(underlyingAsset_)
        ERC20("1mol Yield USD", "vUSD")
        Ownable(msg.sender)
    {
        treasury = msg.sender;
    }

    function setSafetyReserve(address reserve) external onlyOwner {
        safetyReserve = ISafetyReserve(reserve);
        emit SafetyReserveUpdated(reserve);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "Zero treasury");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /**
     * @notice Updates the profit split. The compounding share is whatever is
     *         left, so the two configurable legs must stay under 100%.
     */
    function setSplit(uint16 reserveBps_, uint16 treasuryBps_) external onlyOwner {
        require(uint256(reserveBps_) + treasuryBps_ < BPS, "Split >= 100%");
        reserveBps = reserveBps_;
        treasuryBps = treasuryBps_;
        emit SplitUpdated(reserveBps_, treasuryBps_);
    }

    /**
     * @notice Injects yield earned from 1inch shared liquidity strategies into the vault.
     * This increases totalAssets(), raising the conversion rate (share price) for all vUSD holders.
     */
    function accrueYield(uint256 yieldAmount) external {
        require(yieldAmount > 0, "Yield must be > 0");
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), yieldAmount);

        // Route the configured slices out of the vault; whatever stays behind is
        // what lifts totalAssets() and therefore every holder's share price.
        uint256 toReserve;
        uint256 toTreasury;

        if (address(safetyReserve) != address(0) && reserveBps > 0) {
            toReserve = (yieldAmount * reserveBps) / BPS;
            if (toReserve > 0) {
                IERC20(asset()).forceApprove(address(safetyReserve), toReserve);
                safetyReserve.contribute(toReserve);
            }
        }

        if (treasury != address(0) && treasuryBps > 0) {
            toTreasury = (yieldAmount * treasuryBps) / BPS;
            if (toTreasury > 0) IERC20(asset()).safeTransfer(treasury, toTreasury);
        }

        emit ProfitDistributed(yieldAmount - toReserve - toTreasury, toReserve, toTreasury);
        emit YieldAccrued(msg.sender, yieldAmount, totalAssets());
    }

    /**
     * @notice Absorbs a realised market-making loss from the reserve first.
     * @dev Any part the reserve cannot fund is emitted as `uncovered` and does
     *      reduce the share price. The vault never hides a shortfall.
     */
    function absorbLoss(uint256 amount) external onlyOwner returns (uint256 covered, uint256 uncovered) {
        require(amount > 0, "Nothing to absorb");

        if (address(safetyReserve) == address(0)) {
            emit LossAbsorbed(amount, 0, amount);
            return (0, amount);
        }

        (covered, uncovered) = safetyReserve.coverLoss(amount);
        emit LossAbsorbed(amount, covered, uncovered);
    }
}

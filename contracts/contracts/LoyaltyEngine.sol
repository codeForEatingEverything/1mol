// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LoyaltyEngine
 * @notice Prices the risk a depositor opts into, and pays for it.
 *
 * The problem it answers
 * ---------------------
 * On Aqua a depositor may delegate one balance across several strategies. Doing
 * so raises return sub-linearly while raising the chance of ruin much faster,
 * so a depositor who opts into more strategies is taking on risk that a flat
 * pro-rata reward schedule would not pay them for. That asymmetry is what makes
 * most users decline, which in turn thins the liquidity the protocol depends on.
 *
 * This contract makes the trade explicit. Each strategy tier carries a risk
 * weight; a depositor selects which tiers their capital may be delegated to and
 * earns loyalty power proportional to the risk actually accepted, multiplied by
 * a tenure factor. Reward emission is then split by loyalty power rather than
 * by deposit size, so the depositor carrying more of the protocol's risk
 * receives a proportionally larger share of the upside.
 *
 * Tenure resets on withdrawal: the multiplier pays for staying through
 * volatility, so exiting early forfeits it rather than banking it.
 */
contract LoyaltyEngine is Ownable {
    uint256 public constant WEIGHT_PRECISION = 1e18;

    /// @notice Risk tiers a depositor can opt into, coarsest first.
    enum Tier {
        Stable, // pegged pairs, lowest variance
        Major, // ETH/BTC quoted strategies
        LongTail // long-tail pairs, highest variance
    }

    struct TierConfig {
        bool enabled;
        uint64 riskWeight; // scaled by WEIGHT_PRECISION
    }

    struct Position {
        uint256 principal;
        uint8 tierMask; // bitmask of opted-in tiers
        uint64 since; // timestamp tenure started
        bool restaked; // true once the position is staked onward for stvUSD
    }

    mapping(Tier => TierConfig) public tiers;
    mapping(address => Position) public positions;

    /// @notice Sum of all loyalty power, so shares can be computed without iterating.
    uint256 public totalLoyaltyPower;
    mapping(address => uint256) public loyaltyPowerOf;

    /// @notice Tenure multipliers, scaled by WEIGHT_PRECISION.
    uint64 public tenure30d = 1.2e18;
    uint64 public tenure90d = 1.5e18;

    /**
     * @notice Extra multiplier for capital staked onward into Earn as stvUSD.
     * @dev Restaking commits the position for longer and deepens the liquidity
     *      the protocol can quote against, so it earns a higher curve than
     *      vUSD held idle.
     */
    uint64 public restakeMultiplier = 1.4e18;

    address public vault;

    event TierConfigured(Tier tier, uint64 riskWeight, bool enabled);
    event TenureUpdated(uint64 tenure30d, uint64 tenure90d);
    event RestakeMultiplierUpdated(uint64 multiplier);
    event DelegationUpdated(address indexed account, uint8 tierMask, bool restaked, uint256 loyaltyPower);
    event VaultUpdated(address vault);

    error NotVault();
    error NoTierSelected();
    error TierDisabled(Tier tier);
    error InvalidWeight();

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor() Ownable(msg.sender) {
        // Weights price variance, not preference: a depositor accepting long-tail
        // exposure carries several times the ruin risk of a pegged-pair one.
        tiers[Tier.Stable] = TierConfig({enabled: true, riskWeight: 1.0e18});
        tiers[Tier.Major] = TierConfig({enabled: true, riskWeight: 1.8e18});
        tiers[Tier.LongTail] = TierConfig({enabled: true, riskWeight: 3.5e18});
    }

    function setVault(address vault_) external onlyOwner {
        require(vault_ != address(0), "Zero vault");
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    function configureTier(Tier tier, uint64 riskWeight, bool enabled) external onlyOwner {
        if (riskWeight == 0 || riskWeight > 10e18) revert InvalidWeight();
        tiers[tier] = TierConfig({enabled: enabled, riskWeight: riskWeight});
        emit TierConfigured(tier, riskWeight, enabled);
    }

    function setTenureMultipliers(uint64 m30, uint64 m90) external onlyOwner {
        require(m30 >= WEIGHT_PRECISION && m90 >= m30, "Non-monotonic");
        tenure30d = m30;
        tenure90d = m90;
        emit TenureUpdated(m30, m90);
    }

    function setRestakeMultiplier(uint64 multiplier) external onlyOwner {
        require(multiplier >= WEIGHT_PRECISION && multiplier <= 5e18, "Out of range");
        restakeMultiplier = multiplier;
        emit RestakeMultiplierUpdated(multiplier);
    }

    // ------------------------------------------------------------ accounting

    /**
     * @notice Records a depositor's principal and which risk tiers it may serve.
     * @dev Called by the vault on deposit, withdrawal, or a delegation change.
     *      Raising the opted-in risk restarts tenure, so a depositor cannot bank
     *      a long-tenure multiplier at low risk and then flip to high risk.
     */
    function updatePosition(
        address account,
        uint256 principal,
        uint8 tierMask,
        bool restaked
    ) external onlyVault {
        if (principal > 0 && tierMask == 0) revert NoTierSelected();

        Position storage pos = positions[account];
        uint8 previousMask = pos.tierMask;

        // Validate the selection and sum its risk weight.
        uint256 riskSum;
        for (uint8 i; i < 3; ++i) {
            if (tierMask & (uint8(1) << i) != 0) {
                TierConfig memory cfg = tiers[Tier(i)];
                if (!cfg.enabled) revert TierDisabled(Tier(i));
                riskSum += cfg.riskWeight;
            }
        }

        bool riskIncreased = tierMask & ~previousMask != 0;
        if (pos.since == 0 || principal == 0 || riskIncreased) {
            pos.since = uint64(block.timestamp);
        }

        pos.principal = principal;
        pos.tierMask = tierMask;
        pos.restaked = restaked;

        uint256 power = principal == 0
            ? 0
            : (principal * riskSum * tenureMultiplier(account) * (restaked ? restakeMultiplier : uint64(WEIGHT_PRECISION)))
                / (WEIGHT_PRECISION * WEIGHT_PRECISION * WEIGHT_PRECISION);

        totalLoyaltyPower = totalLoyaltyPower - loyaltyPowerOf[account] + power;
        loyaltyPowerOf[account] = power;

        emit DelegationUpdated(account, tierMask, restaked, power);
    }

    // ----------------------------------------------------------------- views

    function tenureMultiplier(address account) public view returns (uint256) {
        uint64 since = positions[account].since;
        if (since == 0) return WEIGHT_PRECISION;

        uint256 held = block.timestamp - since;
        if (held >= 90 days) return tenure90d;
        if (held >= 30 days) return tenure30d;
        return WEIGHT_PRECISION;
    }

    /// @notice Total risk weight of a depositor's current selection.
    function riskWeightOf(address account) public view returns (uint256 riskSum) {
        uint8 mask = positions[account].tierMask;
        for (uint8 i; i < 3; ++i) {
            if (mask & (uint8(1) << i) != 0) riskSum += tiers[Tier(i)].riskWeight;
        }
    }

    /**
     * @notice The depositor's total loyalty multiplier, scaled by WEIGHT_PRECISION.
     * @dev What the UI should surface: risk accepted x tenure x restaking.
     */
    function totalMultiplier(address account) external view returns (uint256) {
        uint256 risk = riskWeightOf(account);
        if (risk == 0) return 0;
        uint256 restake = positions[account].restaked ? restakeMultiplier : WEIGHT_PRECISION;
        return (risk * tenureMultiplier(account) * restake) / (WEIGHT_PRECISION * WEIGHT_PRECISION);
    }

    /**
     * @notice Share of reward emission this depositor has earned, in bps.
     * @dev Flat pro-rata would return principal share; this returns risk-weighted
     *      share, which is the whole point of the engine.
     */
    function emissionShareBps(address account) external view returns (uint256) {
        if (totalLoyaltyPower == 0) return 0;
        return (loyaltyPowerOf[account] * 10_000) / totalLoyaltyPower;
    }

    /// @notice Convenience helper for building a tier mask off-chain.
    function tierMask(bool stable, bool major, bool longTail) external pure returns (uint8 mask) {
        if (stable) mask |= uint8(1) << uint8(Tier.Stable);
        if (major) mask |= uint8(1) << uint8(Tier.Major);
        if (longTail) mask |= uint8(1) << uint8(Tier.LongTail);
    }
}

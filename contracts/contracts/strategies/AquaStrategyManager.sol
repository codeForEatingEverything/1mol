// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAqua} from "../interfaces/IAqua.sol";

/**
 * @title AquaStrategyManager
 * @notice Lets the vault act as a single aggregated maker on 1inch Aqua.
 *
 * Why this contract exists
 * -----------------------
 * Aqua is self-custodial: it records balances as allowances and never escrows
 * tokens. An individual LP therefore holds a market-making position with no
 * receipt token, and must pay gas to dock and re-ship every time the market
 * moves, because a shipped strategy is immutable.
 *
 * Delegating one balance across several strategies is what makes Aqua capital
 * efficient, but for a lone LP it also compounds ruin risk faster than it
 * compounds return. Aggregating many depositors behind one maker is what makes
 * that tradeoff manageable: a single rebalance covers every depositor, so the
 * per-depositor gas cost of staying in range falls with the size of the pool,
 * and one shared inventory is exposed to a diversified set of strategies
 * instead of each depositor carrying concentrated single-sided exposure.
 *
 * Risk controls (enforced here, not assumed)
 * -----------------------------------------
 *  - Strategies must be allowlisted by the owner before capital reaches them.
 *  - Per-strategy allocation caps, expressed in basis points of managed assets,
 *    bound how much a single strategy can ever draw.
 *  - A global ceiling bounds total exposure so a buffer always stays liquid for
 *    redemptions.
 *  - Emergency dock pulls every live strategy back in one call.
 */
contract AquaStrategyManager is Ownable {
    using SafeERC20 for IERC20;

    /// @notice Aqua registry. Same address on every supported mainnet.
    IAqua public immutable aqua;

    /// @notice Vault whose assets this manager deploys. Only it may allocate.
    address public immutable vault;

    uint256 public constant BPS = 10_000;

    struct StrategyConfig {
        bool allowed;
        uint16 maxAllocationBps; // cap on managed assets this strategy may draw
        bytes32 strategyHash; // non-zero once shipped
    }

    /// @notice app contract => configuration
    mapping(address => StrategyConfig) public strategies;
    address[] public strategyList;

    /// @notice Share of managed assets that may be deployed in total.
    uint16 public globalCapBps = 9_000; // 10% stays as a redemption buffer

    event StrategyAllowed(address indexed app, uint16 maxAllocationBps);
    event StrategyRevoked(address indexed app);
    event GlobalCapUpdated(uint16 capBps);
    event Shipped(address indexed app, bytes32 strategyHash, address[] tokens, uint256[] amounts);
    event Docked(address indexed app, bytes32 strategyHash);
    event EmergencyDocked(uint256 strategiesDocked);

    error NotVault();
    error StrategyNotAllowed(address app);
    error AllocationAboveCap(uint256 requested, uint256 cap);
    error NothingShipped(address app);
    error InvalidCap(uint16 capBps);

    modifier onlyVault() {
        if (msg.sender != vault) revert NotVault();
        _;
    }

    constructor(address aqua_, address vault_) Ownable(msg.sender) {
        require(aqua_ != address(0) && vault_ != address(0), "Zero address");
        aqua = IAqua(aqua_);
        vault = vault_;
    }

    // ---------------------------------------------------------------- config

    function allowStrategy(address app, uint16 maxAllocationBps) external onlyOwner {
        require(app != address(0), "Zero app");
        if (maxAllocationBps == 0 || maxAllocationBps > BPS) revert InvalidCap(maxAllocationBps);

        if (!strategies[app].allowed) strategyList.push(app);
        strategies[app].allowed = true;
        strategies[app].maxAllocationBps = maxAllocationBps;

        emit StrategyAllowed(app, maxAllocationBps);
    }

    function revokeStrategy(address app) external onlyOwner {
        strategies[app].allowed = false;
        emit StrategyRevoked(app);
    }

    function setGlobalCap(uint16 capBps) external onlyOwner {
        if (capBps > BPS) revert InvalidCap(capBps);
        globalCapBps = capBps;
        emit GlobalCapUpdated(capBps);
    }

    // ------------------------------------------------------------ allocation

    /**
     * @notice Ships an allowlisted strategy to Aqua on the vault's behalf.
     * @dev Caps are checked against `managedAssets` (the vault's total assets in
     *      `capToken` terms) before any approval is granted.
     */
    function shipStrategy(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts,
        address capToken,
        uint256 managedAssets
    ) external onlyVault returns (bytes32 strategyHash) {
        StrategyConfig storage cfg = strategies[app];
        if (!cfg.allowed) revert StrategyNotAllowed(app);
        require(tokens.length == amounts.length && tokens.length > 0, "Length mismatch");

        // Bound this strategy's draw on the token the cap is denominated in.
        uint256 requested;
        for (uint256 i; i < tokens.length; ++i) {
            if (tokens[i] == capToken) requested += amounts[i];
        }
        uint256 cap = (managedAssets * cfg.maxAllocationBps) / BPS;
        uint256 globalCap = (managedAssets * globalCapBps) / BPS;
        if (requested > cap) revert AllocationAboveCap(requested, cap);
        if (requested > globalCap) revert AllocationAboveCap(requested, globalCap);

        // Aqua pulls against an allowance; tokens never leave this contract.
        for (uint256 i; i < tokens.length; ++i) {
            IERC20(tokens[i]).forceApprove(address(aqua), amounts[i]);
        }

        strategyHash = aqua.ship(app, strategy, tokens, amounts);
        cfg.strategyHash = strategyHash;

        emit Shipped(app, strategyHash, tokens, amounts);
    }

    /**
     * @notice Docks a live strategy, returning its unfilled balances.
     */
    function dockStrategy(address app, address[] calldata tokens) external onlyVault {
        bytes32 hash = strategies[app].strategyHash;
        if (hash == bytes32(0)) revert NothingShipped(app);

        aqua.dock(app, hash, tokens);
        strategies[app].strategyHash = bytes32(0);

        emit Docked(app, hash);
    }

    /**
     * @notice Docks every live strategy. Callable by owner or vault so a keeper
     *         can pull liquidity back without waiting on vault governance.
     */
    function emergencyDockAll(address[] calldata tokens) external {
        require(msg.sender == owner() || msg.sender == vault, "Not authorised");

        uint256 docked;
        for (uint256 i; i < strategyList.length; ++i) {
            address app = strategyList[i];
            bytes32 hash = strategies[app].strategyHash;
            if (hash != bytes32(0)) {
                aqua.dock(app, hash, tokens);
                strategies[app].strategyHash = bytes32(0);
                ++docked;
                emit Docked(app, hash);
            }
        }
        emit EmergencyDocked(docked);
    }

    // ----------------------------------------------------------------- views

    function getStrategies() external view returns (address[] memory) {
        return strategyList;
    }

    function activeStrategyCount() external view returns (uint256 count) {
        for (uint256 i; i < strategyList.length; ++i) {
            if (strategies[strategyList[i]].strategyHash != bytes32(0)) ++count;
        }
    }

    /// @notice Unfilled balance Aqua still attributes to a strategy.
    function strategyBalance(address app, address token) external view returns (uint256) {
        bytes32 hash = strategies[app].strategyHash;
        if (hash == bytes32(0)) return 0;
        (uint248 balance, ) = aqua.rawBalances(address(this), app, hash, token);
        return uint256(balance);
    }

    /// @notice Returns idle tokens to the vault.
    function sweepTo(address token, uint256 amount) external onlyVault {
        IERC20(token).safeTransfer(vault, amount);
    }
}

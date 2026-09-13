// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAqua
 * @notice Interface for the 1inch Aqua liquidity registry.
 *
 * Deployed deterministically to the same address on every supported mainnet:
 *   Aqua registry : 0x1111113ccf1426a8e30e2bff5e005d929bf6a90a
 *   SwapVM router : 0x111111338c5091e8440b67b168bae16a668ac0de
 *
 * Signatures mirror AQUA_ABI as published in the 1inch aqua-sdk npm package
 * (v0.3.4) and the 1inch/aqua repository. This declares the external surface
 * only - no Aqua
 * source is vendored here, since Aqua ships under a proprietary licence
 * (LicenseRef-Degensoft-Aqua-Source-1.1) while this repository is MIT.
 *
 * Aqua never escrows tokens. It records `balances[maker][app][strategyHash][token]`
 * as an allowance, so assets stay in the maker's own account. That is exactly why
 * a vault contract can act as the maker on behalf of its depositors: the capital
 * remains inside the vault and stays accountable to its ERC-4626 share supply.
 */
interface IAqua {
    /**
     * @notice Registers a liquidity strategy and seeds its virtual balances.
     * @dev A strategy is immutable once shipped; re-parameterising means dock-then-ship.
     * @param app Strategy application contract that will execute quotes.
     * @param strategy ABI-encoded strategy parameters; its keccak256 is the strategy id.
     * @param tokens Tokens the strategy may trade.
     * @param amounts Virtual balance to expose per token.
     * @return strategyHash Identifier derived from the encoded strategy.
     */
    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash);

    /**
     * @notice Deactivates a strategy and withdraws its remaining virtual balances.
     */
    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external;

    /**
     * @notice Moves maker tokens to a taker. Called by the strategy app during a swap.
     */
    function pull(
        address maker,
        bytes32 strategyHash,
        address token,
        uint256 amount,
        address to
    ) external;

    /**
     * @notice Credits tokens back into a maker's strategy balance.
     */
    function push(
        address maker,
        address app,
        bytes32 strategyHash,
        address token,
        uint256 amount
    ) external;

    /**
     * @notice Raw virtual balance for one token of a strategy.
     */
    function rawBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token
    ) external view returns (uint248 balance, uint8 tokensCount);

    /**
     * @notice Balances for a token pair; reverts if a token is not in the active strategy.
     */
    function safeBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token0,
        address token1
    ) external view returns (uint256, uint256);
}

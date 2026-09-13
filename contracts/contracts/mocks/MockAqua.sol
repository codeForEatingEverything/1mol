// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAqua} from "../interfaces/IAqua.sol";

/**
 * @notice Local stand-in for the Aqua registry, used to test this repository's
 *         risk controls without a network round-trip.
 *
 * It reproduces the two behaviours the vault's accounting depends on: a
 * strategy id derived from keccak256 of the encoded strategy, and balances held
 * as allowances rather than escrow. The real registry is exercised separately
 * against mainnet in test/Aqua.fork.test.ts - this mock is not a substitute for
 * that, only a way to test the caps deterministically.
 */
contract MockAqua is IAqua {
    mapping(address => mapping(address => mapping(bytes32 => mapping(address => uint256)))) public balances;
    mapping(bytes32 => bool) public active;
    mapping(bytes32 => uint8) public tokenCount;

    event MockShipped(address maker, address app, bytes32 strategyHash);
    event MockDocked(address maker, address app, bytes32 strategyHash);

    function ship(
        address app,
        bytes calldata strategy,
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external returns (bytes32 strategyHash) {
        strategyHash = keccak256(strategy);
        require(!active[strategyHash], "Already shipped");
        require(tokens.length == amounts.length, "Length mismatch");

        for (uint256 i; i < tokens.length; ++i) {
            // Mirrors Aqua: the maker must have approved the registry, but the
            // tokens are not transferred out.
            require(
                IERC20(tokens[i]).allowance(msg.sender, address(this)) >= amounts[i],
                "Insufficient allowance"
            );
            balances[msg.sender][app][strategyHash][tokens[i]] = amounts[i];
        }

        active[strategyHash] = true;
        tokenCount[strategyHash] = uint8(tokens.length);
        emit MockShipped(msg.sender, app, strategyHash);
    }

    function dock(address app, bytes32 strategyHash, address[] calldata tokens) external {
        require(active[strategyHash], "Not shipped");
        for (uint256 i; i < tokens.length; ++i) {
            balances[msg.sender][app][strategyHash][tokens[i]] = 0;
        }
        active[strategyHash] = false;
        tokenCount[strategyHash] = 0;
        emit MockDocked(msg.sender, app, strategyHash);
    }

    function pull(address maker, bytes32 strategyHash, address token, uint256 amount, address to) external {
        uint256 bal = balances[maker][msg.sender][strategyHash][token];
        require(bal >= amount, "Exceeds strategy balance");
        balances[maker][msg.sender][strategyHash][token] = bal - amount;
        IERC20(token).transferFrom(maker, to, amount);
    }

    function push(address maker, address app, bytes32 strategyHash, address token, uint256 amount) external {
        balances[maker][app][strategyHash][token] += amount;
    }

    function rawBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token
    ) external view returns (uint248 balance, uint8 tokensCount) {
        balance = uint248(balances[maker][app][strategyHash][token]);
        tokensCount = tokenCount[strategyHash];
    }

    function safeBalances(
        address maker,
        address app,
        bytes32 strategyHash,
        address token0,
        address token1
    ) external view returns (uint256, uint256) {
        require(active[strategyHash], "Strategy not active");
        return (
            balances[maker][app][strategyHash][token0],
            balances[maker][app][strategyHash][token1]
        );
    }
}

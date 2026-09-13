// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MolToken
 * @notice Protocol reward and governance token for 1mol Layer 2 Earn strategies.
 */
contract MolToken is ERC20, Ownable {
    mapping(address => bool) public isMinter;

    event MinterUpdated(address indexed minter, bool status);

    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner(), "MolToken: caller not authorized");
        _;
    }

    constructor() ERC20("1mol Protocol Token", "1MOL") Ownable(msg.sender) {
        // Initial distribution for liquidity and reward treasury
        _mint(msg.sender, 10_000_000 * 1e18);
    }

    function setMinter(address minter, bool status) external onlyOwner {
        require(minter != address(0), "Zero address");
        isMinter[minter] = status;
        emit MinterUpdated(minter, status);
    }

    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }
}

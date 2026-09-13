// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./vUSD.sol";

/**
 * @title StableVault
 * @notice Gateway for stablecoins (USDC, USDT) to mint ERC-4626 vUSD shares.
 * Utilizes the official EIP-4626 standard.
 */
contract StableVault is Ownable {
    using SafeERC20 for IERC20;

    vUSD public immutable yieldVault; // The ERC-4626 vUSD contract
    IERC20 public immutable baseAsset; // Primary underlying asset (USDC)

    mapping(address => bool) public isSupportedToken;
    address[] public supportedTokens;

    event Deposited(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 vUsdSharesMinted);
    event Withdrawn(address indexed user, address indexed tokenOut, uint256 tokenAmount, uint256 vUsdSharesBurned);

    constructor(address _vUsdAddress) Ownable(msg.sender) {
        require(_vUsdAddress != address(0), "Invalid vUSD address");
        yieldVault = vUSD(_vUsdAddress);
        baseAsset = IERC20(yieldVault.asset());
        isSupportedToken[address(baseAsset)] = true;
        supportedTokens.push(address(baseAsset));
    }

    function addSupportedToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(!isSupportedToken[token], "Already supported");
        isSupportedToken[token] = true;
        supportedTokens.push(token);
    }

    /**
     * @notice Deposit supported stablecoin to mint ERC-4626 vUSD shares directly to user.
     */
    function deposit(address token, uint256 amount) external returns (uint256 sharesMinted) {
        require(isSupportedToken[token], "Unsupported stablecoin");
        require(amount > 0, "Amount must be > 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        if (token == address(baseAsset)) {
            IERC20(baseAsset).approve(address(yieldVault), amount);
            sharesMinted = yieldVault.deposit(amount, msg.sender);
        } else {
            // For other stablecoins (e.g. USDT), normalize and deposit into ERC-4626 vault
            uint8 decIn = IERC20Metadata(token).decimals();
            uint8 decBase = IERC20Metadata(address(baseAsset)).decimals();
            uint256 baseEquivalent = amount;
            if (decIn < decBase) {
                baseEquivalent = amount * (10 ** (decBase - decIn));
            } else if (decIn > decBase) {
                baseEquivalent = amount / (10 ** (decIn - decBase));
            }
            IERC20(baseAsset).approve(address(yieldVault), baseEquivalent);
            sharesMinted = yieldVault.deposit(baseEquivalent, msg.sender);
        }

        emit Deposited(msg.sender, token, amount, sharesMinted);
    }

    /**
     * @notice Withdraw by redeeming ERC-4626 vUSD shares for underlying stablecoin.
     */
    function withdraw(address token, uint256 shares) external returns (uint256 assetsReceived) {
        require(isSupportedToken[token], "Unsupported stablecoin");
        require(shares > 0, "Shares must be > 0");

        // Redeem vUSD shares for base asset
        assetsReceived = yieldVault.redeem(shares, msg.sender, msg.sender);

        emit Withdrawn(msg.sender, token, assetsReceived, shares);
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }
}

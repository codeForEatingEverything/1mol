// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./vUSD.sol";

/**
 * @title MajorVault
 * @notice Gateway for Major Assets (ETH, BTC) to mint ERC-4626 vUSD shares.
 * Converts asset value at current market price into underlying USD collateral,
 * depositing into the ERC-4626 vUSD vault directly for the user.
 */
contract MajorVault is Ownable {
    using SafeERC20 for IERC20;

    vUSD public immutable yieldVault;
    IERC20 public immutable baseAsset;

    struct MajorAssetConfig {
        bool isSupported;
        uint8 decimals;
        uint256 priceUSD; // 18-decimal price, e.g. 3000 * 1e18 for ETH
    }

    mapping(address => MajorAssetConfig) public supportedAssets;
    address[] public assetList;

    event AssetConfigured(address indexed asset, uint8 decimals, uint256 priceUSD);
    event PriceUpdated(address indexed asset, uint256 newPriceUSD);
    event Deposited(address indexed user, address indexed asset, uint256 amountIn, uint256 sharesMinted);
    event Withdrawn(address indexed user, address indexed asset, uint256 amountOut, uint256 sharesBurned);

    constructor(address _vUsdAddress) Ownable(msg.sender) {
        require(_vUsdAddress != address(0), "Invalid vUSD");
        yieldVault = vUSD(_vUsdAddress);
        baseAsset = IERC20(yieldVault.asset());
    }

    function configureAsset(address asset, uint256 initialPriceUSD) external onlyOwner {
        require(asset != address(0), "Invalid asset");
        require(initialPriceUSD > 0, "Price must be > 0");

        uint8 decimals_ = IERC20Metadata(asset).decimals();
        if (!supportedAssets[asset].isSupported) {
            assetList.push(asset);
        }

        supportedAssets[asset] = MajorAssetConfig({
            isSupported: true,
            decimals: decimals_,
            priceUSD: initialPriceUSD
        });

        emit AssetConfigured(asset, decimals_, initialPriceUSD);
    }

    function setPrice(address asset, uint256 newPriceUSD) external onlyOwner {
        require(supportedAssets[asset].isSupported, "Not supported");
        require(newPriceUSD > 0, "Price must be > 0");
        supportedAssets[asset].priceUSD = newPriceUSD;
        emit PriceUpdated(asset, newPriceUSD);
    }

    function deposit(address asset, uint256 amount) external returns (uint256 sharesMinted) {
        MajorAssetConfig memory config = supportedAssets[asset];
        require(config.isSupported, "Unsupported asset");
        require(amount > 0, "Amount must be > 0");

        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate USD value: (amount * priceUSD) / (10 ** assetDecimals)
        uint256 usdValue = (amount * config.priceUSD) / (10 ** config.decimals);
        require(usdValue > 0, "Value too low");

        // Convert to base asset decimals if needed
        uint8 baseDec = IERC20Metadata(address(baseAsset)).decimals();
        uint256 baseAmount = usdValue;
        if (baseDec < 18) {
            baseAmount = usdValue / (10 ** (18 - baseDec));
        }

        baseAsset.approve(address(yieldVault), baseAmount);
        sharesMinted = yieldVault.deposit(baseAmount, msg.sender);

        emit Deposited(msg.sender, asset, amount, sharesMinted);
    }

    function withdraw(address asset, uint256 shares) external returns (uint256 assetAmount) {
        MajorAssetConfig memory config = supportedAssets[asset];
        require(config.isSupported, "Unsupported asset");
        require(shares > 0, "Shares must be > 0");

        // Redeem from vUSD
        uint256 baseReceived = yieldVault.redeem(shares, address(this), msg.sender);

        // Convert base USD received into asset amount
        uint8 baseDec = IERC20Metadata(address(baseAsset)).decimals();
        uint256 usd18 = baseReceived;
        if (baseDec < 18) {
            usd18 = baseReceived * (10 ** (18 - baseDec));
        }

        assetAmount = (usd18 * (10 ** config.decimals)) / config.priceUSD;
        require(IERC20(asset).balanceOf(address(this)) >= assetAmount, "Insufficient liquidity");

        IERC20(asset).safeTransfer(msg.sender, assetAmount);

        emit Withdrawn(msg.sender, asset, assetAmount, shares);
    }

    function getSupportedAssets() external view returns (address[] memory) {
        return assetList;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20, ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MolToken.sol";

/**
 * @title EarnVault
 * @notice Layer 2 Boosted Yield Strategy implemented as a nested ERC-4626 Vault.
 * Underlying asset: vUSD (Layer 1 ERC-4626 yield token).
 * Shares: stvUSD (share-appreciating, wstETH-style: balance is constant and
 * each share redeems for more vUSD over time).
 * In addition to underlying vUSD yield, depositors earn continuous streaming 1MOL reward tokens.
 */
contract EarnVault is ERC4626, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    MolToken public immutable rewardToken; // 1MOL

    uint256 public periodFinish;
    uint256 public rewardRate; // rewards per second
    uint256 public rewardsDuration = 30 days;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward);
    event RewardsDurationUpdated(uint256 newDuration);

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    constructor(IERC20 _vUsdStakingToken, address _rewardToken)
        ERC4626(_vUsdStakingToken)
        ERC20("1mol Staked Yield USD", "stvUSD")
        Ownable(msg.sender)
    {
        require(_rewardToken != address(0), "Invalid reward token");
        rewardToken = MolToken(_rewardToken);
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        uint256 total = totalSupply();
        if (total == 0) {
            return rewardPerTokenStored;
        }
        return
            rewardPerTokenStored +
            (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / total);
    }

    function earned(address account) public view returns (uint256) {
        return
            ((balanceOf(account) * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18) +
            rewards[account];
    }

    // Hook into ERC-4626 internal transfers/deposits/withdrawals to update user rewards
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) {
            rewards[from] = earned(from);
            userRewardPerTokenPaid[from] = rewardPerTokenStored;
        }
        if (to != address(0)) {
            rewards[to] = earned(to);
            userRewardPerTokenPaid[to] = rewardPerTokenStored;
        }
        super._update(from, to, value);
    }

    /**
     * @notice Claim accrued 1MOL rewards
     */
    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward > 0) {
            rewards[msg.sender] = 0;
            rewardToken.mint(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /**
     * @notice Unstake and claim rewards in a single step
     */
    function exit() external {
        redeem(balanceOf(msg.sender), msg.sender, msg.sender);
        getReward();
    }

    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / rewardsDuration;
        }

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardAdded(reward);
    }

    function setRewardsDuration(uint256 _rewardsDuration) external onlyOwner {
        require(block.timestamp > periodFinish, "Previous reward period not finished");
        rewardsDuration = _rewardsDuration;
        emit RewardsDurationUpdated(_rewardsDuration);
    }
}

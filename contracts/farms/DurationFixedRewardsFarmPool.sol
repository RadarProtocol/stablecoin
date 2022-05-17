/*
 Copyright (c) 2022 Radar Global

 Permission is hereby granted, free of charge, to any person obtaining a copy of
 this software and associated documentation files (the "Software"), to deal in
 the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract DurationFixedRewardsFarmPool {
    using Address for address;
    using SafeERC20 for IERC20;

    uint256 public duration;
    address public rewardToken;
    address public depositToken;

    uint256 public finishTimestamp = 0;
    uint256 public rewardRate = 0;
    uint256 public lastUpdateTimestamp;
    uint256 public cacheRewardPerToken;
    mapping(address => uint256) public userReward;
    mapping(address => uint256) public rewards;

    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;

    address private owner;

    event RewardAdded(uint256 rewardAmount);
    event Staked(address indexed who, uint256 amount);
    event Withdraw(address indexed who, uint256 amount);
    event GotReward(address indexed who, uint256 rewardAmount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    modifier updateReward(address account) {
        cacheRewardPerToken = rewardPerToken();
        lastUpdateTimestamp = lastTimeRewardApplicable();
        if(account != address(0)) {
            rewards[account] = earned(account);
            userReward[account] = cacheRewardPerToken;
        }
        _;
    }

    constructor(
        address _rewardToken,
        address _depositToken,
        uint256 _stakingDurationRewardPay
    ) {
        rewardToken = _rewardToken;
        depositToken = _depositToken;
        duration = _stakingDurationRewardPay;

        owner = msg.sender;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        owner = _newOwner;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        if (block.timestamp <= finishTimestamp) {
            return block.timestamp;
        } else {
            return finishTimestamp;
        }
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply() == 0) {
            return cacheRewardPerToken;
        }
        return
            cacheRewardPerToken + ((lastTimeRewardApplicable() - lastUpdateTimestamp) * rewardRate * 1e18 / totalSupply());
    }

    function earned(address account) public view returns (uint256) {
        return (balanceOf(account) * (rewardPerToken() - userReward[account]) / 1e18) + rewards[account];
    }

    function stake(uint256 amount, address target) external updateReward(target) {
        require(amount > 0, "Amount cannot be 0");
        require(target != address(0), "Staking to 0x0");
        IERC20(depositToken).safeTransferFrom(msg.sender, address(this), amount);
        _totalSupply = _totalSupply + amount;
        _balances[target] = _balances[target] + amount;
        emit Staked(target, amount);
    }

    function withdraw(uint256 amount) public updateReward(msg.sender) {
        require(amount > 0, "Amount cannot be 0");
        require(_balances[msg.sender] >= amount, "Withdraw overflow");
        _totalSupply = _totalSupply - amount;
        _balances[msg.sender] = _balances[msg.sender] - amount;
        IERC20(depositToken).safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    function exit() external {
        withdraw(balanceOf(msg.sender));
        getReward();
    }

    function getReward() public updateReward(msg.sender) {
        uint256 reward = earned(msg.sender);
        if (address(depositToken) == address(rewardToken)) {
            uint256 _tokenBal = IERC20(depositToken).balanceOf(address(this));
            require(_tokenBal - reward >= _totalSupply, "Extra security check failed.");
        }
        if (reward > 0) {
            rewards[msg.sender] = 0;
            IERC20(rewardToken).safeTransfer(msg.sender, reward);
            emit GotReward(msg.sender, reward);
        }
    }

    function pushReward(address recipient) external updateReward(recipient) onlyOwner {
        uint256 reward = earned(recipient);
        if (reward > 0) {
            rewards[recipient] = 0;
            IERC20(rewardToken).safeTransfer(recipient, reward);
            emit GotReward(recipient, reward);
        }
    }

    function addedReward(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= finishTimestamp) {
            rewardRate = reward / duration;
        } else {
            uint256 remaining = finishTimestamp - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (reward + leftover) / duration;
        }
        lastUpdateTimestamp = block.timestamp;
        finishTimestamp = block.timestamp + duration;
        emit RewardAdded(reward);
    }
}
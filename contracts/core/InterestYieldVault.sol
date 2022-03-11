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
// SPDX-License-Indeitifer: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/IStrategy.sol";

contract YieldVault {
    using SafeERC20 for IERC20;

    // Share balances (for each token)
    mapping(address => mapping(address => uint256)) private balances;
    // Total share supply for each token
    mapping(address => uint256) private totalShareSupply;

    // Token to yield strategy
    mapping(address => address) private strategies;

    address private owner;
    address private pendingOwner;

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event StrategyAdded(address indexed token, address indexed strategy);
    event StrategyRemoved(address indexed token);

    event ShareTransfer(address indexed token, address indexed from, address indexed to, uint256 amount);

    modifier onlyOwner {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    constructor() {
        owner = msg.sender;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // Owner Functions

    function transferOwnership(address _newOwner) external onlyOwner {
        pendingOwner = _newOwner;
    }

    function claimOwnership() external {
        require(msg.sender == pendingOwner, "Unauthorized");

        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function addStrategy(address _token, address _strategy) external onlyOwner {
        strategies[_token] = _strategy;
        emit StrategyAdded(_token, _strategy);
    }

    function removeStrategy(address _token) external onlyOwner {
        strategies[_token] = address(0);
        emit StrategyRemoved(_token);
    }

    function emptyStrategy(address _token) external onlyOwner {
        // Withdraw all funds from strategy (optional before strategy removal)
        address _strategy = strategies[_token];
        IStrategy(_strategy).exit();
    }

    // User functions

    function transferShares(address _token, address _to, uint256 _amount) external {
        require(balances[_token][msg.sender] >= _amount, "Not enough shares");

        balances[_token][msg.sender] = balances[_token][msg.sender] - _amount;
        balances[_token][_to] = balances[_token][_to] + _amount;

        emit ShareTransfer(_token, msg.sender, _to, _amount);
    }

    // Bot functions (Gelato)

    // Internal Functions

    function _tokenTotalBalance(address _token) internal view returns (uint256) {
        address _strategy = strategies[_token];
        uint256 _strategyBal = _strategy == address(0) ? 0 : IStrategy(_strategy).invested(_token);
        return IERC20(_token).balanceOf(address(this)) + _strategyBal;
    }

    // State Getters

    function balanceOf(address _token, address _owner) external view returns (uint256) {
        return balances[_token][_owner];
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    function getTotalShareSupply(address _token) external view returns (uint256) {
        return totalShareSupply[_token];
    }
}
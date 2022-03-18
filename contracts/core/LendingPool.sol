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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/ILickHitter.sol";
import "./../interfaces/ILendingPair.sol";
import "./../interfaces/ITheStableMoney.sol";

contract LendingPair {
    using SafeERC20 for IERC20;

    bool public initialized = false;

    address private owner;
    address private pendingOwner;

    address private collateral;
    address private lendAsset;

    address private yieldVault;

    uint256 public ENTRY_FEE;
    uint256 public EXIT_FEE;
    uint256 public constant GENERAL_DIVISOR = 10000;
    address public FEE_RECEIVER;

    uint256 public MAX_LTV;

    modifier onlyOwner {
        address impl;
        address _ownerAddr;
        assembly {
            impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        if (impl == address(0)) {
            // Means this is not a proxy, and it's the implementation contract
            _ownerAddr = owner;
        } else {
            // This is a proxy, get owner of the implementation contract
            _ownerAddr = ILendingPair(impl).getOwner();
        }
        require(msg.sender == _ownerAddr, "Unauthorized");
        _;
    }

    modifier onlyNotProxy {
        address impl;
        assembly {
            impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        require(impl == address(0), "Cannot call this on proxy");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function init(
        address _collateral,
        address _lendAsset,
        uint256 _entryFee,
        uint256 _exitFee,
        address _yieldVault,
        address _feeReceiver,
        uint256 _maxLTV
    ) external {
        require(!initialized, "Already initialized");
        initialized = true;

        // Don't allow on non-proxy contract
        address impl;
        assembly {
            impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        require(impl != address(0), "Initializing master contract");

        collateral = _collateral;
        lendAsset = _lendAsset;
        ENTRY_FEE = _entryFee;
        EXIT_FEE = _exitFee;
        yieldVault = _yieldVault;
        FEE_RECEIVER = _feeReceiver;
        MAX_LTV = _maxLTV;
    }

    // Owner functions

    function transferOwnership(address _newOwner) external onlyOwner onlyNotProxy {
        pendingOwner = _newOwner;
    }

    function claimOwnership() external onlyNotProxy {
        require(msg.sender == pendingOwner, "Unauthorized");

        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function changeFeeReceiver(address _newReceiver) external onlyOwner {
        FEE_RECEIVER = _newReceiver;
    }

    function burnStablecoin(uint256 _amount) external onlyOwner {
        uint256 _sharesAmount = ILickHitter(yieldVault).convertShares(lendAsset, 0, _amount);
        ILickHitter(yieldVault).withdraw(lendAsset, address(this), _sharesAmount);
        ITheStableMoney(lendAsset).burn(_amount);
    }

    // Gives owner power to liquidate everyone (by setting a low MAX_LTV),
    // but the owner will be a trusted multisig
    function changeMaxLtv(uint256 _newMax) external onlyOwner {
        MAX_LTV = _newMax;
    }

    // User functions

    // Internal functions

    // State Getters

    function getOwner() external view returns (address) {
        return owner;
    }

    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    function getCollateral() external view returns (address) {
        return collateral;
    }

    function getLendAsset() external view returns (address) {
        return lendAsset;
    }
}
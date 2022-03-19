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
import "./../interfaces/IOracle.sol";

contract LendingPair {
    using SafeERC20 for IERC20;

    bool public initialized = false;

    address private owner;
    address private pendingOwner;

    address private collateral;
    uint8 private collateralDecimals;
    address private lendAsset;

    address private yieldVault;
    address private oracle;

    uint256 private exchangeRate;
    uint256 private exchangeRateLastUpdate;

    uint256 public ENTRY_FEE;
    uint256 public EXIT_FEE;
    uint256 public constant GENERAL_DIVISOR = 10000;
    address public FEE_RECEIVER;
    uint256 public accumulatedFees;

    uint256 public MAX_LTV;

    mapping(address => uint256) private shareBalances;
    mapping(address => uint256) private borrows;
    uint256 private totalShares;
    uint256 private totalBorrowed;

    event CollateralAdded(address indexed owner, uint256 amount, uint256 shares);
    event CollateralRemoved(address indexed owner, uint256 amount, uint256 shares);
    event FeesClaimed(uint256 amount, uint256 shares);
    event AssetBorrowed(address indexed owner, uint256 borrowAmount, address indexed receiver);
    event LoanRepaid(address indexed owner, uint256 repayAmount, address indexed receiver);

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
        uint256 _maxLTV,
        address _oracle
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
        collateralDecimals = IERC20Metadata(collateral).decimals();
        lendAsset = _lendAsset;
        ENTRY_FEE = _entryFee;
        EXIT_FEE = _exitFee;
        yieldVault = _yieldVault;
        FEE_RECEIVER = _feeReceiver;
        MAX_LTV = _maxLTV;
        oracle = _oracle;
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

    function changeOracle(address _newOracle) external onlyOwner {
        oracle = _newOracle;
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

    function changeFees(uint256 _entryFee, uint256 _exitFee) external onlyOwner {
        ENTRY_FEE = _entryFee;
        EXIT_FEE = _exitFee;
    }

    // User functions

    function claimFees() external {
        require(accumulatedFees > 0, "No fees accumulated");
        uint256 _sharesValue = ILickHitter(yieldVault).convertShares(lendAsset, 0, accumulatedFees);
        ILickHitter(yieldVault).withdraw(lendAsset, FEE_RECEIVER, _sharesValue);
        emit FeesClaimed(accumulatedFees, _sharesValue);
        accumulatedFees = 0;
    }

    // Internal functions

    // Use this function to only fetch exchange rate 1 time / TX and save gas
    function _getExchangeRate() internal returns (uint256) {
        if (block.number > exchangeRateLastUpdate) {
            exchangeRate = IOracle(oracle).getUSDPrice(collateral);
            exchangeRateLastUpdate = block.number;
        }

        return exchangeRate;
    }

    // Returns true if user is safe and doesn't need to be liquidated
    function _userSafe(address _user) internal returns (bool) {
        uint256 _rate = _getExchangeRate();
        uint256 _borrowed = borrows[_user];
        uint256 _collateral = _userCollateral(_user);
        if (_borrowed == 0) {
            return true;
        }
        if (_collateral == 0) {
            return false;
        }

        // TODO: TEST THIS IS CORRECT
        uint256 _collateralValue = (_collateral * _rate) / (10**collateralDecimals);
        // Price has 18 decimals and stablecoin has 18 decimals
        return ((_collateralValue * MAX_LTV) / GENERAL_DIVISOR) >= _borrowed;
    }

    function _deposit(uint256 _amount) internal {
        IERC20(collateral).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(collateral).safeApprove(yieldVault, _amount);
        uint256 _sharesMinted = ILickHitter(yieldVault).deposit(collateral, address(this), _amount);
        shareBalances[msg.sender] = shareBalances[msg.sender] + _sharesMinted;
        totalShares = totalShares + _sharesMinted;
        emit CollateralAdded(msg.sender, _amount, _sharesMinted);
    }

    function _withdraw(uint256 _amount) internal {
        uint256 _shares = ILickHitter(yieldVault).convertShares(collateral, 0, _amount);
        require(shareBalances[msg.sender] >= _shares, "Insufficient funds");
        // TODO: Maybe make more gas efficient
        unchecked {
            shareBalances[msg.sender] = shareBalances[msg.sender] - _shares;   
        }
        totalShares = totalShares - _shares;
        ILickHitter(yieldVault).withdraw(collateral, msg.sender, _shares);
        emit CollateralRemoved(msg.sender, _amount, _shares);
        // TODO: AFTER CALLING THIS, CHECK USER IS SAFE
    }

    function _borrow(address _receiver, uint256 _amount) internal {
        uint256 _fee = (_amount * ENTRY_FEE) / GENERAL_DIVISOR;
        accumulatedFees = accumulatedFees + _fee;
        uint256 _borrowAmount = _amount + _fee;

        borrows[msg.sender] = borrows[msg.sender] + _borrowAmount;
        totalBorrowed = totalBorrowed + _borrowAmount;

        uint256 _sharesWithdraw = ILickHitter(yieldVault).convertShares(lendAsset, 0, _amount);
        ILickHitter(yieldVault).withdraw(lendAsset, _receiver, _sharesWithdraw);

        emit AssetBorrowed(msg.sender, _borrowAmount, _receiver);

        // TODO: AFTER CALLING THIS, CHECK USER IS SAFE
    }

    function _repay(address _receiver, uint256 _amount) internal {
        uint256 _fee = (_amount * EXIT_FEE) / GENERAL_DIVISOR;
        accumulatedFees = accumulatedFees + _fee;
        uint256 _repayAmount = _amount - _fee;

        IERC20(lendAsset).safeTransferFrom(msg.sender, address(this), _amount);
        IERC20(lendAsset).safeApprove(yieldVault, _amount);
        ILickHitter(yieldVault).deposit(lendAsset, address(this), _amount);

        borrows[_receiver] = borrows[_receiver] - _repayAmount;
        totalBorrowed = totalBorrowed - _repayAmount;

        emit LoanRepaid(msg.sender, _repayAmount, _receiver);
    }

    function _userCollateral(address _user) internal view returns (uint256) {
        return ILickHitter(yieldVault).convertShares(collateral, shareBalances[_user], 0);
    }

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

    function getOracle() external view returns (address) {
        return oracle;
    }

    function getCollateralBalance(address _user) external view returns (uint256) {
        return _userCollateral(_user);
    }

    function getUserBorrow(address _user) external view returns (uint256) {
        return borrows[_user];
    }

    function getTotalCollateralDeposited() external view returns (uint256) {
        return ILickHitter(yieldVault).convertShares(collateral, totalShares, 0);
    }

    function getTotalBorrowed() external view returns (uint256) {
        return totalBorrowed;
    }

    function unclaimedFees() external view returns (uint256) {
        return ILickHitter(yieldVault).convertShares(lendAsset, 0, accumulatedFees);
    }

}
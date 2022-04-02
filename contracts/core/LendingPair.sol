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
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./../interfaces/ILickHitter.sol";
import "./../interfaces/ILendingPair.sol";
import "./../interfaces/IRadarUSD.sol";
import "./../interfaces/IOracle.sol";
import "./../interfaces/ILiquidator.sol";
import "./../interfaces/ISwapper.sol";

contract LendingPair is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bool public initialized = false;

    address private owner;
    address private pendingOwner;

    address private collateral;
    uint8 private collateralDecimals;
    address private lendAsset;

    address private yieldVault;
    address private oracle;
    address private swapper;

    uint256 private exchangeRate;

    uint256 public ENTRY_FEE;
    uint256 public EXIT_FEE;
    uint256 public LIQUIDATION_INCENTIVE;
    uint256 public RADAR_LIQUIDATION_FEE;
    uint256 public constant GENERAL_DIVISOR = 10000;
    address public FEE_RECEIVER;
    uint256 private accumulatedFees;

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
    event Liquidated(address indexed user, address indexed liquidator, uint256 repayAmount, uint256 collateralLiquidated);

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

    modifier updateExchangeRate {
        exchangeRate = IOracle(oracle).getUSDPrice(collateral);
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
        uint256 _liquidationIncentive,
        uint256 _radarLiqFee,
        address _yieldVault,
        address _feeReceiver,
        uint256 _maxLTV,
        address _oracle,
        address _swapper
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
        LIQUIDATION_INCENTIVE = _liquidationIncentive;
        RADAR_LIQUIDATION_FEE = _radarLiqFee;
        yieldVault = _yieldVault;
        FEE_RECEIVER = _feeReceiver;
        MAX_LTV = _maxLTV;
        oracle = _oracle;
        swapper = _swapper;
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
        IRadarUSD(lendAsset).burn(_amount);
    }

    // Gives owner power to liquidate everyone (by setting a low MAX_LTV),
    // but the owner will be a trusted multisig
    function changeMaxLtv(uint256 _newMax) external onlyOwner {
        MAX_LTV = _newMax;
    }

    function changeFees(uint256 _entryFee, uint256 _exitFee, uint256 _liquidationIncentive, uint256 _radarLiqFee) external onlyOwner {
        ENTRY_FEE = _entryFee;
        EXIT_FEE = _exitFee;
        LIQUIDATION_INCENTIVE = _liquidationIncentive;
        RADAR_LIQUIDATION_FEE = _radarLiqFee;
    }

    function changeSwapper(address _newSwapper) external onlyOwner {
        swapper = _newSwapper;
    }

    // User functions

    function claimFees() external {
        require(accumulatedFees > 0, "No fees accumulated");
        uint256 _sharesValue = ILickHitter(yieldVault).convertShares(lendAsset, 0, accumulatedFees);
        ILickHitter(yieldVault).withdraw(lendAsset, FEE_RECEIVER, _sharesValue);
        emit FeesClaimed(accumulatedFees, _sharesValue);
        accumulatedFees = 0;
    }

    function deposit(uint256 _amount) external {
        _deposit(_amount);
    }

    function withdraw(uint256 _amount, address _receiver) updateExchangeRate external {
        _withdraw(_amount, _receiver);
        require(_userSafe(msg.sender), "User not safe");
    }

    function borrow(address _receivingAddress, uint256 _amount) updateExchangeRate external {
        _borrow(_receivingAddress, _amount);
        require(_userSafe(msg.sender), "User not safe");
    }

    function repay(address _repaymentReceiver, uint256 _amount) external {
        _repay(_repaymentReceiver, _amount);
    }

    function depositAndBorrow(
        uint256 _depositAmount,
        uint256 _borrowAmount,
        address _receivingAddress
    ) external updateExchangeRate {
        _deposit(_depositAmount);
        _borrow(_receivingAddress, _borrowAmount);
        require(_userSafe(msg.sender), "User not safe");
    }

    function repayAndWithdraw(
        uint256 _repayAmount,
        address _repaymentReceiver,
        uint256 _withdrawAmount,
        address _withdrawReceiver
    ) external updateExchangeRate {
        _repay(_repaymentReceiver, _repayAmount);
        _withdraw(_withdrawAmount, _withdrawReceiver);
        require(_userSafe(msg.sender), "User not safe");
    }

    function hookedDepositAndBorrow(
        uint256 _depositAmount,
        uint256 _borrowAmount,
        bytes calldata _swapData
    ) external updateExchangeRate {
        uint256 _before = ILickHitter(yieldVault).balanceOf(collateral, address(this));
        // 1. Borrow and send direct deposit
        _borrow(swapper, _borrowAmount);
        IERC20(collateral).safeTransferFrom(msg.sender, swapper, _depositAmount);

        // 2. Swap for collateral
        ISwapper(swapper).depositHook(
            collateral,
            _swapData
        );

        // 3. Deposit collateral (use before/after calculation)
        uint256 _after = ILickHitter(yieldVault).balanceOf(collateral, address(this));
        uint256 _userDeposit = _after - _before;
        require(_userDeposit > 0, "Invalid deposit");

        uint256 _collateralDeposited = ILickHitter(yieldVault).convertShares(collateral, _userDeposit, 0);

        shareBalances[msg.sender] = shareBalances[msg.sender] + _userDeposit;
        totalShares = totalShares + _userDeposit;
        emit CollateralAdded(msg.sender, _collateralDeposited, _userDeposit);

        require(_userSafe(msg.sender), "User not safe");
    }

    function hookedRepayAndWithdraw(
        uint256 _directRepayAmount,
        uint256 _withdrawAmount,
        bytes calldata _swapData
    ) external updateExchangeRate {
        // 1. Withdraw and send direct repay
        if (_directRepayAmount != 0) {
            IERC20(lendAsset).safeTransferFrom(msg.sender, swapper, _directRepayAmount);
        }

        uint256 _before = ILickHitter(yieldVault).balanceOf(lendAsset, address(this));
        _withdraw(_withdrawAmount, swapper);

        // 2. Swap for lendAsset
        ISwapper(swapper).repayHook(
            collateral,
            _swapData
        );

        // 3. Repay loan (use before/after calculation)
        uint256 _after = ILickHitter(yieldVault).balanceOf(lendAsset, address(this));
        uint256 _repayAmount = ILickHitter(yieldVault).convertShares(lendAsset, (_after - _before), 0);
        require( _repayAmount > 0, "Repay 0");

        uint256 _maxRepay = borrows[msg.sender] + ((borrows[msg.sender] * EXIT_FEE) / GENERAL_DIVISOR);
        
        uint256 _userRepayAmount;
        uint256 _fee;
        if (_repayAmount > _maxRepay) {
            // Dust will be left, beucase we are
            // trying to repay more than the
            // actual loan itself (+ exit fee), so we will
            // be sending the leftover borrowed
            // assets to the user's LickHitter
            // account
            _fee = (borrows[msg.sender] * EXIT_FEE) / GENERAL_DIVISOR;
            uint256 _dustLeft = _repayAmount - _maxRepay;
            _userRepayAmount = borrows[msg.sender];
            totalBorrowed = totalBorrowed - _userRepayAmount;
            borrows[msg.sender] = 0;

            // Convert to shares and send
            _dustLeft = ILickHitter(yieldVault).convertShares(lendAsset, 0, _dustLeft);
            ILickHitter(yieldVault).transferShares(lendAsset, msg.sender, _dustLeft);
        } else {
            _fee = (_repayAmount * EXIT_FEE) / GENERAL_DIVISOR;
            _userRepayAmount = _repayAmount - _fee;
            totalBorrowed = totalBorrowed - _userRepayAmount;
            borrows[msg.sender] = borrows[msg.sender] - _userRepayAmount;
        }
        accumulatedFees = accumulatedFees + _fee;
        emit LoanRepaid(msg.sender, _userRepayAmount, msg.sender);

        require(_userSafe(msg.sender), "User not safe");
    }


    // Not-reentrant for extra safety
    // The `_liquidator` must implement the
    // ILiquidator interface
    // _repayAmounts in USDR
    function liquidate(
        address[] calldata _users,
        uint256[] calldata _repayAmounts,
        address _liquidator
    ) external updateExchangeRate nonReentrant {
        require(_users.length == _repayAmounts.length, "Invalid data");

        uint256 _totalCollateralLiquidated;
        uint256 _totalRepayRequired;

        for(uint256 i = 0; i < _users.length; i++) {
            address _user = _users[i];
            if(!_userSafe(_user)) {
                uint256 _repayAmount = borrows[_user] < _repayAmounts[i] ? borrows[_user] : _repayAmounts[i];
                totalBorrowed = totalBorrowed - _repayAmount;
                borrows[_user] = borrows[_user] - _repayAmount;
                
                // Collateral removed is collateral of _repayAmount value + liquidation/finder fee
                // Calculate total collateral to be removed in stablecoin
                uint256 _collateralRemoved = (_repayAmount + ((LIQUIDATION_INCENTIVE * _repayAmount) / GENERAL_DIVISOR));
                // Convert to actual collateral
                _collateralRemoved = (_collateralRemoved * 10**collateralDecimals) / exchangeRate;
                uint256 _collateralShares = ILickHitter(yieldVault).convertShares(collateral, 0, _collateralRemoved);
                if (shareBalances[_user] >= _collateralShares) {
                    shareBalances[_user] = shareBalances[_user] - _collateralShares;
                    totalShares = totalShares - _collateralShares;
                } else {
                    // In this case, the liquidation will most likely not be profitable
                    // But this condition is kept to re-pegg the token in extreme
                    // collateral value drop situations
                    _collateralRemoved = ILickHitter(yieldVault).convertShares(collateral, shareBalances[_user], 0);
                    totalShares = totalShares - shareBalances[_user];
                    shareBalances[_user] = 0;
                }

                _totalCollateralLiquidated = _totalCollateralLiquidated + _collateralRemoved;
                _totalRepayRequired = _totalRepayRequired + _repayAmount;

                emit Liquidated(
                    _user,
                    msg.sender,
                    _repayAmount,
                    _collateralRemoved
                );
            }
        }
        require(_totalCollateralLiquidated > 0 && _totalRepayRequired > 0, "Liquidate none");
        uint256 _radarFee = (_totalRepayRequired * LIQUIDATION_INCENTIVE * RADAR_LIQUIDATION_FEE) / (GENERAL_DIVISOR ** 2);
        accumulatedFees = accumulatedFees + _radarFee;
        _totalRepayRequired = _totalRepayRequired + _radarFee;

        // Send liquidator his collateral
        uint256 _collShares = ILickHitter(yieldVault).convertShares(collateral, 0, _totalCollateralLiquidated);
        ILickHitter(yieldVault).withdraw(collateral, _liquidator, _collShares);

        // Perform Liquidation
        ILiquidator(_liquidator).liquidateHook(
            collateral,
            msg.sender,
            _totalRepayRequired,
            _totalCollateralLiquidated
        );

        // Get the stablecoin and deposit to vault
        IERC20(lendAsset).safeTransferFrom(_liquidator, address(this), _totalRepayRequired);
        IERC20(lendAsset).safeApprove(yieldVault, _totalRepayRequired);
        ILickHitter(yieldVault).deposit(lendAsset, address(this), _totalRepayRequired);
        
    }

    // Internal functions

    // Returns true if user is safe and doesn't need to be liquidated
    function _userSafe(address _user) internal view returns (bool) {
        uint256 _borrowed = borrows[_user];
        uint256 _collateral = _userCollateral(_user);
        if (_borrowed == 0) {
            return true;
        }
        if (_collateral == 0) {
            return false;
        }

        uint256 _collateralValue = (_collateral * exchangeRate) / (10**collateralDecimals);
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

    function _withdraw(uint256 _amount, address _receiver) internal {
        uint256 _shares = ILickHitter(yieldVault).convertShares(collateral, 0, _amount);
        require(shareBalances[msg.sender] >= _shares, "Insufficient funds");
        // TODO: Maybe make more gas efficient
        unchecked {
            shareBalances[msg.sender] = shareBalances[msg.sender] - _shares;   
        }
        totalShares = totalShares - _shares;
        ILickHitter(yieldVault).withdraw(collateral, _receiver, _shares);
        emit CollateralRemoved(msg.sender, _amount, _shares);
    }

    function _borrow(address _receiver, uint256 _amount) internal {
        uint256 _fee = (_amount * ENTRY_FEE) / GENERAL_DIVISOR;
        accumulatedFees = accumulatedFees + _fee;
        uint256 _borrowAmount = _amount + _fee;

        require(_borrowAmount <= _availableToBorrow(), "Not enough coins");

        borrows[msg.sender] = borrows[msg.sender] + _borrowAmount;
        totalBorrowed = totalBorrowed + _borrowAmount;

        uint256 _sharesWithdraw = ILickHitter(yieldVault).convertShares(lendAsset, 0, _amount);
        ILickHitter(yieldVault).withdraw(lendAsset, _receiver, _sharesWithdraw);

        emit AssetBorrowed(msg.sender, _borrowAmount, _receiver);
    }

    // You will have to pay a little more than `_amount` because of the exit fee
    function _repay(address _receiver, uint256 _amount) internal {
        uint256 _fee = (_amount * EXIT_FEE) / GENERAL_DIVISOR;
        accumulatedFees = accumulatedFees + _fee;
        uint256 _repayAmount = _amount + _fee;

        IERC20(lendAsset).safeTransferFrom(msg.sender, address(this), _repayAmount);
        IERC20(lendAsset).safeApprove(yieldVault, _repayAmount);
        ILickHitter(yieldVault).deposit(lendAsset, address(this), _repayAmount);

        borrows[_receiver] = borrows[_receiver] - _amount;
        totalBorrowed = totalBorrowed - _amount;

        emit LoanRepaid(msg.sender, _amount, _receiver);
    }

    function _userCollateral(address _user) internal view returns (uint256) {
        return ILickHitter(yieldVault).convertShares(collateral, shareBalances[_user], 0);
    }

    function _availableToBorrow() internal view returns (uint256) {
        uint256 _myShares = ILickHitter(yieldVault).balanceOf(lendAsset, address(this));
        return ILickHitter(yieldVault).convertShares(lendAsset, _myShares, 0) - accumulatedFees;
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

    function getSwapper() external view returns (address) {
        return swapper;
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

    function availableToBorrow() external view returns (uint256) {
        return _availableToBorrow();
    }

}
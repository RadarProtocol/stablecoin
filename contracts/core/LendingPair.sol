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

/// @title LendingPair
/// @author Tudor Gheorghiu (tudor@radar.global)
/// @notice Single collateral asset lending pair, used for
/// USDR (stablecoin) lending
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

    /// @notice Manages access control. Only allows master (non-proxy) contract owner to call specific functions.
    /// @dev If the EIP-1967 storage address is empty, then this is the non-proxy contract
    /// and fetches the owner address from the storage variable. If it is not empty, it will
    /// fetch the owner address from the non-proxy contract
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

    /// @notice These functions can only be called on the non-proxy contract
    /// @dev Just fetches the EIP-1967 storage address and checks it is empty
    modifier onlyNotProxy {
        address impl;
        assembly {
            impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
        }
        require(impl == address(0), "Cannot call this on proxy");
        _;
    }

    /// @notice Updates `exchangeRate` variable from the oracle
    /// @dev This modifier is applied to functions which need an updated
    /// exchange rate to ensure the calculations are safe. This includes
    /// any function that will check if a user is or is not 'safe' a.k.a flagged
    /// for loan liquidation. The liquidation functions also implements this modifier.
    /// This is made as a modifier so no extra oracle calls (which are expensive) are made
    /// per transaction.
    modifier updateExchangeRate {
        exchangeRate = IOracle(oracle).getUSDPrice(collateral);
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Proxy initialization function
    /// @param _collateral The ERC20 address of the collateral used for lending
    /// @param _lendAsset The ERC20 address of the asset which will be lended (USDR)
    /// @param _entryFee The entry fee percentage when borrowing assets (times GENERAL_DIVISOR)
    /// @param _exitFee The exit fee percentage when repaying loans (times GENERAL_DIVISOR)
    /// @param _liquidationIncentive The percentage of liquidated collateral which will be added on top of the
    /// total liquidated collateral that is released, as an incentive/reward for the liquidator
    /// @param _radarLiqFee The percentage of the earned liquidation incentive (see `_liquidationIncentive`)
    /// that the liquidator must pay over the flat repayAmount, as a fee. This splits x% of the
    /// liquidator reward to the Radar ecosystem.
    /// @param _yieldVault The address of the yield farming vault, which is the `LickHitter` farming contract
    /// @param _feeReceiver The address which will receive accumulated fees
    /// @param _maxLTV The maximum Loan-To-Value (LTV) ratio a user can have before
    /// being flagged for liquidation (times GENERAL_DIVISOR)
    /// @param _oracle Price oracle which implements the `IOracle` interface
    /// @param _swapper Assets swapper which implements the `ISwapper` interface
    /// that will be used for hooked functions.
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

    /// @dev Be careful when calling this function, since it can "over-burn"
    /// from the stablecoin reserve and actually burn accumulated fees.
    function burnStablecoin(uint256 _amount) external onlyOwner {
        uint256 _sharesAmount = ILickHitter(yieldVault).convertShares(lendAsset, 0, _amount);
        ILickHitter(yieldVault).withdraw(lendAsset, address(this), _sharesAmount);
        IRadarUSD(lendAsset).burn(_amount);
    }

    /// @dev Gives owner power to liquidate everyone (by setting a low MAX_LTV),
    /// but the owner will be a trusted multisig
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

    /// @notice This will withdraw accumulated fees to the `FEE_RECEIVER` address
    /// @dev This doesn't require access control since `FEE_RECEIVER` is a set address,
    /// and there are no "arbitrage" opportunities by withdrawing fees.
    function claimFees() external {
        require(accumulatedFees > 0, "No fees accumulated");
        uint256 _sharesValue = ILickHitter(yieldVault).convertShares(lendAsset, 0, accumulatedFees);
        ILickHitter(yieldVault).withdraw(lendAsset, FEE_RECEIVER, _sharesValue);
        emit FeesClaimed(accumulatedFees, _sharesValue);
        accumulatedFees = 0;
    }

    /// @notice Deposit collateral. Just specify amount. Must have allowance for this contract (collateral)
    /// @param _amount Collateral amount (not `LickHitter` shares, direct collateral)
    function deposit(uint256 _amount) external {
        _deposit(_amount);
    }

    /// @notice Withdraw collateral.
    /// @dev Must update exchange rate to calculate if the user can do this
    /// without being flagged for liquidation, since he is withdrawing collateral.
    /// @param _amount Amount of collateral to withdraw
    /// @param _receiver Address where the collateral will be sent to.
    function withdraw(uint256 _amount, address _receiver) updateExchangeRate external {
        _withdraw(_amount, _receiver);
        require(_userSafe(msg.sender), "User not safe");
    }

    /// @notice Borrow assets (USDR)
    /// @dev Must update exchange rate to calculate if the user can do this
    /// without being flagged for liquidation, since he is borrowing assets.
    /// @param _receivingAddress Address where the borrowed assets will be sent to.
    /// @param _amount Amount (of USDR) to borrow.
    function borrow(address _receivingAddress, uint256 _amount) updateExchangeRate external {
        _borrow(_receivingAddress, _amount);
        require(_userSafe(msg.sender), "User not safe");
    }

    /// @notice Repay a part of or the full loan
    /// @dev Here we don't need to update the exchange rate, since
    /// the user is repaying collateral, making them "safer", and since
    /// we don't check if the user will be flagged for liquidation, we
    /// don't need to update the exchange rate to save gas costs.
    /// @param _repaymentReceiver The address to which the repayment is made: a user
    /// could repay the loan of another user.
    /// @param _amount Repay amount. Must have allowance for this contract (USDR)
    function repay(address _repaymentReceiver, uint256 _amount) external {
        _repay(_repaymentReceiver, _amount);
    }

    /// @notice Deposit collateral and borrow assets in a single transaction.
    /// @dev Just calls both the `_deposit` and `_borrow` internal functions. Must update
    /// exchange rate since a borrow operation takes place here and we must verify the user
    /// borrows an amount that will not flag him for liquidation.
    /// @param _depositAmount Amount of collateral to deposit, must have allowance.
    /// @param _borrowAmount Amount of assets (USDR) to borrow
    /// @param _receivingAddress Address where borrowed assets will be sent to.
    function depositAndBorrow(
        uint256 _depositAmount,
        uint256 _borrowAmount,
        address _receivingAddress
    ) external updateExchangeRate {
        _deposit(_depositAmount);
        _borrow(_receivingAddress, _borrowAmount);
        require(_userSafe(msg.sender), "User not safe");
    }

    /// @notice Repay a loan and withdraw collateral in a single transaction
    /// @dev Just calls both the `_repay` and `_withdraw` internal functions. Must update
    /// exchange rate since a withdraw operation takes place here and we must verify the user
    /// will not have too little collateral, a.k.a. being flagged for liquidation.
    /// @param _repayAmount Amount of assets (USDR) to repay, must have allowance.
    /// @param _repaymentReceiver What address receives the repayment.
    /// @param _withdrawAmount How much collateral to withdraw.
    /// @param _withdrawReceiver The address which will receive the collateral.
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

    /// @notice Deposits collateral, takes out a loan which is then swapped
    /// for the collateral and deposited again. This allows users to "borrow" collateral
    /// and receive a higher yield, while remaining "safe" (not flagged for liquidation)
    /// This also allows the user to "open a long position on the collateral",
    /// while also earning more yield than with just a simple deposit.
    /// @dev We update the exchange rate and check if the user is not flagged for liquidation
    /// at the end of the function. Since the amount of collateral received from the swap
    /// should not have to be calculated exactly, the function records its `LickHitter` share
    /// balances (of collateral) before and after the swap in order to record how much collateral the user gained.
    /// The initial deposit (`_depositAmount`) is also sent directly to the swapper in order to save gas costs, since
    /// the swapper will deposit that collateral to the `LickHitter` as well (the swapper
    /// will deposit all collateral balance to the `LickHitter` after the swap, including the
    /// initial deposit).
    /// The loan is sent directly to the swapper and then called to swap it for collateral.
    /// The swapper is a different contract for each `LendingPair` since collaterals will be
    /// different assets and there are different ways to swap them (more efficiently).
    /// @param _depositAmount How much collateral to deposit (initially). Must have allowance.
    /// @param _borrowAmount How much USDR to borrow that will be swapped to collateral.
    /// @param _swapData Data containing slippage, swap routes, etc. This is different for each
    /// swapper contract. It is the caller's responsability to check this `_swapData` will not
    /// partially fill an order, or leave any remaining USDR in the swapper,
    /// since those assets will be lost if not transffered during this transaction.
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

    /// @notice Uses collateral to repay an outstanding loan. This can be called by a user
    /// to reduce his LTV (and his risk), or he could also repay his entire loan using his collateral.
    /// If too much USDR is received from the swapped collateral to cover both the user's loan
    /// and the repayment fee, the rest will be transferred to the user's `LickHitter` account.
    /// @dev This function withdraws collateral from the user's account and transfers it to the
    /// swapper contract. The user can also send an optional direct USDR repayment which will also be
    /// transferred to the swapper contract. The swapper then swaps the user's collateral for
    /// USDR and deposits all its USDR balance to the LendingPair's `LickHitter` account (including
    /// the optional direct repayment amount). This function then calculates how many USDR shares
    /// were added to its balance and considers them a repayment for the user's loan. We also need
    /// to update the exchange rate and check if the user is safe at the end since a withdraw
    /// operation takes place.
    /// @param _directRepayAmount An optional amount of USDR that will be used for this loan
    /// repayment. If the user doesn't want to directly repay a part of his loan from his USDR balance,
    /// he will set this to 0. If it is not 0, the user must have USDR allowance towards this contract.
    /// @param _withdrawAmount How much collateral to withdraw that will be swapped and used for
    /// repaying the user's loan.
    /// @param _swapData Data containing slippage, swap routes, etc. This is different for each
    /// swapper contract. It is the caller's responsability to check this `_swapData` will not
    /// partially fill an order, or leave any remaining collateral assets in the swapper,
    /// since those assets will be lost if not transffered during this transaction.
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
            uint256 _dustLeft;
            unchecked {
                _dustLeft = _repayAmount - _maxRepay;
            }
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

    /// @notice Liquidates one or multiple users which are flagged for liquidation
    /// (a.k.a. "not safe"). The user calling this function must have the address
    /// of a special liquidator contract which will receive liquidated collateral
    /// and has the responsability to swap it for USDR and deposit it into
    /// the `LendingPair`'s `LickHitter` account.
    /// @dev This function is non-reentrant for extra protection. It just
    /// loops through the given users, checks if they are flagged for liquidation and
    /// calculates the repayment required (including the ecosystem liquidation fee)
    /// and collateral (plus collateral reward/incentive) which will be sent out (for swapping).
    /// It then checks that the liquidator contract repaid the needed assets.
    /// @param _users List of users to liquidate.
    /// @param _repayAmounts For each user, how much of their loan to repay.
    /// You can just use a number bigger than their entire loan to repay their
    /// whole loan.
    /// @param _liquidator Address of the liquidator contract which will manage the
    /// swapping and repayment. Must implement the `ILiquidator` interface.
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
                unchecked {
                    borrows[_user] = borrows[_user] - _repayAmount;   
                }
                
                // Collateral removed is collateral of _repayAmount value + liquidation/finder fee
                // Calculate total collateral to be removed in stablecoin
                uint256 _collateralRemoved = (_repayAmount + ((LIQUIDATION_INCENTIVE * _repayAmount) / GENERAL_DIVISOR));
                // Convert to actual collateral
                _collateralRemoved = (_collateralRemoved * 10**collateralDecimals) / exchangeRate;
                uint256 _collateralShares = ILickHitter(yieldVault).convertShares(collateral, 0, _collateralRemoved);
                if (shareBalances[_user] >= _collateralShares) {
                    unchecked {
                        shareBalances[_user] = shareBalances[_user] - _collateralShares;
                    }
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
        uint256 _before = ILickHitter(yieldVault).balanceOf(lendAsset, address(this));
        ILiquidator(_liquidator).liquidateHook(
            collateral,
            msg.sender,
            _totalRepayRequired,
            _totalCollateralLiquidated
        );
        uint256 _after = ILickHitter(yieldVault).balanceOf(lendAsset, address(this));
        uint256 _repaidAmount = ILickHitter(yieldVault).convertShares(lendAsset, (_after - _before), 0);

        // Check the repayment was made
        require(_repaidAmount >= _totalRepayRequired, "Repayment not made");
        
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

    // Note: This is view only and exchange rate will not
    // be updated (until an actual important call happens)
    // so the result of this function may not be accurate
    function isUserSafe(address _user) external view returns (bool) {
        return _userSafe(_user);
    }

}
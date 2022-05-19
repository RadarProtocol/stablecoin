// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../../interfaces/yearn/IYearnVaultV2.sol";
import "./../../interfaces/ILendingPair.sol";
import "./../../interfaces/IWETH.sol";

contract CurveDepositor {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_UINT = 2**256 - 1;

    function depositCurveAddLiquidity(
        address _receiver,
        address _crvLpAsset,
        address _crvPool,
        bytes calldata _curveAddLiquidityTx,
        address _underlying,
        address _lendingPair,
        uint256 _amount,
        bool _useEth
    ) external payable {
        // Transfer underlying from user
        if (!_useEth) {
            IERC20(_underlying).safeTransferFrom(msg.sender, address(this), _amount);
            _checkAllowanceAndApprove(_underlying, _crvPool, _amount);
        } else {
            require(msg.value >= _amount, "Invalid ETH");
        }

        // Deposit to curve
        (bool success,) = _crvPool.call{value: _useEth ? msg.value : 0}(_curveAddLiquidityTx);
        require(success, "Invalid LP Deposit");

        // Deposit to lending pair
        uint256 _lpAmount = IERC20(_crvLpAsset).balanceOf(address(this));
        require(_lpAmount > 0, "Safety fail");
        _checkAllowanceAndApprove(_crvLpAsset, _lendingPair, _lpAmount);
        ILendingPair(_lendingPair).deposit(_lpAmount, _receiver);
    }

    function _checkAllowanceAndApprove(
        address _asset,
        address _spender,
        uint256 _amt
    ) internal {
        uint256 _allowance = IERC20(_asset).allowance(address(this), _spender);
        if (_allowance < _amt) {
            if (_allowance != 0) {
                IERC20(_asset).safeApprove(_spender, 0);
            }
            IERC20(_asset).safeApprove(_spender, MAX_UINT);
        }
    }
}
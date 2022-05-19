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

contract YearnDepositor {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_UINT = 2**256 - 1;
    address payable private immutable WETH;

    constructor(address payable _weth) {
        WETH = _weth;
    }

    function depositYearnUnderlying(
        address _receiver,
        address _yearnAsset,
        address _yearnUnderlying,
        address _lendingPair,
        uint256 _amount,
        bool _useEth
    ) external payable {
        // Transfer underlying from user
        if (!_useEth) {
            IERC20(_yearnUnderlying).safeTransferFrom(msg.sender, address(this), _amount);
        } else {
            require(msg.value >= _amount && _yearnUnderlying == WETH, "Invalid ETH");
            IWETH9(WETH).deposit{value: msg.value}();
        }

        // Deposit to yearn
        _checkAllowanceAndApprove(_yearnUnderlying, _yearnAsset, _amount);
        IYearnVaultV2(_yearnAsset).deposit(_amount);

        // Deposit to lending pair
        uint256 _yAmount = IERC20(_yearnAsset).balanceOf(address(this));
        require(_yAmount > 0, "Safety fail");
        _checkAllowanceAndApprove(_yearnAsset, _lendingPair, _yAmount);
        ILendingPair(_lendingPair).deposit(_yAmount, _receiver);
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
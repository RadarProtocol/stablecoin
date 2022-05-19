// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "./../../../interfaces/IWETH.sol";
import "./../../../interfaces/ILendingPair.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract AvaxWrapperDepositor {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_UINT = 2**256 - 1;

    address payable private constant WAVAX = payable(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);

    function deposit(
        address _lendingPair,
        address _receiver
    ) external payable {
        uint256 _amount = msg.value;

        IWETH9(WAVAX).deposit{value: _amount}();

        _checkAllowanceAndApprove(WAVAX, _lendingPair, _amount);
        ILendingPair(_lendingPair).deposit(_amount, _receiver);
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
// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "./../../../interfaces/benqi/IBenqiToken.sol";
import "./../../../interfaces/ILendingPair.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract BenqiDepositor {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_UINT = 2**256 - 1;

    address payable private constant qiAVAX = payable(0xaf2c034C764d53005cC6cbc092518112cBD652bb);

    function deposit(
        address _underlying,
        address _qiAsset,
        address _lendingPair,
        address _receiver,
        uint256 _amount
    ) external payable {
        if (_qiAsset == qiAVAX) {
            // Deposit AVAX directly
            IBenqiAvax(qiAVAX).mint{value: msg.value}();
        } else {
            IERC20(_underlying).safeTransferFrom(msg.sender, address(this), _amount);

            _checkAllowanceAndApprove(_underlying, _qiAsset, _amount);

            IBenqiToken(_qiAsset).mint(_amount);
        }

        uint256 _bal = IERC20(_qiAsset).balanceOf(address(this));
        _checkAllowanceAndApprove(_qiAsset, _lendingPair, _bal);
        ILendingPair(_lendingPair).deposit(_bal, _receiver);
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
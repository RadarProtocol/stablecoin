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
        _checkAllowanceAndApprove(_yearnAsset, _lendingPair, _yAmount);
        ILendingPair(_lendingPair).deposit(_yAmount, _receiver);
    }

    function _checkAllowanceAndApprove(
        address _asset,
        address _spender,
        uint256 _amt
    ) internal {
        if (IERC20(_asset).allowance(address(this), _spender) < _amt) {
            IERC20(_asset).safeApprove(_spender, MAX_UINT);
        }
    }
}
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
import "./../../interfaces/ISwapper.sol";
import "./../../interfaces/ILiquidator.sol";
import "./../../interfaces/curve/ICurvePool.sol";
import "./../../interfaces/ILickHitter.sol";

contract CurveAaveUnderlyingSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;
    address private constant av3Crv_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;

    address private constant DAI = 0xd586E7F844cEa2F87f50152665BCbc2C279D8d70;
    address private constant USDC = 0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664;
    address private constant USDT = 0xc7198437980c041c805A1EDcbA50c1Ce5db95118;

    constructor(
        address _yv,
        address _usdr,
        address _usdrPool
    ) {
        yieldVault = _yv;
        USDR = _usdr;
        CURVE_USDR_av3Crv_POOL = _usdrPool;

        IERC20(_usdr).safeApprove(_usdrPool, MAX_UINT);
        IERC20(DAI).safeApprove(_yv, MAX_UINT);
        IERC20(USDC).safeApprove(_yv, MAX_UINT);
        IERC20(USDT).safeApprove(_yv, MAX_UINT);

        IERC20(DAI).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(USDC).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(USDT).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(_usdr).safeApprove(_yv, MAX_UINT);
    }

    function depositHook(
        address _collateral,
        bytes calldata data
    ) external override {
        (uint256 _minAsset) = abi.decode(data, (uint256));

        // Swap USDR to asset
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange_underlying(0, _getTokenId(_collateral), _usdrBal, _minAsset);

        // Deposit to LickHitter
        uint256 _colBal = IERC20(_collateral).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(_collateral, msg.sender, _colBal);
    }

    function repayHook(
        address _collateral,
        bytes calldata data
    ) external override {
        (uint256 _minUSDR) = abi.decode(data, (uint256));

        _swapAsset2USDR(_collateral, _minUSDR);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    function liquidateHook(
        address _collateral,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override {
        (uint256 _minUSDR) = abi.decode(data, (uint256));

        _swapAsset2USDR(_collateral, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapAsset2USDR(address _token, uint256 _minUSDR) internal {
        uint256 _assetBal = IERC20(_token).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange_underlying(_getTokenId(_token), 0, _assetBal, _minUSDR);
    }

    function _getTokenId(address _token) internal pure returns (int128) {
        if  (_token == DAI) {
            return 1;
        } else if (_token == USDC) {
            return 2;
        } else if (_token == USDT) {
            return 3;
        } else {
            return -1; // Invalid
        }
    }
}
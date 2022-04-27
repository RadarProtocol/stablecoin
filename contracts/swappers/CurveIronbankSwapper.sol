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
import "./../interfaces/ISwapper.sol";
import "./../interfaces/ILiquidator.sol";
import "./../interfaces/curve/ICurvePool.sol";
import "./../interfaces/ILickHitter.sol";

contract CurveIronbankSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable crvIB;
    address private immutable USDC;
    address private immutable USDR;

    address private immutable CURVE_USDR_3POOL;
    address private immutable CURVE_IRONBANK_3POOL;

    address private immutable yieldVault;

    constructor(
        address _crvIB,
        address _usdc,
        address _usdr,
        address _cusdr3p,
        address _cib3p,
        address _yv
    ) {
        crvIB = _crvIB;
        USDC = _usdc;
        USDR = _usdr;

        CURVE_USDR_3POOL = _cusdr3p;
        CURVE_IRONBANK_3POOL = _cib3p;

        yieldVault = _yv;
    }

    modifier checkAllowance {
        uint256 _randomAllowance = IERC20(USDR).allowance(address(this), CURVE_USDR_3POOL);
        if (_randomAllowance <= 10**18) {
            _approveAll();
        }
        _;
    }

    function reApprove() external {
        _approveAll();
    }

    function _approveAll() internal {
        IERC20(USDR).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDC).safeApprove(CURVE_IRONBANK_3POOL, MAX_UINT);
        IERC20(crvIB).safeApprove(yieldVault, MAX_UINT);

        IERC20(crvIB).safeApprove(CURVE_IRONBANK_3POOL, MAX_UINT);
        IERC20(USDC).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).safeApprove(yieldVault, MAX_UINT);
    }

    // Swap USDR to crvIB
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDC, uint256 _mincrvIB) = abi.decode(data, (uint256, uint256));

        // Swap USDR to USDC
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(0, 2, _usdrBal, _minUSDC, address(this));

        // Swap USDC to crvIB
        uint256 _receivedUSDC = IERC20(USDC).balanceOf(address(this));
        ICurvePool(CURVE_IRONBANK_3POOL).add_liquidity([0, _receivedUSDC, 0], _mincrvIB, true);

        // Deposit to LickHitter
        uint256 _crvIBBal = IERC20(crvIB).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(crvIB, msg.sender, _crvIBBal);
    }

    // Swap crvIB to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDC, uint256 _minUSDR) = abi.decode(data, (uint256, uint256));

        _swapcrvIB2USDR(_minUSDC, _minUSDR);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    // Swap crvIB to USDR
    function liquidateHook(
        address,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDC, uint256 _minUSDR) = abi.decode(data, (uint256, uint256));

        _swapcrvIB2USDR(_minUSDC, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapcrvIB2USDR(uint256 _minUSDC, uint256 _minUSDR) internal {
        // Swap crvIB to USDC
        uint256 _crvIBBal = IERC20(crvIB).balanceOf(address(this));
        ICurvePool(CURVE_IRONBANK_3POOL).remove_liquidity_one_coin(_crvIBBal, 1, _minUSDC, true);

        // Swap USDC to USDR
        uint256 _usdcBal = IERC20(USDC).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(2, 0, _usdcBal, _minUSDR, address(this));
    }
}
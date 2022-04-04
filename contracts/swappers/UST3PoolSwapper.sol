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

contract UST3PoolSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable UST;
    address private immutable USDR;

    address private immutable CURVE_3POOL_TOKEN;
    address private immutable CURVE_USDR_3POOL;
    address private immutable CURVE_UST_3POOL;

    address private immutable yieldVault;

    constructor(
        address _ust,
        address _usdr,
        address _c3p,
        address _cusdr3p,
        address _cust3p,
        address _yv
    ) {
        UST = _ust;
        USDR = _usdr;

        CURVE_3POOL_TOKEN = _c3p;
        CURVE_USDR_3POOL = _cusdr3p;
        CURVE_UST_3POOL = _cust3p;

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
        IERC20(USDR).approve(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(CURVE_3POOL_TOKEN).approve(CURVE_UST_3POOL, MAX_UINT);
        IERC20(UST).approve(yieldVault, MAX_UINT);

        IERC20(UST).approve(CURVE_UST_3POOL, MAX_UINT);
        IERC20(CURVE_3POOL_TOKEN).approve(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).approve(yieldVault, MAX_UINT);
    }

    // Swap USDR to UST
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _min3PoolReceive, uint256 _minUSTReceive) = abi.decode(data, (uint256, uint256));

        // Swap USDR to 3pool
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        uint256 _received3Pool = ICurvePool(CURVE_USDR_3POOL).exchange(0, 1, _usdrBal, _min3PoolReceive, address(this));

        // Swap 3pool to UST
        ICurvePool(CURVE_UST_3POOL).exchange(1, 0, _received3Pool, _minUSTReceive, address(this));

        // Deposit to LickHitter
        uint256 _ustBal = IERC20(UST).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(UST, msg.sender, _ustBal);
    }

    // Swap UST to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _min3PoolReceive, uint256 _minUSDRReceive) = abi.decode(data, (uint256, uint256));

        _swapUST2USDR(_min3PoolReceive, _minUSDRReceive);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    // Swap UST to USDR
    function liquidateHook(
        address,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override checkAllowance {

        (uint256 _min3PoolReceive, uint256 _minUSDRReceive) = abi.decode(data, (uint256, uint256));

        _swapUST2USDR(_min3PoolReceive, _minUSDRReceive);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapUST2USDR(uint256 _min3Pool, uint256 _minUSDR) internal {
        // Swap UST to 3Pool
        uint256 _ustBal = IERC20(UST).balanceOf(address(this));
        uint256 _received3Pool = ICurvePool(CURVE_UST_3POOL).exchange(0, 1, _ustBal, _min3Pool, address(this));

        // Swap 3Pool to USDR
        ICurvePool(CURVE_USDR_3POOL).exchange(1, 0, _received3Pool, _minUSDR, address(this));
    }
}
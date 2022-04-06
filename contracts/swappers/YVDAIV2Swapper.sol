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
import "./../interfaces/yearn/IYearnVaultV2.sol";
import "./../interfaces/ILickHitter.sol";

contract YVDAIV2Swapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable USDR;
    address private immutable DAI;
    address private immutable yvDAIV2;

    address private immutable CURVE_USDR_3POOL;

    address private immutable yieldVault;

    constructor(
        address _usdr,
        address _dai,
        address _yvdai,
        address _curveUsdr,
        address _yv
    ) {
        USDR = _usdr;
        DAI = _dai;
        yvDAIV2 = _yvdai;

        CURVE_USDR_3POOL = _curveUsdr;

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
        IERC20(DAI).approve(yvDAIV2, MAX_UINT);
        IERC20(yvDAIV2).approve(yieldVault, MAX_UINT);

        IERC20(DAI).approve(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).approve(yieldVault, MAX_UINT);
    }

    // Swap USDR to yvWETHV2
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minDAIReceive) = abi.decode(data, (uint256));

        // Swap USDR to DAI
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        uint256 _receivedDAI = ICurvePool(CURVE_USDR_3POOL).exchange_underlying(0, 1, _usdrBal, _minDAIReceive, address(this));

        // Swap DAI to yvDAIV2
        IYearnVaultV2(yvDAIV2).deposit(_receivedDAI);

        // Deposit to LickHitter
        uint256 _myBal = IERC20(yvDAIV2).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(yvDAIV2, msg.sender, _myBal);
    }

    // Swap yvWETHV2 to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDRReceive) = abi.decode(data, (uint256));

        _swapyvDAIV22USDR(_minUSDRReceive);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    // Swap yvWETHV2 to USDR
    function liquidateHook(
        address,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDRReceive) = abi.decode(data, (uint256));

        _swapyvDAIV22USDR(_minUSDRReceive);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapyvDAIV22USDR(uint256 _minUSDR) internal {
        // Swap yvDAIV2 to DAI
        uint256 _receivedDAI = IYearnVaultV2(yvDAIV2).withdraw();

        // Swap DAI to USDR
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(1, 0, _receivedDAI, _minUSDR, address(this));
    }
}
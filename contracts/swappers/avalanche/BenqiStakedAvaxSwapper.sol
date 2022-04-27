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
import "./../../interfaces/traderjoe/IJoeRouter02.sol";

contract BenqiStakedAvaxSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address private constant SAVAX = 0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE;
    address private constant JOE_ROUTER = 0x60aE616a2155Ee3d9A68541Ba4544862310933d4;
    address private constant USDT = 0xc7198437980c041c805A1EDcbA50c1Ce5db95118;
    address private constant WAVAX = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;
    address private constant av3Crv_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;
    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;

    constructor(
        address _yv,
        address _usdr,
        address _curveUsdrPool
    ) {
        yieldVault = _yv;
        USDR = _usdr;
        CURVE_USDR_av3Crv_POOL = _curveUsdrPool;

        IERC20(_usdr).safeApprove(_curveUsdrPool, MAX_UINT);
        IERC20(av3Crv).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(USDT).safeApprove(JOE_ROUTER, MAX_UINT);
        IERC20(SAVAX).safeApprove(_yv, MAX_UINT);

        IERC20(SAVAX).safeApprove(JOE_ROUTER, MAX_UINT);
        IERC20(USDT).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(av3Crv).safeApprove(_curveUsdrPool, MAX_UINT);
        IERC20(_usdr).safeApprove(_yv, MAX_UINT);
    }

    function depositHook(
        address,
        bytes calldata data
    ) external override {
        (uint256 _minav3Crv, uint256 _minUSDT, uint256 _minsAVAX) = abi.decode(data, (uint256,uint256,uint256));

        // Swap USDR to av3Crv
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        uint256 _receivedav3Crv = ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(0, 1, _usdrBal, _minav3Crv, address(this));

        // Swap av3Crv to USDT
        uint256 _receivedUSDT = IAvaxAv3CrvPool(av3Crv_POOL).remove_liquidity_one_coin(_receivedav3Crv, 2, _minUSDT, true);

        // Swap USDT to SAVAX
        address[] memory _path = new address[](3);
        _path[0] = USDT;
        _path[1] = WAVAX;
        _path[2] = SAVAX;
        
        IJoeRouter02(JOE_ROUTER).swapExactTokensForTokens(
            _receivedUSDT,
            _minsAVAX,
            _path,
            address(this),
            block.timestamp + 1
        );

        // Deposit to LickHitter
        uint256 _sAVAXBal = IERC20(SAVAX).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(SAVAX, msg.sender, _sAVAXBal);
    }

    function repayHook(
        address,
         bytes calldata data
    ) external override {
        (uint256 _minUSDT, uint256 _minav3Crv, uint256 _minUSDR) = abi.decode(data, (uint256,uint256,uint256));

        _swapsAVAX2USDR(_minUSDT, _minav3Crv, _minUSDR);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    function liquidateHook(
        address,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override {
        (uint256 _minUSDT, uint256 _minav3Crv, uint256 _minUSDR) = abi.decode(data, (uint256,uint256,uint256));

        _swapsAVAX2USDR(_minUSDT, _minav3Crv, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapsAVAX2USDR(uint256 _minUSDT, uint256 _minav3Crv, uint256 _minUSDR) internal {
        // Swap sAVAX to USDT
        uint256 _sAVAXBal = IERC20(SAVAX).balanceOf(address(this));
        address[] memory _path = new address[](3);
        _path[0] = SAVAX;
        _path[1] = WAVAX;
        _path[2] = USDT;
        
        IJoeRouter02(JOE_ROUTER).swapExactTokensForTokens(
            _sAVAXBal,
            _minUSDT,
            _path,
            address(this),
            block.timestamp + 1
        );

        // Swap USDT to av3Crv
        uint256 _usdtBal = IERC20(USDT).balanceOf(address(this));
        uint256 _receivedav3Crv = IAvaxAv3CrvPool(av3Crv_POOL).add_liquidity([0, 0, _usdtBal], _minav3Crv, true);

        // Swap av3Crv to USDR
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(1, 0, _receivedav3Crv, _minUSDR, address(this));
    }
}
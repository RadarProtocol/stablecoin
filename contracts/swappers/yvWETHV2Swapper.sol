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
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./../interfaces/curve/ICurvePool.sol";
import "./../interfaces/yearn/IYearnVaultV2.sol";
import "./../interfaces/ILickHitter.sol";

contract yvWETHV2Swapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable USDR;
    address private immutable WETH;
    address private immutable USDC;
    address private immutable yvWETHV2;

    address private immutable CURVE_USDR_3POOL;
    address private immutable UNISWAPV3_ROUTER;

    address private immutable yieldVault;

    constructor(
        address _usdr,
        address _weth,
        address _usdc,
        address _yvweth,
        address _curveUsdr,
        address _uniswapv3router,
        address _yv
    ) {
        USDR = _usdr;
        WETH = _weth;
        USDC = _usdc;
        yvWETHV2 = _yvweth;

        CURVE_USDR_3POOL = _curveUsdr;
        UNISWAPV3_ROUTER = _uniswapv3router;

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
        IERC20(USDC).approve(UNISWAPV3_ROUTER, MAX_UINT);
        IERC20(WETH).approve(yvWETHV2, MAX_UINT);

        IERC20(WETH).approve(UNISWAPV3_ROUTER, MAX_UINT);
        IERC20(USDC).approve(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).approve(yieldVault, MAX_UINT);
    }

    // Swap USDR to yvWETHV2
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDCReceive, uint256 _minWETHReceive) = abi.decode(data, (uint256, uint256));

        // Swap USDR to USDC
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        uint256 _receivedUSDC = ICurvePool(CURVE_USDR_3POOL).exchange_underlying(0, 2, _usdrBal, _minUSDCReceive, address(this));

        // Swap USDC to WETH
        ISwapRouter.ExactInputParams memory _uniswapParams = ISwapRouter.ExactInputParams({
            path: abi.encodePacked(
                USDC,
                uint24(500),
                WETH,
                uint24(500)
            ),
            recipient: address(this),
            deadline: block.timestamp + 1,
            amountIn: _receivedUSDC,
            amountOutMinimum: _minUSDCReceive
        });
        uint256 _receivedWETH = ISwapRouter(UNISWAPV3_ROUTER).exactInput(_uniswapParams);

        // Swap WETH to yvWETHV2
        IYearnVaultV2(yvWETHV2).deposit(_receivedWETH);

        // Deposit to LickHitter
        uint256 _myBal = IERC20(yvWETHV2).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(yvWETHV2, msg.sender, _myBal);
    }

    // Swap yvWETHV2 to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDCReceive, uint256 _minUSDRReceive) = abi.decode(data, (uint256, uint256));

        _swapyvWETHV22USDR(_minUSDCReceive, _minUSDRReceive);

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
        (uint256 _minUSDCReceive, uint256 _minUSDRReceive) = abi.decode(data, (uint256, uint256));

        _swapyvWETHV22USDR(_minUSDCReceive, _minUSDRReceive);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapyvWETHV22USDR(uint256 _minUSDC, uint256 _minUSDR) internal {
        // Swap yvWETHV2 to WETH
        uint256 _receivedWETH = IYearnVaultV2(yvWETHV2).withdraw();

        // Swap WETH to USDC
        ISwapRouter.ExactInputParams memory _uniswapParams = ISwapRouter.ExactInputParams({
            path: abi.encodePacked(
                WETH,
                uint24(500),
                USDC,
                uint24(500)
            ),
            recipient: address(this),
            deadline: block.timestamp + 1,
            amountIn: _receivedWETH,
            amountOutMinimum: _minUSDC
        });
        uint256 _receivedUSDC = ISwapRouter(UNISWAPV3_ROUTER).exactInput(_uniswapParams);

        // Swap USDC to USDR
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(2, 0, _receivedUSDC, _minUSDR, address(this));
    }
}
// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/ISwapper.sol";
import "./../interfaces/ILiquidator.sol";
import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./../interfaces/IWETH.sol";
import "./../interfaces/curve/ICurvePool.sol";
import "./../interfaces/ILickHitter.sol";

contract CurvestETHSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address payable private immutable WETH;
    address private immutable crvstETH;
    address private immutable USDR;
    address private immutable USDC;

    address private immutable CURVE_USDR_3POOL;
    address private immutable CURVE_STETH_POOL;
    address private immutable UNISWAPV3_ROUTER;

    address private immutable yieldVault;

    constructor(
        address payable _weth,
        address _crvsteth,
        address _usdr,
        address _usdc,
        address _curveusdr,
        address _curvestheth,
        address _uniswapV3,
        address _yv
    ) {
        WETH = _weth;
        crvstETH = _crvsteth;
        USDR = _usdr;
        USDC = _usdc;

        CURVE_USDR_3POOL = _curveusdr;
        CURVE_STETH_POOL = _curvestheth;
        UNISWAPV3_ROUTER = _uniswapV3;

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
        IERC20(USDC).safeApprove(UNISWAPV3_ROUTER, MAX_UINT);
        IERC20(crvstETH).safeApprove(yieldVault, MAX_UINT);

        IERC20(crvstETH).safeApprove(CURVE_STETH_POOL, MAX_UINT);
        IERC20(WETH).safeApprove(UNISWAPV3_ROUTER, MAX_UINT);
        IERC20(USDC).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).safeApprove(yieldVault, MAX_UINT);
    }

    // Swap USDR to crvstETH
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDC, uint256 _minWETH, uint256 _mincrvstETH) = abi.decode(data, (uint256,uint256,uint256));

        // Swap USDR to USDC
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(0, 2, _usdrBal, _minUSDC, address(this));

        // Swap USDC to WETH
        uint256 _receivedUSDC = IERC20(USDC).balanceOf(address(this));
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
            amountOutMinimum: _minWETH
        });
        ISwapRouter(UNISWAPV3_ROUTER).exactInput(_uniswapParams);

        // Swap WETH to ETH
        uint256 _receivedWETH = IERC20(WETH).balanceOf(address(this));
        IWETH9(WETH).withdraw(_receivedWETH);

        // Swap ETH to crvstETH
        ICurvePool(CURVE_STETH_POOL).add_liquidity{value: _receivedWETH}([_receivedWETH, 0], _mincrvstETH);

        // Deposit to LickHitter
        uint256 _crvstETHBal = IERC20(crvstETH).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(crvstETH, msg.sender, _crvstETHBal);
    }

    // Swap crvstETH to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minETH, uint256 _minUSDC, uint256 _minUSDR) = abi.decode(data, (uint256, uint256, uint256));

        _swapcrvstETH2USDR(_minETH, _minUSDC, _minUSDR);

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
        (uint256 _minETH, uint256 _minUSDC, uint256 _minUSDR) = abi.decode(data, (uint256, uint256, uint256));

        _swapcrvstETH2USDR(_minETH, _minUSDC, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapcrvstETH2USDR(uint256 _minETH, uint256 _minUSDC, uint256 _minUSDR) internal {

        // Swap crvstETH to ETH
        uint256 _crvstETHBal = IERC20(crvstETH).balanceOf(address(this));
        ICurvePool(CURVE_STETH_POOL).remove_liquidity_one_coin(_crvstETHBal, 0, _minETH);

        // Swap ETH to WETH
        IWETH9(WETH).deposit{value: address(this).balance}();

        // Swap WETH to USDC
        uint256 _wethBal = IERC20(WETH).balanceOf(address(this));
        ISwapRouter.ExactInputParams memory _uniswapParams = ISwapRouter.ExactInputParams({
            path: abi.encodePacked(
                WETH,
                uint24(500),
                USDC,
                uint24(500)
            ),
            recipient: address(this),
            deadline: block.timestamp + 1,
            amountIn: _wethBal,
            amountOutMinimum: _minUSDC
        });
        ISwapRouter(UNISWAPV3_ROUTER).exactInput(_uniswapParams);

        // Swap USDC to USDR
        uint256 _receivedUSDC = IERC20(USDC).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(2, 0, _receivedUSDC, _minUSDR, address(this));
    }

    receive() external payable {}
}
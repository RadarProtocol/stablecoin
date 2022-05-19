// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/ISwapper.sol";
import "./../interfaces/ILiquidator.sol";
import "./../interfaces/curve/ICurvePool.sol";
import "./../interfaces/ILickHitter.sol";

contract CurveFRAXSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable crvFRAX;
    address private immutable USDR;

    address private immutable CURVE_3POOL_TOKEN;
    address private immutable CURVE_USDR_3POOL;
    address private immutable CURVE_FRAX_3POOL;

    address private immutable yieldVault;

    constructor(
        address _crvFRAX,
        address _usdr,
        address _c3p,
        address _cusdr3p,
        address _cfrax3p,
        address _yv
    ) {
        crvFRAX = _crvFRAX;
        USDR = _usdr;

        CURVE_3POOL_TOKEN = _c3p;
        CURVE_USDR_3POOL = _cusdr3p;
        CURVE_FRAX_3POOL = _cfrax3p;

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
        IERC20(CURVE_3POOL_TOKEN).safeApprove(CURVE_FRAX_3POOL, MAX_UINT);
        IERC20(crvFRAX).safeApprove(yieldVault, MAX_UINT);

        IERC20(CURVE_3POOL_TOKEN).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).safeApprove(yieldVault, MAX_UINT);
    }

    // Swap USDR to crvFRAX
    function depositHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _min3Pool, uint256 _mincrvFRAX) = abi.decode(data, (uint256, uint256));

        // Swap USDR to 3pool
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange(0, 1, _usdrBal, _min3Pool, address(this));

        // Swap 3pool to crvFRAX
        uint256 _received3Pool = IERC20(CURVE_3POOL_TOKEN).balanceOf(address(this));
        ICurvePool(CURVE_FRAX_3POOL).add_liquidity([0, _received3Pool], _mincrvFRAX);

        // Deposit to LickHitter
        uint256 _crvFRAXBal = IERC20(crvFRAX).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(crvFRAX, msg.sender, _crvFRAXBal);
    }

    // Swap crvFRAX to USDR
    function repayHook(
        address,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _min3Pool, uint256 _minUSDR) = abi.decode(data, (uint256, uint256));

        _swapcrvFRAX2USDR(_min3Pool, _minUSDR);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    // Swap crvFRAX to USDR
    function liquidateHook(
        address,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _min3Pool, uint256 _minUSDR) = abi.decode(data, (uint256, uint256));

        _swapcrvFRAX2USDR(_min3Pool, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapcrvFRAX2USDR(uint256 _min3Pool, uint256 _minUSDR) internal {
        // Swap crvFRAX to 3Pool
        uint256 _crvFRAXBal = IERC20(crvFRAX).balanceOf(address(this));
        ICurvePool(CURVE_FRAX_3POOL).remove_liquidity_one_coin(_crvFRAXBal, 1, _min3Pool);

        // Swap 3Pool to USDR
        uint256 _3poolBal = IERC20(CURVE_3POOL_TOKEN).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange(1, 0, _3poolBal, _minUSDR, address(this));
    }
}
// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../../interfaces/ISwapper.sol";
import "./../../interfaces/ILiquidator.sol";
import "./../../interfaces/curve/ICurvePool.sol";
import "./../../interfaces/ILickHitter.sol";

contract CurveAaveLPSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address private constant av3Crv_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;
    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;

    constructor(
        address _yv,
        address _usdr,
        address _usdrPool
    ) {
        yieldVault = _yv;
        USDR = _usdr;
        CURVE_USDR_av3Crv_POOL = _usdrPool;

        IERC20(_usdr).safeApprove(_usdrPool, MAX_UINT);
        IERC20(av3Crv).safeApprove(_yv, MAX_UINT);

        IERC20(av3Crv).safeApprove(_usdrPool, MAX_UINT);
        IERC20(_usdr).safeApprove(_yv,  MAX_UINT);
    }

    function depositHook(
        address,
        bytes calldata data
    ) external override {
        (uint256 _minav3Crv) = abi.decode(data, (uint256));

        // Swap USDR to av3Crv
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(0, 1, _usdrBal, _minav3Crv, address(this));

        // Deposit to LickHitter
        uint256 _avBal = IERC20(av3Crv).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(av3Crv, msg.sender, _avBal);
    }

    function repayHook(
        address,
         bytes calldata data
    ) external override {
        (uint256 _minUSDR) = abi.decode(data, (uint256));

        _swapav3Crv2USDR(_minUSDR);

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
        (uint256 _minUSDR) = abi.decode(data, (uint256));

        _swapav3Crv2USDR(_minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapav3Crv2USDR(uint256 _minUSDR) internal {
        // Swap av3Crv to USDR
        uint256 _av3CrvBal = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(1, 0, _av3CrvBal, _minUSDR, address(this));
    }
}
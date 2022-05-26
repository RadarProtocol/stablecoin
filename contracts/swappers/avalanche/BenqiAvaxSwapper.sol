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
import "./../../interfaces/traderjoe/IJoeRouter02.sol";
import "./../../interfaces/benqi/IBenqiToken.sol";

contract BenqiAvaxSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address payable private constant JOE_ROUTER = payable(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);
    address private constant USDT = 0xc7198437980c041c805A1EDcbA50c1Ce5db95118;
    address private constant WAVAX = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;
    address private constant av3Crv_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;
    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;
    address payable private constant qiAVAX = payable(0x5C0401e81Bc07Ca70fAD469b451682c0d747Ef1c);

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
        IERC20(qiAVAX).safeApprove(_yv, MAX_UINT);

        IERC20(USDT).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(av3Crv).safeApprove(_curveUsdrPool, MAX_UINT);
        IERC20(_usdr).safeApprove(_yv, MAX_UINT);
    }

    // Swap USDR to wAVAX
    function depositHook(
        address,
        bytes calldata data
    ) external override {
        (uint256 _minav3Crv, uint256 _minUSDT, uint256 _minwAVAX) = abi.decode(data, (uint256,uint256,uint256));

        // Swap USDR to av3Crv
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(0, 1, _usdrBal, _minav3Crv, address(this));

        // Swap av3Crv to USDT
        uint256 _receivedav3Crv = IERC20(av3Crv).balanceOf(address(this));
        uint256 _receivedUSDT = IAvaxAv3CrvPool(av3Crv_POOL).remove_liquidity_one_coin(_receivedav3Crv, 2, _minUSDT, true);

        // Swap USDT to AVAX
        address[] memory _path = new address[](2);
        _path[0] = USDT;
        _path[1] = WAVAX;
        
        IJoeRouter02(JOE_ROUTER).swapExactTokensForAVAX(
            _receivedUSDT,
            _minwAVAX,
            _path,
            address(this),
            block.timestamp + 1
        );

        // Swap AVAX to qiAVAX
        IBenqiAvax(qiAVAX).mint{value: address(this).balance}();

        // Deposit to LickHitter
        uint256 _qiAVAXBal = IERC20(qiAVAX).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(qiAVAX, msg.sender, _qiAVAXBal);
    }

    function repayHook(
        address,
         bytes calldata data
    ) external override {
        (uint256 _minUSDT, uint256 _minav3Crv, uint256 _minUSDR) = abi.decode(data, (uint256,uint256,uint256));

        _swapwAVAX2USDR(_minUSDT, _minav3Crv, _minUSDR);

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

        _swapwAVAX2USDR(_minUSDT, _minav3Crv, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapwAVAX2USDR(uint256 _minUSDT, uint256 _minav3Crv, uint256 _minUSDR) internal {
        // Swap qiAVAX to AVAX
        uint256 _qiAvaxBal = IERC20(qiAVAX).balanceOf(address(this));
        IBenqiAvax(qiAVAX).redeem(_qiAvaxBal);

        // Swap AVAX to USDT
        address[] memory _path = new address[](2);
        _path[0] = WAVAX;
        _path[1] = USDT;
        
        IJoeRouter02(JOE_ROUTER).swapExactAVAXForTokens{value: address(this).balance}(
            _minUSDT,
            _path,
            address(this),
            block.timestamp + 1
        );

        // Swap USDT to av3Crv
        uint256 _usdtBal = IERC20(USDT).balanceOf(address(this));
        IAvaxAv3CrvPool(av3Crv_POOL).add_liquidity([0, 0, _usdtBal], _minav3Crv, true);

        // Swap av3Crv to USDT
        uint256 _receivedav3Crv = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(1, 0, _receivedav3Crv, _minUSDR, address(this));
    }

    receive() external payable {}
}
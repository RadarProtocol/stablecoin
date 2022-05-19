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
import "./../../interfaces/aave/ILendingPool.sol";
import "./../../interfaces/benqi/IBenqiToken.sol";

contract BenqiCurveTricryptoUnderlyingSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address private constant tricryptoPOOL = 0xB755B949C126C04e0348DD881a5cF55d424742B2;
    address private constant AAVE_LENDING_POOL = 0x4F01AeD16D97E3aB5ab2B501154DC9bb0F1A5A2C;

    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;
    address private constant wETH = 0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB;
    address private constant wBTC = 0x50b7545627a5162F82A992c33b87aDc75187B218;
    address private constant avwETH = 0x53f7c5869a859F0AeC3D334ee8B4Cf01E3492f21;
    address private constant avwBTC = 0x686bEF2417b6Dc32C50a3cBfbCC3bb60E1e9a15D;

    address private constant qiBTC = 0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568;
    address private constant qiETH = 0x334AD834Cd4481BB02d09615E7c11a00579A7909;

    constructor(
        address _yv,
        address _usdr,
        address _usdrPool
    ) {
        yieldVault = _yv;
        USDR = _usdr;
        CURVE_USDR_av3Crv_POOL = _usdrPool;

        IERC20(_usdr).safeApprove(_usdrPool, MAX_UINT);
        IERC20(av3Crv).safeApprove(tricryptoPOOL, MAX_UINT);
        IERC20(wETH).safeApprove(qiETH, MAX_UINT);
        IERC20(wBTC).safeApprove(qiBTC, MAX_UINT);
        IERC20(qiETH).safeApprove(_yv, MAX_UINT);
        IERC20(qiBTC).safeApprove(_yv, MAX_UINT);

        IERC20(wETH).safeApprove(AAVE_LENDING_POOL, MAX_UINT);
        IERC20(wBTC).safeApprove(AAVE_LENDING_POOL, MAX_UINT);
        IERC20(avwETH).safeApprove(tricryptoPOOL, MAX_UINT);
        IERC20(avwBTC).safeApprove(tricryptoPOOL, MAX_UINT);
        IERC20(av3Crv).safeApprove(_usdrPool, MAX_UINT);
        IERC20(_usdr).safeApprove(_yv, MAX_UINT);
    }

    function depositHook(
        address _collateral,
        bytes calldata data
    ) external override {
        (uint256 _minav3Crv, uint256 _minAsset) = abi.decode(data, (uint256,uint256));

        // Swap USDR to av3Crv
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(0, 1, _usdrBal, _minav3Crv, address(this));

        // Swap av3Crv to avAsset
        uint256 _avBal = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(tricryptoPOOL).exchange(0, _getTokenId(_collateral), _avBal, _minAsset);

        // Swap avAsset to Asset
        ILendingPool(AAVE_LENDING_POOL).withdraw(_toggleQiUnderlyingAsset(_collateral), MAX_UINT, address(this));

        // Swap Asset to qiAsset
        uint256 _assetBal = IERC20(_toggleQiUnderlyingAsset(_collateral)).balanceOf(address(this));
        IBenqiToken(_collateral).mint(_assetBal);

        // Deposit to LickHitter
        uint256 _colBal = IERC20(_collateral).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(_collateral, msg.sender, _colBal);
    }

    function repayHook(
        address _collateral,
        bytes calldata data
    ) external override {
        (uint256 _minav3Crv, uint256 _minUSDR) = abi.decode(data, (uint256,uint256));

        _swapAsset2USDR(_collateral, _minav3Crv, _minUSDR);

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
        (uint256 _minav3Crv, uint256 _minUSDR) = abi.decode(data, (uint256,uint256));

        _swapAsset2USDR(_collateral, _minav3Crv, _minUSDR);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapAsset2USDR(address _collateral, uint256 _minav3Crv, uint256 _minUSDR) internal {
        // Swap qiAsset to asset
        uint256 _qiBal = IERC20(_collateral).balanceOf(address(this));
        IBenqiToken(_collateral).redeem(_qiBal);
        
        // Swap asset to avAsset
        uint256 _colBal = IERC20(_toggleQiUnderlyingAsset(_collateral)).balanceOf(address(this));
        ILendingPool(AAVE_LENDING_POOL).deposit(_toggleQiUnderlyingAsset(_collateral), _colBal, address(this), 0);

        // Swap avAsset to av3Crv
        uint256 _avBal = IERC20(_toggleAaveUnderlyingAsset(_collateral)).balanceOf(address(this));
        ICurvePool(tricryptoPOOL).exchange(_getTokenId(_collateral), 0, _avBal, _minav3Crv);

        // Swap av3Crv to USDR
        uint256 _av3Bal = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(1, 0, _av3Bal, _minUSDR, address(this));
    }

    function _getTokenId(address _token) internal pure returns (uint256) {
        if (_token == qiETH) {
            return 2;
        } else if (_token == qiBTC) {
            return 1;
        } else {
            return 100; // error
        }
    }

    function _toggleQiUnderlyingAsset(address _asset) internal pure returns (address) {
        if (_asset == qiETH) {
            return wETH;
        } else if(_asset == qiBTC) {
            return wBTC;
        } else if (_asset == wETH) {
            return qiETH;
        } else if(_asset == wBTC) {
            return qiBTC;
        } else {
            return address(0); // error
        }
    }

    function _toggleAaveUnderlyingAsset(address _asset) internal pure returns (address) {
        if (_asset == avwETH) {
            return wETH;
        } else if(_asset == avwBTC) {
            return wBTC;
        } else if (_asset == qiETH) {
            return avwETH;
        } else if(_asset == qiBTC) {
            return avwBTC;
        } else {
            return address(0); // error
        }
    }
}
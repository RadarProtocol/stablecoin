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
import "./../../interfaces/benqi/IBenqiToken.sol";

contract BenqiCurveAaveUnderlyingSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;

    address private immutable USDR;
    address private immutable CURVE_USDR_av3Crv_POOL;

    address private constant av3Crv = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;
    address private constant av3Crv_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;

    address private constant DAI = 0xd586E7F844cEa2F87f50152665BCbc2C279D8d70;
    address private constant USDC = 0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664;
    address private constant USDT = 0xc7198437980c041c805A1EDcbA50c1Ce5db95118;

    address private constant qiDAI = 0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D;
    address private constant qiUSDC = 0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F;
    address private constant qiUSDT = 0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C;

    constructor(
        address _yv,
        address _usdr,
        address _usdrPool
    ) {
        yieldVault = _yv;
        USDR = _usdr;
        CURVE_USDR_av3Crv_POOL = _usdrPool;

        IERC20(_usdr).safeApprove(_usdrPool, MAX_UINT);
        IERC20(DAI).safeApprove(qiDAI, MAX_UINT);
        IERC20(USDC).safeApprove(qiUSDC, MAX_UINT);
        IERC20(USDT).safeApprove(qiUSDT, MAX_UINT);
        IERC20(qiDAI).safeApprove(_yv, MAX_UINT);
        IERC20(qiUSDC).safeApprove(_yv, MAX_UINT);
        IERC20(qiUSDT).safeApprove(_yv, MAX_UINT);

        IERC20(DAI).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(USDC).safeApprove(av3Crv_POOL, MAX_UINT);
        IERC20(USDT).safeApprove(av3Crv_POOL, MAX_UINT);
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

        // Swap av3Crv to asset
        uint256 _av3CrvBal = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(av3Crv_POOL).remove_liquidity_one_coin(_av3CrvBal, _getTokenId(_collateral), _minAsset, true);

        // Swap asset to qiAsset
        uint256 _assetBal = IERC20(_toggleQIUnderlying(_collateral)).balanceOf(address(this));
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

    function _swapAsset2USDR(address _token, uint256 _minav3Crv, uint256 _minUSDR) internal {
        uint256 _qiAssetBal = IERC20(_token).balanceOf(address(this));
        IBenqiToken(_token).redeem(_qiAssetBal);

        uint256 _assetBal = IERC20(_toggleQIUnderlying(_token)).balanceOf(address(this));
        ICurvePool(av3Crv_POOL).add_liquidity(_getAmounts(_token, _assetBal), _minav3Crv, true);

        uint256 _avBal = IERC20(av3Crv).balanceOf(address(this));
        ICurvePool(CURVE_USDR_av3Crv_POOL).exchange(1, 0, _avBal, _minUSDR, address(this));
    }

    function _getTokenId(address _token) internal pure returns (int128) {
        if  (_token == qiDAI) {
            return 0;
        } else if (_token == qiUSDC) {
            return 1;
        } else if (_token == qiUSDT) {
            return 2;
        } else {
            return 100; // Invalid
        }
    }

    function _toggleQIUnderlying(address _token) internal pure returns (address) {
        if  (_token == qiDAI) {
            return DAI;
        } else if (_token == qiUSDC) {
            return USDC;
        } else if (_token == qiUSDT) {
            return USDT;
        } else {
            return address(0); // Invalid
        }
    }

    function _getAmounts(address _token, uint256 _bal) internal pure returns (uint256[3] memory) {
        if  (_token == qiDAI) {
            return [_bal, 0, 0];
        } else if (_token == qiUSDC) {
            return [0, _bal, 0];
        } else if (_token == qiUSDT) {
            return [0, 0, _bal];
        } else {
            return [_bal, _bal, _bal]; // Invalid
        }
    }
}
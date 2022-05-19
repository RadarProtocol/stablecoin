// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "./../interfaces/IStrategy.sol";
import "./../interfaces/ILickHitter.sol";
import "./../interfaces/convex/IConvex.sol";
import "./../interfaces/convex/IConvexRewards.sol";
import "./../interfaces/curve/ICurvePool.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract ConvexCurveLPStrategy is IStrategy {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;
    address private constant CONVEX = 0xF403C135812408BFbE8713b5A23a04b3D48AAE31;

    address private constant CRV = 0xD533a949740bb3306d119CC777fa900bA034cd52;
    address private constant CVX = 0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B;
    address private constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address private constant CRV3 = 0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;
    address payable private constant CRV_ETH_POOL = payable(0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511);
    address payable private constant CVX_ETH_POOL = payable(0xB576491F1E6e5E62f1d8F26062Ee822B40B0E0d4);
    address payable private constant TRICRYPTO_POOL = payable(0xD51a44d3FaE010294C616388b506AcdA1bfAAE46);
    address private constant CRV3_POOL = 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;

    mapping(address => uint256) private cvxPoolIds;
    mapping(address => CurvePoolType) private poolTypes;
    mapping(address => address) private curvePools;

    uint256 private minHarvestCRVAmount;

    enum CurvePoolType {
        USDMetapool,
        ETH,
        USDDirectUnderlying
    }

    modifier onlyLickHitter {
        require(msg.sender == yieldVault, "Unauthorized");
        _;
    }

    modifier onlyOwner {
        address _owner = ILickHitter(yieldVault).getOwner();
        require(msg.sender == _owner, "Unauthorized");
        _;
    }

    modifier requireSupportedToken(address _token) {
        require(_stoken(_token), "Unsupported token");
        _;
    }

    constructor(
        address _yieldVault,
        address[] memory _tokens,
        uint256[] memory _pids,
        CurvePoolType[] memory _poolTypes,
        address[] memory _crvPools,
        uint256 _minHarvestCRVAmount
    ) {
        yieldVault = _yieldVault;
        require(_tokens.length == _pids.length && _pids.length == _poolTypes.length && _poolTypes.length == _crvPools.length, "Invalid data");
        for(uint8 i = 0; i < _tokens.length; i++) {
            cvxPoolIds[_tokens[i]] = _pids[i];
            poolTypes[_tokens[i]] = _poolTypes[i];
            curvePools[_tokens[i]] = _crvPools[i];
            IERC20(_tokens[i]).safeApprove(CONVEX, MAX_UINT);
            _swappersPoolApprove(_poolTypes[i], _crvPools[i], false);
        }
        minHarvestCRVAmount = _minHarvestCRVAmount;

        IERC20(CRV).safeApprove(CRV_ETH_POOL, MAX_UINT);
        IERC20(CVX).safeApprove(CVX_ETH_POOL, MAX_UINT);
        IERC20(USDT).safeApprove(CRV3_POOL, MAX_UINT);
    }

    // Owner functions

    function updatePid(address _token, uint256 _pid, CurvePoolType _pt, address _crvPool) external onlyOwner {
        cvxPoolIds[_token] = _pid;
        poolTypes[_token] = _pt;
        curvePools[_token] = _crvPool;
        _swappersPoolApprove(_pt, _crvPool, true);
        IERC20(_token).safeApprove(CONVEX, 0);
        IERC20(_token).safeApprove(CONVEX, MAX_UINT);
    }

    function updateMinCRVHarvestAmount(uint256 _newAmt) external onlyOwner {
        minHarvestCRVAmount = _newAmt;
    }

    // Withdraw any other blocked assets
    function withdrawBlockedAssets(address _asset, address _to, uint256 _amt) external onlyOwner {
        require(_asset != CRV && _asset != CVX, "Illegal Asset");
        IERC20(_asset).transfer(_to, _amt);
    }

    // Strategy functions

    function depositToStrategy(
        address _token,
        uint256 _amount
    ) external override onlyLickHitter requireSupportedToken(_token) {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        _deposit(_token);
    }

    function withdrawFromStrategy(
        address _token,
        uint256 _amount
    ) external override onlyLickHitter requireSupportedToken(_token) {
        IConvex.PoolInfo memory _pi = _getPoolInfo(_token);

        IConvexRewards(_pi.crvRewards).withdrawAndUnwrap(_amount, false);
        IERC20(_token).safeTransfer(yieldVault, _amount);
    }

    function exit(
        address _token
    ) external override onlyLickHitter requireSupportedToken(_token) {
        IConvex.PoolInfo memory _pi = _getPoolInfo(_token);
        address _rewards = _pi.crvRewards;

        uint256 _bal = IConvexRewards(_rewards).balanceOf(address(this));
        IConvexRewards(_rewards).withdrawAndUnwrap(_bal, false); // exit, don't claim rewards

        uint256 _tBal = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(yieldVault, _tBal);
    }

    function harvest(
        address _token
    ) external override onlyLickHitter requireSupportedToken(_token) {
        // Claim Rewards
        IConvex.PoolInfo memory _pi = _getPoolInfo(_token);
        CurvePoolType _pt = poolTypes[_token];
        IConvexRewards(_pi.crvRewards).getReward();

        if (_pt == CurvePoolType.USDMetapool) {

            // Rewards to ETH
            _rewards2ETH();

            // ETH to USDT
            _eth2USDT();

            // Deposit USDT to get 3Crv
            uint256 _usdtBal = IERC20(USDT).balanceOf(address(this));
            ICurvePool(CRV3_POOL).add_liquidity([0, 0, _usdtBal], 0);

            // Deposit 3Crv to get Curve LP Token
            uint256 _crv3Bal = IERC20(CRV3).balanceOf(address(this));
            ICurvePool(curvePools[_token]).add_liquidity([0, _crv3Bal], 0);

        } else if (_pt == CurvePoolType.ETH) {

            // Rewards to ETH
            _rewards2ETH();

            // Deposit ETH to get Curve LP Token
            ICurvePool(curvePools[_token]).add_liquidity{value: address(this).balance}([address(this).balance, 0], 0); // All ETH pools have ETH as coin0
        } else if(_pt == CurvePoolType.USDDirectUnderlying) {
            // Rewards to ETH
            _rewards2ETH();

            // ETH to USDT
            _eth2USDT();

            uint256 _usdtBal = IERC20(USDT).balanceOf(address(this));
            ICurvePool(curvePools[_token]).add_liquidity([0, 0, _usdtBal], 0, true);
        } else {
            revert("Invalid PT");
        }

        _deposit(_token);
    }

    // Internal functions

    function _swappersPoolApprove(CurvePoolType _pt, address _curvePool, bool _0ApproveFirst) internal {
        if (_pt == CurvePoolType.USDMetapool) {
            if (_0ApproveFirst) {
                IERC20(CRV3).safeApprove(_curvePool, 0);
            }
            IERC20(CRV3).safeApprove(_curvePool, MAX_UINT);
        } else if(_pt == CurvePoolType.USDDirectUnderlying) {
            if (_0ApproveFirst) {
                IERC20(USDT).safeApprove(_curvePool, 0);
            }
            IERC20(USDT).safeApprove(_curvePool, MAX_UINT);
        }
    }

    function _deposit(address _token) internal {
        uint256 _balance = IERC20(_token).balanceOf(address(this));
        IConvex(CONVEX).deposit(cvxPoolIds[_token], _balance, true);
    }

    function _eth2USDT() internal {
        ICurveTricryptoPool(TRICRYPTO_POOL).exchange{value: address(this).balance}(2, 0, address(this).balance, 0, true);
    }

    function _rewards2ETH() internal {
        uint256 _crvBal = IERC20(CRV).balanceOf(address(this));
        uint256 _cvxBal = IERC20(CVX).balanceOf(address(this));

        if (_crvBal != 0) {
            ICurveCrvCvxEthPool(CRV_ETH_POOL).exchange_underlying(1, 0, _crvBal, 0);
        }
        if (_cvxBal != 0) {
            ICurveCrvCvxEthPool(CVX_ETH_POOL).exchange_underlying(1, 0, _cvxBal, 0);
        }
    }

    function _getPoolInfo(address _token) internal view returns (IConvex.PoolInfo memory) {
        IConvex.PoolInfo memory _pi = IConvex(CONVEX).poolInfo(cvxPoolIds[_token]);
        return _pi;
    }

    function _stoken(address _token) internal view returns (bool) {
        IConvex.PoolInfo memory _pi = _getPoolInfo(_token);

        return (_pi.lptoken == _token);
    }

    // State Getters

    function invested(address _token) external view override requireSupportedToken(_token) returns (uint256) {
        // Get staked LP CRV token balance
        IConvex.PoolInfo memory _pid = _getPoolInfo(_token);
        uint256 _stakedLP = IConvexRewards(_pid.crvRewards).balanceOf(address(this));
        uint256 _cBal = IERC20(_token).balanceOf(address(this));

        return _stakedLP + _cBal;
    }

    function isLiquid(address, uint256) external pure override returns (bool) {
        // This strategy is always liquid
        return true;
    }

    function shouldHarvest(address _token) external view override requireSupportedToken(_token) returns (bool) {
        IConvex.PoolInfo memory _pid = _getPoolInfo(_token);
        uint256 _r = IConvexRewards(_pid.crvRewards).earned(address(this));

        return (_r >= minHarvestCRVAmount);
    }

    function getInvestor() external view override returns (address) {
        return yieldVault;
    }

    function getIsSupportedToken(address _token) external view override returns (bool) {
        return _stoken(_token);
    }

    receive() external payable {}
}
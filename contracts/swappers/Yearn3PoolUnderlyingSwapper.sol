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
import "./../interfaces/yearn/IYearnVaultV2.sol";
import "./../interfaces/ILickHitter.sol";

contract Yearn3PoolUnderlyingSwapper is ISwapper, ILiquidator {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable USDR;

    address private immutable DAI;
    address private immutable USDC;
    address private immutable USDT;

    address private immutable CURVE_USDR_3POOL;

    address private immutable yieldVault;

    mapping(address => int128) private CURVE_TOKEN_IDS;

    constructor(
        address _usdr,
        address _dai,
        address _usdc,
        address _usdt,
        address _curveUsdr,
        address _yv
    ) {
        USDR = _usdr;

        DAI = _dai;
        USDC = _usdc;
        USDT = _usdt;

        CURVE_USDR_3POOL = _curveUsdr;

        yieldVault = _yv;

        CURVE_TOKEN_IDS[_dai] = 1;
        CURVE_TOKEN_IDS[_usdc] = 2;
        CURVE_TOKEN_IDS[_usdt] = 3;
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

        IERC20(DAI).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDC).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDT).safeApprove(CURVE_USDR_3POOL, MAX_UINT);
        IERC20(USDR).safeApprove(yieldVault, MAX_UINT);
    }

    // Swap USDR to yv token
    function depositHook(
        address _collateral,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUnderlyingReceive) = abi.decode(data, (uint256));

        address _underlying = IYearnVaultV2(_collateral).token();
        int128 _tokenID = CURVE_TOKEN_IDS[_underlying];

        require(_tokenID > 0, "Invalid Asset");

        // Swap USDR to underlying
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(0, _tokenID, _usdrBal, _minUnderlyingReceive, address(this));

        // Swap underlying to yvTOKEN

        // Save on SSTORE opcode, so approve is not called everytime
        uint256 _receivedUnderlying = IERC20(_underlying).balanceOf(address(this));
        uint256 _allowance = IERC20(_underlying).allowance(address(this), _collateral);
        if (_allowance < _receivedUnderlying) {
            if (_allowance != 0) {
                IERC20(_underlying).safeApprove(_collateral, 0);
            }
            IERC20(_underlying).safeApprove(_collateral, MAX_UINT);
        }
        IYearnVaultV2(_collateral).deposit(_receivedUnderlying);

        // Deposit to LickHitter
        uint256 _myBal = IERC20(_collateral).balanceOf(address(this));
        uint256 _allowance2 = IERC20(_collateral).allowance(address(this), yieldVault);
        if (_allowance2 < _myBal) {
            if (_allowance2 != 0) {
                IERC20(_collateral).safeApprove(yieldVault, 0);
            }
            IERC20(_collateral).safeApprove(yieldVault, MAX_UINT);
        }
        ILickHitter(yieldVault).deposit(_collateral, msg.sender, _myBal);
    }

    // Swap yv token to USDR
    function repayHook(
        address _collateral,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDRReceive) = abi.decode(data, (uint256));

        _swapyv2USDR(_collateral, _minUSDRReceive);

        // Deposit to LickHitter
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        ILickHitter(yieldVault).deposit(USDR, msg.sender, _usdrBal);
    }

    // Swap yv token to USDR
    function liquidateHook(
        address _collateral,
        address _initiator,
        uint256 _repayAmount,
        uint256,
        bytes calldata data
    ) external override checkAllowance {
        (uint256 _minUSDRReceive) = abi.decode(data, (uint256));

        _swapyv2USDR(_collateral, _minUSDRReceive);

        ILickHitter(yieldVault).deposit(USDR, msg.sender, _repayAmount);

        // Profit goes to initiator
        uint256 _usdrBal = IERC20(USDR).balanceOf(address(this));
        IERC20(USDR).transfer(_initiator, _usdrBal);
    }

    function _swapyv2USDR(address _collateral, uint256 _minUSDR) internal {
        // Swap yv token to underlying
        uint256 _receivedUnderlying = IYearnVaultV2(_collateral).withdraw();

        address _underlying = IYearnVaultV2(_collateral).token();
        int128 _tokenID = CURVE_TOKEN_IDS[_underlying];

        require(_tokenID > 0, "Invalid Asset");

        // Swap underlying to USDR
        ICurvePool(CURVE_USDR_3POOL).exchange_underlying(_tokenID, 0, _receivedUnderlying, _minUSDR, address(this));
    }
}
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

import "./../../interfaces/IStrategy.sol";
import "./../../interfaces/ILickHitter.sol";
import "./../../interfaces/curve/ICurveGauge.sol";
import "./../../interfaces/curve/ICurvePool.sol";
import "./../../interfaces/traderjoe/IJoeRouter02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CurveLPAvalancheStrategy is IStrategy {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private yieldVault;

    address private constant CRV = 0x47536F17F4fF30e64A96a7555826b8f9e66ec468;
    address private constant WAVAX = 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7;
    address private constant DAI = 0xd586E7F844cEa2F87f50152665BCbc2C279D8d70;
    address private constant JOE_ROUTER = 0x60aE616a2155Ee3d9A68541Ba4544862310933d4;

    address private constant av3CRV = 0x1337BedC9D22ecbe766dF105c9623922A27963EC;
    address private constant av3CRV_GAUGE = 0x5B5CFE992AdAC0C9D48E05854B2d91C73a003858;
    address private constant av3CRV_POOL = 0x7f90122BF0700F9E7e1F688fe926940E8839F353;
    address private constant crvUSDBTCETH = 0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828;
    address private constant crvUSDBTCETH_GAUGE = 0x445FE580eF8d70FF569aB36e80c647af338db351;
    address private constant crvUSDBTCETH_POOL = 0xB755B949C126C04e0348DD881a5cF55d424742B2;

    mapping(address => address) private minHarvestRewardToken;
    mapping(address => uint256) private minHarvestRewardAmount;

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
        address _yv,
        address[2] memory _minHarvestRewardTokens,
        uint256[2] memory _minHarvestRewardAmounts
    ) {
        yieldVault = _yv;

        minHarvestRewardToken[av3CRV] = _minHarvestRewardTokens[0];
        minHarvestRewardToken[crvUSDBTCETH] = _minHarvestRewardTokens[1];

        minHarvestRewardAmount[av3CRV] = _minHarvestRewardAmounts[0];
        minHarvestRewardAmount[crvUSDBTCETH] = _minHarvestRewardAmounts[1];
        
        IERC20(CRV).safeApprove(JOE_ROUTER, MAX_UINT);
        IERC20(WAVAX).safeApprove(JOE_ROUTER, MAX_UINT);
        _doApprove(av3CRV, av3CRV_GAUGE, false);
        _doApprove(crvUSDBTCETH, crvUSDBTCETH_GAUGE, false);
        IERC20(DAI).safeApprove(av3CRV_POOL, MAX_UINT);
        IERC20(av3CRV).safeApprove(crvUSDBTCETH_POOL, MAX_UINT);
    }

    // Owner functions

    function updateMinHarvest(
        address _token,
        address _rewardToken,
        uint256 _amount
    ) external onlyOwner {
        minHarvestRewardToken[_token] = _rewardToken;
        minHarvestRewardAmount[_token] = _amount;
    }

    // Withdraw any other blocked assets
    function withdrawBlockedAssets(address _asset, address _to, uint256 _amt) external onlyOwner {
        require(_asset != CRV && _asset != WAVAX && _asset != av3CRV && _asset != crvUSDBTCETH, "Illegal Asset");
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
        ICurveFi_Gauge(_getGauge(_token)).withdraw(_amount);
        IERC20(_token).safeTransfer(yieldVault, _amount);
    }

    function exit(address _token) external override onlyLickHitter requireSupportedToken(_token) {
        uint256 _tBal = ICurveFi_Gauge(_getGauge(_token)).balanceOf(address(this));
        ICurveFi_Gauge(_getGauge(_token)).withdraw(_tBal);

        uint256 _myBal = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(yieldVault, _myBal);
    }

    function harvest(address _token) external override onlyLickHitter requireSupportedToken(_token) {
        ICurveFi_Gauge(_getGauge(_token)).claim_rewards(address(this), address(this));
        _CRV2WAVAX();
        _WAVAX2DAI();
        uint256 _daiBal = IERC20(DAI).balanceOf(address(this));
        if (_daiBal > 0) {
            IAvalancheCurvePool(av3CRV_POOL).add_liquidity([_daiBal, 0, 0], 0, true);
        }

        if (_token == crvUSDBTCETH) {
            uint256 _lpBal = IERC20(av3CRV).balanceOf(address(this));
            if (_lpBal > 0) {
                IAvalancheCurvePool(crvUSDBTCETH_POOL).add_liquidity([_lpBal, 0, 0], 0);
            }
        }


        _deposit(_token);
    }

    // Internal functions

    function _CRV2WAVAX() internal {
        uint256 _crvBal = IERC20(CRV).balanceOf(address(this));

        if (_crvBal > 0) {
            address[] memory _path = new address[](2);
            _path[0] = CRV;
            _path[1] = WAVAX;

            IJoeRouter02(JOE_ROUTER).swapExactTokensForTokens(
                _crvBal,
                0,
                _path,
                address(this),
                block.timestamp+1
            );
        }
    }

    function _WAVAX2DAI() internal {
        uint256 _avaxBal = IERC20(WAVAX).balanceOf(address(this));

        if(_avaxBal > 0) {
            address[] memory _path = new address[](2);
            _path[0] = WAVAX;
            _path[1] = DAI;
            
            IJoeRouter02(JOE_ROUTER).swapExactTokensForTokens(
                _avaxBal,
                0,
                _path,
                address(this),
                block.timestamp+1
            );
        }
    }

    function _deposit(address _token) internal {
        uint256 _bal = IERC20(_token).balanceOf(address(this));
        if (_bal > 0) {
            ICurveFi_Gauge(_getGauge(_token)).deposit(_bal);
        }
    }

    function _getGauge(address _token) internal pure returns (address) {
        if (_token == av3CRV) {
            return av3CRV_GAUGE;
        } else if (_token == crvUSDBTCETH) {
            return crvUSDBTCETH_GAUGE;
        } else {
            return address(0);
        }
    }

    function _doApprove(address _token, address _gauge, bool _0ApproveFirst) internal {
        if(_0ApproveFirst) {
            IERC20(_token).safeApprove(_gauge, 0);
        }
        IERC20(_token).safeApprove(_gauge, MAX_UINT);
    }

    function _stoken(address _token) internal pure returns (bool) {
        return (_getGauge(_token) != address(0));
    }

    // State Getters

    function getInvestor() external view override returns (address) {
        return yieldVault;
    }

    function getIsSupportedToken(address _token) external pure override returns (bool) {
        return _stoken(_token);
    }

    function isLiquid(address, uint256) external pure override returns (bool) {
        // This strategy is always liquid
        return true;
    }

    function invested(address _token) external view override requireSupportedToken(_token) returns (uint256) {
        uint256 _myBal = IERC20(_token).balanceOf(address(this));
        uint256 _invested = ICurveFi_Gauge(_getGauge(_token)).balanceOf(address(this));

        return _myBal + _invested;
    }

    function shouldHarvest(address _token) external view override requireSupportedToken(_token) returns (bool) {
        uint256 _claimableRewards = ICurveFi_Gauge(_getGauge(_token)).claimable_reward(address(this), minHarvestRewardToken[_token]);

        return (_claimableRewards >= minHarvestRewardAmount[_token]);
    }
}
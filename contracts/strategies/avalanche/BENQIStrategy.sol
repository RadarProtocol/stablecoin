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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../../interfaces/traderjoe/IJoeRouter02.sol";
import "./../../interfaces/benqi/IBenqiToken.sol";
import "./../../interfaces/benqi/IBenqiComptroller.sol";
import "./../../interfaces/IWETH.sol";

contract BENQIStrategy is IStrategy {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;
    uint256 constant DUST = 10**15;

    mapping(address => address) private benqiTokens;
    address private yieldVault;

    address payable private constant JOE_ROUTER = payable(0x60aE616a2155Ee3d9A68541Ba4544862310933d4);
    address payable private constant PANGOLIN_ROUTER = payable(0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106);
    address private constant QI = 0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5;
    address private constant BENQI_COMPTROLLER = 0x486Af39519B4Dc9a7fCcd318217352830E8AD9b4;
    address payable private constant WAVAX = payable(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);

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
        address[] memory _tokens,
        address[] memory _bTokens
    ) {
        require(_tokens.length == _bTokens.length, "Invalid Data");
        yieldVault = _yv;
        for(uint8 i = 0; i < _tokens.length; i++) {
            benqiTokens[_tokens[i]] = _bTokens[i];
            _doApprove(_tokens[i], _bTokens[i], false);
        }

        _doApprove(QI, PANGOLIN_ROUTER, false);
    }

    // Owner functions

    function editToken(address _token, address _bToken) external onlyOwner {
        benqiTokens[_token] = _bToken;
        if (_bToken != address(0)) {
            _doApprove(_token, _bToken, true);
        }
    }

    function withdrawBlockedAssets(address _asset, address _to, uint256 _amt) external onlyOwner {
        require(benqiTokens[_asset] == address(0), "Illegal Asset");
        IERC20(_asset).transfer(_to, _amt);
    }

    // Strategy functions

    function depositToStrategy(
        address _token,
        uint256 _amount
    ) external override onlyLickHitter requireSupportedToken(_token) {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        if (_token == WAVAX) {
            uint256 _bal = IERC20(WAVAX).balanceOf(address(this));
            _unwrapAvax(_bal);
        }

        _deposit(_token);
    }

    function withdrawFromStrategy(
        address _token,
        uint256 _amount
    ) external override onlyLickHitter requireSupportedToken(_token) {
        IBenqiToken(benqiTokens[_token]).redeemUnderlying(_amount);
        if (_token == WAVAX) {
            _wrapAvax(_amount);
        }

        IERC20(_token).safeTransfer(yieldVault, _amount);
    }

    function exit(
        address _token
    ) external override onlyLickHitter requireSupportedToken(_token) {
        uint256 _bal = IERC20(benqiTokens[_token]).balanceOf(address(this));
        IBenqiToken(benqiTokens[_token]).redeem(_bal);
        
        if (_token == WAVAX) {
            _wrapAvax(address(this).balance);
        }
        uint256 _underlyingBal = IERC20(_token).balanceOf(address(this));
        IERC20(_token).safeTransfer(yieldVault, _underlyingBal);
    }

    function harvest(
        address _token
    ) external override onlyLickHitter requireSupportedToken(_token) {
        address[] memory _claim = new address[](1);
        _claim[0] = benqiTokens[_token];

        IBenqiComptroller(BENQI_COMPTROLLER).claimReward(0, payable(address(this)), _claim);
        IBenqiComptroller(BENQI_COMPTROLLER).claimReward(1, payable(address(this)), _claim);

        _QI2AVAX();

        if (_token != WAVAX) {
            _AVAX2TOKEN(_token);
        }
        _deposit(_token);
    }

    // Internal functions

    function _QI2AVAX() internal {
        uint256 _qiBal = IERC20(QI).balanceOf(address(this));
        if (_qiBal > DUST) {
            address[] memory _path = new address[](2);
            _path[0] = QI;
            _path[1] = WAVAX;
            
            IJoeRouter02(PANGOLIN_ROUTER).swapExactTokensForAVAX(
                _qiBal,
                0,
                _path,
                address(this),
                block.timestamp + 1
            );
        }
    }

    function _AVAX2TOKEN(address _token) internal {
        if (address(this).balance > DUST) {
            address[] memory _path = new address[](2);
            _path[0] = WAVAX;
            _path[1] = _token;
            
            IJoeRouter02(PANGOLIN_ROUTER).swapExactAVAXForTokens{value: address(this).balance}(
                0,
                _path,
                address(this),
                block.timestamp + 1
            );
        }
    }

    function _doApprove(address _token, address _bToken, bool _0ApproveFirst) internal {
        if (_token != WAVAX) {
            if(_0ApproveFirst) {
                IERC20(_token).safeApprove(_bToken, 0);
            }
            IERC20(_token).safeApprove(_bToken, MAX_UINT);
        }
    }

    function _deposit(address _token) internal {
        if (_token == WAVAX) {
            IBenqiAvax(benqiTokens[_token]).mint{value: address(this).balance}();
        } else {
            uint256 _bal = IERC20(_token).balanceOf(address(this));
            IBenqiToken(benqiTokens[_token]).mint(_bal);
        }
    }

    function _unwrapAvax(uint256 _amt) internal {
        IWETH9(WAVAX).withdraw(_amt);
    }

    function _wrapAvax(uint256 _amt) internal {
        IWETH9(WAVAX).deposit{value: _amt}();
    }

    function _stoken(address _token) internal view returns (bool) {
        return (benqiTokens[_token] != address(0));
    }

    // State Getters

    function getInvestor() external view override returns (address) {
        return yieldVault;
    }

    function getIsSupportedToken(address _token) external view override returns (bool) {
        return _stoken(_token);
    }

    function isLiquid(address, uint256) external pure override returns (bool) {
        // This strategy is always liquid
        return true;
    }

    function invested(address _token) external view override requireSupportedToken(_token) returns (uint256) {
        uint256 _myBal = IERC20(_token).balanceOf(address(this));
        uint256 _bBal = IERC20(benqiTokens[_token]).balanceOf(address(this));
        uint256 _ers = IBenqiToken(benqiTokens[_token]).exchangeRateStored();

        return (_myBal + ((_bBal * _ers) / 10**18));
    }

    function shouldHarvest(address) external pure override returns (bool) {
        // always harvest, will save gas if reward is 0
        return true;
    }

    receive() external payable {}
}
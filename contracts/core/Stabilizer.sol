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

import "./../interfaces/IRadarUSD.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/ILickHitter.sol";

contract Stabilizer {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_UINT = 2**256 - 1;

    address private pokeMe;
    address private immutable USDR;

    uint256 private constant GENERAL_DIVISOR = 10000;
    uint256 public MINT_FEE;
    uint256 public BURN_FEE;

    address private FEE_RECEIVER;
    address private yieldVault;

    mapping(address => bool) public supportedTokens;
    mapping(address => uint8) private tokenDecimals;
    mapping(address => uint256) private accumulatedFees;

    event USDRMinted(address indexed user, uint256 amount);
    event USDRBurned(address indexed user, uint256 amount);

    modifier onlyOwner {
        address _owner = IRadarUSD(USDR).owner();
        require(msg.sender == _owner, "Unauthorized");
        _;
    }

    modifier onlyPokeMe {
        address _owner = IRadarUSD(USDR).owner();
        require(msg.sender == _owner || msg.sender == pokeMe, "Unauthorized");
        _;
    }

    modifier requireSupportedToken(address _t) {
        require(supportedTokens[_t], "Token not supported");
        _;
    }

    constructor(
        address _usdr,
        address _pokeMe,
        address[] memory _tokens,
        uint256 _mf,
        uint256 _bf,
        address _fr,
        address _yv
    ) {
        USDR = _usdr;
        pokeMe = _pokeMe;
        MINT_FEE = _mf;
        BURN_FEE = _bf;
        FEE_RECEIVER = _fr;
        yieldVault = _yv;
        for(uint8 i = 0; i < _tokens.length; i++) {
            supportedTokens[_tokens[i]] = true;
            tokenDecimals[_tokens[i]] = IERC20Metadata(_tokens[i]).decimals();
        }
    }

    // Owner functions

    function changePokeMe(address _newPM) external onlyOwner {
        pokeMe = _newPM;
    }

    function addSupportedToken(address _token) external onlyOwner {
        supportedTokens[_token] = true;
        tokenDecimals[_token] = IERC20Metadata(_token).decimals();
    }

    function removeSupportedToken(address _token) external onlyOwner {
        supportedTokens[_token] = false;
    }

    function changeFees(uint256 _mf, uint256 _bf, address _fr) external onlyOwner {
        MINT_FEE = _mf;
        BURN_FEE = _bf;
        FEE_RECEIVER = _fr;
    }

    function changeYieldVault(address _newYV) external onlyOwner {
        yieldVault = _newYV;
    }

    function withdrawAllFromYieldFarming(address _token, uint256 _shares) external onlyOwner {
        ILickHitter(yieldVault).withdraw(_token, address(this), _shares);
    }

    // PokeMe functions

    function depositToYieldFarming(address _token, uint256 _tokenAmount) external onlyPokeMe requireSupportedToken(_token) {
        _checkAllowanceAndApprove(_token, yieldVault, _tokenAmount);
        ILickHitter(yieldVault).deposit(_token, address(this), _tokenAmount);
    }

    function claimFees(address _token) external onlyPokeMe requireSupportedToken(_token) {
        _withdrawIfNeeded(_token, accumulatedFees[_token]);
        IERC20(_token).safeTransfer(FEE_RECEIVER, accumulatedFees[_token]);
        accumulatedFees[_token] = 0;
    }

    // User functions

    function mint(
        address _token,
        uint256 _amount
    ) external requireSupportedToken(_token) {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 _fee = (_amount * MINT_FEE) / GENERAL_DIVISOR;
        accumulatedFees[_token] = accumulatedFees[_token] + _fee;
        uint256 _scaledAmount = (_amount - _fee) * (10**(18-tokenDecimals[_token]));

        IRadarUSD(USDR).mint(msg.sender, _scaledAmount);

        emit USDRMinted(msg.sender, _scaledAmount);
    }

    function burn(
        address _token,
        uint256 _amount,
        bytes calldata _permitData
    ) external requireSupportedToken(_token) {
        // Scale amount
        uint256 _scaledAmount = _amount / 10**(18-tokenDecimals[_token]);
        uint256 _fee = (_scaledAmount * BURN_FEE) / GENERAL_DIVISOR;
        uint256 _sendAmount = _scaledAmount - _fee;

        accumulatedFees[_token] = accumulatedFees[_token] + _fee;
        require(_sendAmount <= _availableForBurning(_token), "Not enough tokens");

        if (_permitData.length > 0) {
            _permitApprove(_permitData);
        }
        IERC20(USDR).safeTransferFrom(msg.sender, address(this), _amount);
        IRadarUSD(USDR).burn(_amount);

        _withdrawIfNeeded(_token, _sendAmount);
        IERC20(_token).safeTransfer(msg.sender, _sendAmount);

        emit USDRBurned(msg.sender, _amount);
    }

    // Internal functions

    function _withdrawIfNeeded(address _token, uint256 _sendAmount) internal {
        uint256 _contractBalance = IERC20(_token).balanceOf(address(this));
        if (_sendAmount > _contractBalance) {
            uint256 _withdrawAmt;
            unchecked {
                _withdrawAmt = _sendAmount - _contractBalance;
            }
            uint256 _shares = ILickHitter(yieldVault).convertShares(_token, 0, _withdrawAmt);
            ILickHitter(yieldVault).withdraw(_token, address(this), _shares);
        }
    }

    function _permitApprove(bytes calldata _permitData) internal {
        (address _owner, address _spender, uint _value, uint _deadline, uint8 _v, bytes32 _r, bytes32 _s) = abi.decode(_permitData, (address,address,uint,uint,uint8,bytes32,bytes32));
        IRadarUSD(USDR).permit(_owner, _spender, _value, _deadline, _v, _r, _s);
    }

    function _checkAllowanceAndApprove(
        address _asset,
        address _spender,
        uint256 _amt
    ) internal {
        if (IERC20(_asset).allowance(address(this), _spender) < _amt) {
            IERC20(_asset).safeApprove(_spender, MAX_UINT);
        }
    }

    function _yfInvested(address _t) internal view returns (uint256) {
        uint256 _myS = ILickHitter(yieldVault).balanceOf(_t, address(this));
        return ILickHitter(yieldVault).convertShares(_t, _myS, 0);
    }

    function _availableForBurning(address _token) internal view returns (uint256) {
        uint256 _myBal = IERC20(_token).balanceOf(address(this));
        return _myBal + _yfInvested(_token) - accumulatedFees[_token];
    }

    // State Getters

    function availableForBurning(address _token) external view requireSupportedToken(_token) returns (uint256) {
        return _availableForBurning(_token);
    }

    function getAccumulatedFees(address _token) external view returns (uint256) {
        return accumulatedFees[_token];
    }
}
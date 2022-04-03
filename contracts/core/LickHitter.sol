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
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../interfaces/IStrategy.sol";

/// @title LickHitter
/// @author Tudor Gheorghiu (tudor@radar.global)
/// @notice This acts as a yield farming vault
/// which supports multiple assets and a yield farming
/// strategy for each asset. It keeps collateral from
/// `LendingPair`s to earn yield.
contract LickHitter {
    using SafeERC20 for IERC20;

    // Share balances (for each token)
    mapping(address => mapping(address => uint256)) private balances;
    // Total share supply for each token
    mapping(address => uint256) private totalShareSupply;

    // Token to yield strategy
    mapping(address => address) private strategies;

    // Supported tokens
    mapping(address => bool) private supportedTokens;

    uint256 private constant DUST = 10**10;
    
    // How many tokens should stay inside the Yield Vault at any time
    mapping(address => uint256) private bufferSize;

    address private owner;
    address private pendingOwner;
    address private pokeMe;


    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event StrategyAdded(address indexed token, address indexed strategy);
    event StrategyRemoved(address indexed token);

    event ShareTransfer(address indexed token, address indexed from, address indexed to, uint256 amount);

    event TokenAdded(address indexed token, uint256 bufferSize);
    event TokenRemoved(address indexed token);

    event Deposit(address indexed token, address indexed payer, address indexed receiver, uint256 amount, uint256 sharesMinted);
    event Withdraw(address indexed token, address indexed payer, address indexed receiver, uint256 amount, uint256 sharesBurned);

    modifier onlyOwner {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    modifier onlyPokeMe {
        require(msg.sender == owner || msg.sender == pokeMe, "Unauthorized");
        _;
    }

    constructor(address _pokeMe) {
        owner = msg.sender;
        pokeMe = _pokeMe;

        emit OwnershipTransferred(address(0), msg.sender);
    }

    // Owner Functions

    function changePokeMe(address _newPokeMe) external onlyOwner {
        pokeMe = _newPokeMe;
    }

    function changeBufferAmount(address _token, uint256 _newBuf) external onlyOwner {
        require(supportedTokens[_token], "Token not supported");
        bufferSize[_token] = _newBuf;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        pendingOwner = _newOwner;
    }

    function claimOwnership() external {
        require(msg.sender == pendingOwner, "Unauthorized");

        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    function addStrategy(address _token, address _strategy) external onlyOwner {
        require(IStrategy(_strategy).getIsSupportedToken(_token) && supportedTokens[_token], "Token not supported");

        strategies[_token] = _strategy;
        emit StrategyAdded(_token, _strategy);
    }

    function removeStrategy(address _token) external onlyOwner {
        strategies[_token] = address(0);
        emit StrategyRemoved(_token);
    }

    function emptyStrategy(address _token) external onlyOwner {
        // Withdraw all funds from strategy (optional before strategy removal)
        address _strategy = strategies[_token];
        require(_strategy != address(0), "Strategy doesn't exist");
        IStrategy(_strategy).exit(_token);
    }

    function addSupportedToken(address _token, uint256 _bufferSize) external onlyOwner {
        require(!supportedTokens[_token], "Token already added");

        supportedTokens[_token] = true;
        bufferSize[_token] = _bufferSize;

        emit TokenAdded(_token, _bufferSize);
    }

    function removeSupportedToken(address _token) external onlyOwner {
        require(supportedTokens[_token], "Token not supported");

        // Check there are no balances
        require(_tokenTotalBalance(_token) <= DUST, "Token is active");

        supportedTokens[_token] = false;
        bufferSize[_token] = 0;

        emit TokenRemoved(_token);
    }

    // User functions

    /// @notice Transfers shares from the caller to another user
    /// @param _token Which token shares to transfer
    /// @param _to The address which will receive the shares
    /// @param _amount Amount of shares
    function transferShares(address _token, address _to, uint256 _amount) external {
        require(balances[_token][msg.sender] >= _amount, "Not enough shares");

        unchecked {
            balances[_token][msg.sender] = balances[_token][msg.sender] - _amount;
        }
        balances[_token][_to] = balances[_token][_to] + _amount;

        emit ShareTransfer(_token, msg.sender, _to, _amount);
    }

    // Deposits get called with token amount and
    // Withdrawals get called with shares amount.
    // If this is not what the user/contract interacting
    // with the IYV wants, the convertShares
    // function can be used

    /// @notice Deposit assets to the `LickHitter`. Caller must have `_token` allowance
    /// @param _token Token to deposit
    /// @param _destination Address which will receive the shares
    /// @param _amount Amount of `_token` to deposit
    /// @return The number of shares minted
    function deposit(address _token, address _destination, uint256 _amount) external returns (uint256) {
        return _deposit(_token, msg.sender, _destination, _amount);
    }

    /// @notice Withdraws assets from the `LickHitter`
    /// @param _token Token to withdraw
    /// @param _destination Address which will receive the `_token` assets
    /// @param _shares Amount of shares to withdraw
    /// @return The amount of `_token` that was withdrawn
    function withdraw(address _token, address _destination, uint256 _shares) external returns (uint256) {
        return _withdraw(_token, msg.sender, _destination, _shares);
    }

    // Bot functions (Gelato)

    /// @notice Deposits tokens to a yield strategy and harvests profits
    /// @dev Only the Gelato Network agent can call this.
    /// @param _token Which token to execute the strategy for
    function executeStrategy(address _token) external onlyPokeMe {
        address _strategy = strategies[_token];
        require(_strategy != address(0) && supportedTokens[_token], "Strategy doesn't exist");
        // TODO: Maybe use Gelato's check every block aka revert if harvesting is not needed. - https://github.com/RadarProtocol/stablecoin/issues/10
        require(IStrategy(_strategy).shouldHarvest(_token), "Cannot harvest");

        // Harvest strategy
        IStrategy(_strategy).harvest(_token);

        // Deposit to strategy
        uint256 _contractBalance = IERC20(_token).balanceOf(address(this));
        uint256 _bufferSize = bufferSize[_token];
        if (_contractBalance > _bufferSize) {
            uint256 _depositAmount;
            unchecked {
                _depositAmount = _contractBalance - _bufferSize;
            }
            IERC20(_token).safeApprove(_strategy, _depositAmount);
            IStrategy(_strategy).depositToStrategy(_token, _depositAmount);
        }
    }

    // Internal Functions

    function _deposit(address _token, address _payer, address _destination, uint256 _amount) internal returns (uint256) {
        require(supportedTokens[_token], "Token not supported");

        uint256 _sharesToMint = _convertShares(_token, 0, _amount);

        require(_sharesToMint != 0 && _amount != 0, "0 deposit invalid");

        IERC20(_token).safeTransferFrom(_payer, address(this), _amount);

        totalShareSupply[_token] = totalShareSupply[_token] + _sharesToMint;
        balances[_token][_destination] = balances[_token][_destination] + _sharesToMint;

        // Event
        emit Deposit(
            _token,
            _payer,
            _destination,
            _amount,
            _sharesToMint
        );

        return _sharesToMint;
    }

    function _withdraw(address _token, address _payer, address _destination, uint256 _shares) internal returns (uint256) {
        require(supportedTokens[_token], "Token not supported");

        uint256 _amount = _convertShares(_token, _shares, 0);

        require(_shares != 0 && _amount != 0, "0 withdraw invalid");
        require(balances[_token][_payer] >= _shares, "Not enough funds");

        totalShareSupply[_token] = totalShareSupply[_token] - _shares;
        unchecked {
            balances[_token][_payer] = balances[_token][_payer] - _shares;
        }

        uint256 _amountInVault = IERC20(_token).balanceOf(address(this));
        address _strategy = strategies[_token];
        if (_strategy != address(0)) {
            if (_amountInVault < _amount) {
                uint256 _amountToWithdraw = _amount - _amountInVault;

                // If we need to withdraw from the strategy, make sure it is liquid
                require(IStrategy(_strategy).isLiquid(_token, _amountToWithdraw), "Strategy not Liquid. Try again later.");
                IStrategy(_strategy).withdrawFromStrategy(_token, _amountToWithdraw);
            }
        }

        IERC20(_token).safeTransfer(_destination, _amount);

        // Event
        emit Withdraw(
            _token,
            _payer,
            _destination,
            _amount,
            _shares
        );

        return _amount;
    }

    function _tokenTotalBalance(address _token) internal view returns (uint256) {
        address _strategy = strategies[_token];
        uint256 _strategyBal = _strategy == address(0) ? 0 : IStrategy(_strategy).invested(_token);
        return IERC20(_token).balanceOf(address(this)) + _strategyBal;
    }

    function _convertShares(address _token, uint256 _shares, uint256 _amount) internal view returns (uint256) {
        if (_amount == 0 && _shares == 0) {
            return 0;
        } else if (_amount == 0) {
            // Convert shares to amount
            return totalShareSupply[_token] != 0 ? (_shares * _tokenTotalBalance(_token)) / totalShareSupply[_token] : _shares;
        } else if (_shares == 0) {
            // Convert amount to shares
            return totalShareSupply[_token] != 0 ? (_amount * totalShareSupply[_token]) / _tokenTotalBalance(_token) : _amount;
        } else {
            revert("Should never happen: dangerous");
        }
    }

    // State Getters

    /// @return The share balance of a certain token of a user
    /// @param _token Address of the token
    /// @param _owner Address of the user
    function balanceOf(address _token, address _owner) external view returns (uint256) {
        return balances[_token][_owner];
    }

    /// @return The balance of a certain token of a user (in `_token`, not shares)
    /// @param _token Address of the token
    /// @param _owner Address of the user
    function tokenBalanceOf(address _token, address _owner) external view returns (uint256) {
        return _convertShares(_token, balances[_token][_owner], 0);
    }

    /// @return The owner of this contract
    function getOwner() external view returns (address) {
        return owner;
    }

    /// @return The pending owner of this contract before accepting ownership
    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    /// @return The address of the strategy for a specific token
    /// @param _token Address of the token
    function getTokenStrategy(address _token) external view returns (address) {
        return strategies[_token];
    }

    /// @return Total share supply for a certain token
    /// @param _token Address of the token
    function getTotalShareSupply(address _token) external view returns (uint256) {
        return totalShareSupply[_token];
    }

    /// @return Total token amount deposited of a certain token
    /// @param _token Address of the token
    function getTotalInvested(address _token) external view returns (uint256) {
        return _tokenTotalBalance(_token);
    }

    /// @return Returns true/false if a certain token is supported
    /// @param _token Address of the token
    function getIsSupportedToken(address _token) external view returns (bool) {
        return supportedTokens[_token];
    }

    /// @notice Function to convert shares to how many tokens they are worth and vice-versa.
    /// @dev _shares and _amount should never both be bigger than `0` or both be equal to `0`
    /// @return Either shares or actual token amount, depending on how the user called this function
    /// @param _token Address of the token
    /// @param _shares Amount of shares to be converted to token amount. Should be `0` if caller wants to convert amount -> shares
    /// @param _amount Amount of actual token to be converted to shares. Should be `0` if caller wants to convert shares -> amount
    function convertShares(address _token, uint256 _shares, uint256 _amount) external view returns (uint256) {
        return _convertShares(_token, _shares, _amount);
    }
}
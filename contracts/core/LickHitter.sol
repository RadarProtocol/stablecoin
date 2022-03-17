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

    bytes32 immutable public DOMAIN_SEPARATOR;
    mapping(address => uint) public nonces;
    // keccak256("depositWithSignature(address _token,address _payer,address _destination,uint256 _amount,uint256 _nonce,uint256 _deadline)")
    bytes32 public constant DEPOSIT_TYPEHASH = 0xdc686105f6ae97f38e34e4c4868647b78a380867d04a091aef0ab56753e98e05;
    // keccak256("withdrawWithSignature(address _token,address _payer,address _destination,uint256 _shares,uint256 _nonce,uint256 _deadline)")
    bytes32 public constant WITHDRAW_TYPEHASH = 0x23f2fbd331ba1090a3899964ac2aaeb307de68f00182befe4f090a39f0d96bd9;


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

        // Build DOMAIN_SEPARATOR
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("LickHitter")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

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

    function transferShares(address _token, address _to, uint256 _amount) external {
        require(balances[_token][msg.sender] >= _amount, "Not enough shares");

        balances[_token][msg.sender] = balances[_token][msg.sender] - _amount;
        balances[_token][_to] = balances[_token][_to] + _amount;

        emit ShareTransfer(_token, msg.sender, _to, _amount);
    }

    // Deposits get called with token amount and
    // Withdrawals get called with shares amount.
    // If this is not what the user/contract interacting
    // with the IYV wants, the convertShares
    // function can be used

    function deposit(address _token, address _destination, uint256 _amount) external {
        _deposit(_token, msg.sender, _destination, _amount);
    }

    function depositWithSignature(
        address _token,
        address _payer,
        address _destination,
        uint256 _amount,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(_deadline >= block.timestamp, "EIP-712: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(DEPOSIT_TYPEHASH, _token, _payer, _destination, _amount, nonces[_payer]++, _deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, _v, _r, _s);
        require(recoveredAddress != address(0) && recoveredAddress == _payer, "EIP-712: INVALID_SIGNATURE");

        _deposit(_token, _payer, _destination, _amount);
    }

    function withdraw(address _token, address _destination, uint256 _shares) external {
        _withdraw(_token, msg.sender, _destination, _shares);
    }

    function withdrawWithSignature(
        address _token,
        address _payer,
        address _destination,
        uint256 _shares,
        uint256 _deadline,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) external {
        require(_deadline >= block.timestamp, "EIP-712: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(WITHDRAW_TYPEHASH, _token, _payer, _destination, _shares, nonces[_payer]++, _deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, _v, _r, _s);
        require(recoveredAddress != address(0) && recoveredAddress == _payer, "EIP-712: INVALID_SIGNATURE");

        _withdraw(_token, _payer, _destination, _shares);
    }

    // Bot functions (Gelato)

    function executeStrategy(address _token) external onlyPokeMe {
        address _strategy = strategies[_token];
        require(_strategy != address(0) && supportedTokens[_token], "Strategy doesn't exist");
        // TODO: Maybe use Gelato's check every block aka revert if harvesting is not needed.
        require(IStrategy(_strategy).shouldHarvest(_token), "Cannot harvest");

        // Harvest strategy
        IStrategy(_strategy).harvest(_token);

        // Deposit to strategy
        uint256 _contractBalance = IERC20(_token).balanceOf(address(this));
        uint256 _bufferSize = bufferSize[_token];
        if (_contractBalance > _bufferSize) {
            uint256 _depositAmount = _contractBalance - _bufferSize;
            IERC20(_token).safeApprove(_strategy, _depositAmount);
            IStrategy(_strategy).depositToStrategy(_token, _depositAmount);
        }
    }

    // Internal Functions

    function _deposit(address _token, address _payer, address _destination, uint256 _amount) internal {
        require(supportedTokens[_token], "Token not supported");

        // TODO: Test this is correct
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
    }

    function _withdraw(address _token, address _payer, address _destination, uint256 _shares) internal {
        require(supportedTokens[_token], "Token not supported");

        // TODO: Test this is correct
        uint256 _amount = _convertShares(_token, _shares, 0);

        require(_shares != 0 && _amount != 0, "0 withdraw invalid");
        require(balances[_token][_payer] >= _shares, "Not enough funds");

        totalShareSupply[_token] = totalShareSupply[_token] - _shares;
        balances[_token][_payer] = balances[_token][_payer] - _shares;

        uint256 _amountInVault = IERC20(_token).balanceOf(address(this));
        address _strategy = strategies[_token];
        if (_strategy != address(0)) {
            if (_amountInVault < _amount) {
                // TODO: Test this is correct
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
    }

    function _tokenTotalBalance(address _token) internal view returns (uint256) {
        address _strategy = strategies[_token];
        uint256 _strategyBal = _strategy == address(0) ? 0 : IStrategy(_strategy).invested(_token);
        return IERC20(_token).balanceOf(address(this)) + _strategyBal;
    }

    function _convertShares(address _token, uint256 _shares, uint256 _amount) internal view returns (uint256) {
        require((_shares == 0 || _amount == 0) && !(_shares == 0 && _amount == 0), "_shares OR _amount must be 0");
        if (_amount == 0) {
            // Convert shares to amount
            return totalShareSupply[_token] != 0 ? (_shares * _tokenTotalBalance(_token)) / totalShareSupply[_token] : _shares;
        }

        if (_shares == 0) {
            // Convert amount to shares
            return totalShareSupply[_token] != 0 ? (_amount * totalShareSupply[_token]) / _tokenTotalBalance(_token) : _amount;
        }
    }

    // State Getters

    function balanceOf(address _token, address _owner) external view returns (uint256) {
        return balances[_token][_owner];
    }

    function getOwner() external view returns (address) {
        return owner;
    }

    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    function getTokenStrategy(address _token) external view returns (address) {
        return strategies[_token];
    }

    function getTotalShareSupply(address _token) external view returns (uint256) {
        return totalShareSupply[_token];
    }

    function getTotalInvested(address _token) external view returns (uint256) {
        return _tokenTotalBalance(_token);
    }

    function getIsSupportedToken(address _token) external view returns (bool) {
        return supportedTokens[_token];
    }

    function convertShares(address _token, uint256 _shares, uint256 _amount) external view returns (uint256) {
        return _convertShares(_token, _shares, _amount);
    }
}
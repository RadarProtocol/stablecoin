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

interface ILickHitter {

    // TODO: Might not need this if tokens go through lending pair first
    // bytes32 immutable public DOMAIN_SEPARATOR;
    // mapping(address => uint) public nonces;
    // // keccak256("depositWithSignature(address _token,address _payer,address _destination,uint256 _amount,uint256 _nonce,uint256 _deadline)")
    // bytes32 public constant DEPOSIT_TYPEHASH = 0xdc686105f6ae97f38e34e4c4868647b78a380867d04a091aef0ab56753e98e05;
    // // keccak256("withdrawWithSignature(address _token,address _payer,address _destination,uint256 _shares,uint256 _nonce,uint256 _deadline)")
    // bytes32 public constant WITHDRAW_TYPEHASH = 0x23f2fbd331ba1090a3899964ac2aaeb307de68f00182befe4f090a39f0d96bd9;

    // Owner Functions

    function changePokeMe(address _newPokeMe) external;

    function changeBufferAmount(address _token, uint256 _newBuf) external;

    function transferOwnership(address _newOwner) external;

    function claimOwnership() external;

    function addStrategy(address _token, address _strategy) external;

    function removeStrategy(address _token) external;

    function emptyStrategy(address _token) external;

    function addSupportedToken(address _token, uint256 _bufferSize) external;

    function removeSupportedToken(address _token) external;

    // User functions

    function transferShares(address _token, address _to, uint256 _amount) external;

    // Deposits get called with token amount and
    // Withdrawals get called with shares amount.
    // If this is not what the user/contract interacting
    // with the IYV wants, the convertShares
    // function can be used

    function deposit(address _token, address _destination, uint256 _amount) external returns (uint256);

    // TODO: Might not need this if tokens go through lending pair first
    // function depositWithSignature(
    //     address _token,
    //     address _payer,
    //     address _destination,
    //     uint256 _amount,
    //     uint256 _deadline,
    //     uint8 _v,
    //     bytes32 _r,
    //     bytes32 _s
    // ) external {
    //     require(_deadline >= block.timestamp, "EIP-712: EXPIRED");
    //     bytes32 digest = keccak256(
    //         abi.encodePacked(
    //             "\x19\x01",
    //             DOMAIN_SEPARATOR,
    //             keccak256(abi.encode(DEPOSIT_TYPEHASH, _token, _payer, _destination, _amount, nonces[_payer]++, _deadline))
    //         )
    //     );
    //     address recoveredAddress = ecrecover(digest, _v, _r, _s);
    //     require(recoveredAddress != address(0) && recoveredAddress == _payer, "EIP-712: INVALID_SIGNATURE");

    //     _deposit(_token, _payer, _destination, _amount);
    // }

    function withdraw(address _token, address _destination, uint256 _shares) external returns (uint256);

    // TODO: Might not need this if tokens go through lending pair first
    // function withdrawWithSignature(
    //     address _token,
    //     address _payer,
    //     address _destination,
    //     uint256 _shares,
    //     uint256 _deadline,
    //     uint8 _v,
    //     bytes32 _r,
    //     bytes32 _s
    // ) external {
    //     require(_deadline >= block.timestamp, "EIP-712: EXPIRED");
    //     bytes32 digest = keccak256(
    //         abi.encodePacked(
    //             "\x19\x01",
    //             DOMAIN_SEPARATOR,
    //             keccak256(abi.encode(WITHDRAW_TYPEHASH, _token, _payer, _destination, _shares, nonces[_payer]++, _deadline))
    //         )
    //     );
    //     address recoveredAddress = ecrecover(digest, _v, _r, _s);
    //     require(recoveredAddress != address(0) && recoveredAddress == _payer, "EIP-712: INVALID_SIGNATURE");

    //     _withdraw(_token, _payer, _destination, _shares);
    // }

    // Bot functions (Gelato)

    function executeStrategy(address _token) external;

    // State Getters

    function balanceOf(address _token, address _owner) external view returns (uint256);

    function getOwner() external view returns (address);

    function getPendingOwner() external view returns (address);

    function getTokenStrategy(address _token) external view returns (address);

    function getTotalShareSupply(address _token) external view returns (uint256);

    function getTotalInvested(address _token) external view returns (uint256);

    function getIsSupportedToken(address _token) external view returns (bool);

    function convertShares(address _token, uint256 _shares, uint256 _amount) external view returns (uint256);
}
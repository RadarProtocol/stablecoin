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
pragma solidity ^0.8.0;

interface TheStableMoney {

    function owner() external view returns (address);
    function pendingOwner() external view returns (address);

    function minter(address) external view returns (bool);

    function DOMAIN_SEPARATOR() external view returns (bytes32);
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    function PERMIT_TYPEHASH() external pure returns (bytes32);

    function nonces(address) external view returns (uint);

    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // User functions

    // EIP-2612: permit() https://eips.ethereum.org/EIPS/eip-2612
    function permit(address _owner, address _spender, uint _value, uint _deadline, uint8 _v, bytes32 _r, bytes32 _s) external;

    function burn(uint256 _amount) external;

    // Minter functions

    function mint(address _to, uint256 _amount) external;

    // Owner Functions

    function addMinter(address _minter) external;

    function removeMinter(address _minter) external;

    function transferOwnership(address _newOwner) external;

    function claimOwnership() external;
}
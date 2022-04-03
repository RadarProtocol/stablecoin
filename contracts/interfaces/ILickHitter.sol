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

    function withdraw(address _token, address _destination, uint256 _shares) external returns (uint256);

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
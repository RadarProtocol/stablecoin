// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface IBenqiToken {
    function mint(uint mintAmount) external returns (uint);

    function redeem(uint redeemTokens) external returns (uint);

    function redeemUnderlying(uint redeemAmount) external returns (uint);

    function exchangeRateStored() external view returns (uint);
}

interface IBenqiAvax {
    function mint() external payable;

    function redeem(uint redeemTokens) external returns (uint);

    function redeemUnderlying(uint redeemAmount) external returns (uint);
}
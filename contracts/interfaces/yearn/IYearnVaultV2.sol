// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface IYearnVaultV2 {
    function pricePerShare() external view returns (uint256);
    function decimals() external view returns (uint8);
    function deposit(uint256) external returns (uint256);
    function withdraw() external returns (uint256);
}
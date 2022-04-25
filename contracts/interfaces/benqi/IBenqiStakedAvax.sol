// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface IBenqiStakedAvax {
    function totalSupply() external view returns (uint256);

    function totalPooledAvax() external view returns (uint256);
}
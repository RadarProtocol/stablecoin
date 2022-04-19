// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface IBenqiComptroller {
    function claimReward(uint8 rewardType, address payable holder, address[] memory qiTokens) external;
}
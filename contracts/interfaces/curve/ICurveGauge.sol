// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface ICurveFi_Gauge {
    function lp_token() external view returns (address);

    function crv_token() external view returns (address);

    function balanceOf(address addr) external view returns (uint);

    function deposit(uint _value) external;

    function withdraw(uint _value) external;

    function claimable_tokens(address addr) external returns (uint);

    function claimable_reward(address _addr, address _token) external view returns (uint256);

    function minter() external view returns (address); //use minter().mint(gauge_addr) to claim CRV

    function integrate_fraction(address _for) external view returns (uint);

    function user_checkpoint(address _for) external returns (bool);

    function claim_rewards(address,address) external;
}
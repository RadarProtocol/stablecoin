// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface ICurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external payable;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM, bool _use_underlying) external;
    function get_virtual_price() external view returns (uint256);
}
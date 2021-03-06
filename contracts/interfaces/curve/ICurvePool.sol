// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

interface ICurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256);
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external returns (uint256);
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external payable;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
    function add_liquidity(uint256[5] memory amounts, uint256 _min_mint_amount) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM, bool _use_underlying) external;
    function remove_liquidity(uint256 _amount, uint256[3] memory min_amounts) external;
    function get_virtual_price() external view returns (uint256);
}

interface IPayableCurvePool {
    function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external payable returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external payable returns (uint256);
    function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver, bool use_eth) external payable;
    function approve(address _spender, uint256 _value) external returns (bool);
    function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external payable;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM) external;
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM, bool _use_underlying) external;
    function get_virtual_price() external view returns (uint256);
}

interface ICurveCrvCvxEthPool {
    function exchange_underlying(uint256 i, uint256 j, uint256 dx, uint256 min_dy) external payable returns (uint256);
}

interface ICurveTricryptoPool {
    function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy, bool use_eth) external payable;
}

interface IAvalancheCurvePool {
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount) external;
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external returns (uint256);
}

interface IAvaxAv3CrvPool {
    function remove_liquidity_one_coin(uint256 _ta, int128 i, uint256 _minAM, bool _use_underlying) external returns (uint256);
    function add_liquidity(uint256[3] memory amounts, uint256 _min_mint_amount, bool _use_underlying) external returns (uint256);
}

interface IAvaxV2Pool {
    function remove_liquidity_one_coin(uint256 _ta, uint256 i, uint256 _minAM) external;
}
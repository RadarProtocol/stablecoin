// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "./../interfaces/IOracle.sol";

contract MockOracle is IOracle {
    uint256 private price;
    address private mockToken;

    constructor(address _token, uint256 _price) {
        mockToken = _token;
        price = _price;
    }

    function changePrice(uint256 _newPrice) external {
        price = _newPrice;
    }

    function getUSDPrice(address _token) external view override returns (uint256) {
        if (_token != mockToken) {
            return 0;
        }

        return price;
    }
}
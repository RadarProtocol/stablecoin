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

import "./../interfaces/IOracle.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract LendingOracleAggregator is IOracle {

    enum FeedType {
        ChainlinkDirect,
        ChainlinkETH
    }

    mapping(address => address) private feeds;
    mapping(address => uint8) private feedDecimals;
    mapping(address => FeedType) private feedTypes;
    address private chainlinkETHFeed;

    address private owner;
    address private pendingOwner;

    event FeedModified(
        address indexed token,
        address indexed feed,
        FeedType feedType,
        uint8 decimals
    );

    modifier onlyOwner {
        require(msg.sender == owner, "Unauthorized");
        _;
    }

    constructor(
        address[] memory _tokens,
        FeedType[] memory _feedTypes,
        address[] memory _feeds,
        uint8[] memory _feedDecimals,
        address _chainlinkETHFeed
    ) {
        owner = msg.sender;
        chainlinkETHFeed = _chainlinkETHFeed;
        require(_tokens.length == _feedTypes.length && _feedTypes.length == _feeds.length && _feeds.length == _feedDecimals.length, "Invalid Data");
        for(uint256 i = 0; i < _tokens.length; i++) {
            address _token = _tokens[i];
            feeds[_token] = _feeds[i];
            feedTypes[_token] = _feedTypes[i];
            feedDecimals[_token] = _feedDecimals[i];
            emit FeedModified(_token, _feeds[i], _feedTypes[i], _feedDecimals[i]);
        }
    }

    // Owner functions

    function editFeed(address _token, address _feed, FeedType _ft, uint8 _decs) external onlyOwner {
        feedTypes[_token] = _ft;
        feeds[_token] = _feed;
        feedDecimals[_token] = _decs;
        emit FeedModified(_token, _feed, _ft, _decs);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        pendingOwner = _newOwner;
    }

    function claimOwnership() external {
        require(msg.sender == pendingOwner, "Unauthorized");
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    // Oracle Aggregator

    function getUSDPrice(address _token) external view override returns (uint256) {
        address _feed = feeds[_token];
        FeedType _ft = feedTypes[_token];
        require(_feed != address(0), "Invalid Feed");

        if (_ft == FeedType.ChainlinkDirect) {
            (
                /*uint80 roundID*/,
                int price,
                /*uint startedAt*/,
                /*uint timeStamp*/,
                /*uint80 answeredInRound*/
            ) = AggregatorV3Interface(_feed).latestRoundData();

            require(price > 0, "Oracle failure");

            // Convert to 18 decimals
            if (feedDecimals[_token] == 18) {
                return uint256(price);
            } else {
                return uint256(price) * (10**(18 - feedDecimals[_token]));
            }
        } else if (_ft == FeedType.ChainlinkETH) {
            (
                /*uint80 roundID*/,
                int _ethPrice,
                /*uint startedAt*/,
                /*uint timeStamp*/,
                /*uint80 answeredInRound*/
            ) = AggregatorV3Interface(chainlinkETHFeed).latestRoundData();

            (
                /*uint80 roundID*/,
                int _ethValue,
                /*uint startedAt*/,
                /*uint timeStamp*/,
                /*uint80 answeredInRound*/
            ) = AggregatorV3Interface(_feed).latestRoundData();

            require(_ethValue > 0 && _ethPrice > 0, "Oracle failure");

            return uint256(_ethPrice * _ethValue) / (10**8);
        } else {
            revert("Dangerous Call");
        }
    }

    // State Getters
    
    function getOwner() external view returns (address) {
        return owner;
    }

    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    function getFeed(address _token) external view returns (address, FeedType, uint8) {
        return (feeds[_token], feedTypes[_token], feedDecimals[_token]);
    }
}
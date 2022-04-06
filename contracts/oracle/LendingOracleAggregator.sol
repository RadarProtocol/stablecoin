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
import "./../interfaces/yearn/IYearnVaultV2.sol";
import "./../interfaces/curve/ICurvePool.sol";

/// @title LendingOracleAggregator
/// @author Radar Global (tudor@radar.global)
/// @notice Oracle aggregator supporting multiple
/// oracle types. Used in `LendingPair`
contract LendingOracleAggregator is IOracle {

    enum FeedType {
        ChainlinkDirect,
        ChainlinkETH,
        ChainlinkYearnUnderlying,
        CurveLPVirtualPricePeggedAssets
    }

    mapping(address => address) private feeds;
    mapping(address => uint8) private feedDecimals;
    mapping(address => FeedType) private feedTypes;
    address private chainlinkETHFeed;

    mapping(address => bytes) private oracle_metadata;

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
        bytes[] memory _oracleMetadata,
        address _chainlinkETHFeed
    ) {
        owner = msg.sender;
        chainlinkETHFeed = _chainlinkETHFeed;
        require(_tokens.length == _feedTypes.length && _feedTypes.length == _feeds.length && _feeds.length == _feedDecimals.length && _feedDecimals.length == _oracleMetadata.length, "Invalid Data");
        for(uint256 i = 0; i < _tokens.length; i++) {
            address _token = _tokens[i];
            feeds[_token] = _feeds[i];
            feedTypes[_token] = _feedTypes[i];
            feedDecimals[_token] = _feedDecimals[i];
            if (_feedTypes[i] == FeedType.CurveLPVirtualPricePeggedAssets) {
                oracle_metadata[_token] = _oracleMetadata[i];
            }
            emit FeedModified(_token, _feeds[i], _feedTypes[i], _feedDecimals[i]);
        }
    }

    // Owner functions

    function editFeed(address _token, address _feed, FeedType _ft, uint8 _decs, bytes calldata _metadata) external onlyOwner {
        feedTypes[_token] = _ft;
        feeds[_token] = _feed;
        feedDecimals[_token] = _decs;
        oracle_metadata[_token] = _metadata;
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

    /// @notice Returns USD price of a token with 18 decimals
    /// @param _token Address of token
    /// @return USD Price with 18 decimals
    function getUSDPrice(address _token) external view override returns (uint256) {
        return _getUSDPrice(_token);
    }

    function _getUSDPrice(address _token) internal view returns (uint256) {
        address _feed = feeds[_token];
        FeedType _ft = feedTypes[_token];
        require(_feed != address(0), "Invalid Feed");

        if (_ft == FeedType.ChainlinkDirect) {
            uint256 price = _chainlinkPrice(_feed);

            // Convert to 18 decimals
            return price * (10**(18 - feedDecimals[_token]));
        } else if (_ft == FeedType.ChainlinkETH) {
            uint256 _ethPrice = _chainlinkPrice(chainlinkETHFeed);
            uint256 _ethValue = _chainlinkPrice(_feed);

            return (_ethPrice * _ethValue) / (10**8);
        } else if(_ft == FeedType.ChainlinkYearnUnderlying) {
            uint256 _underlyingValue = _chainlinkPrice(_feed);

            uint256 _sharePrice = IYearnVaultV2(_token).pricePerShare();
            uint8 _assetDecimals = IYearnVaultV2(_token).decimals();

            uint256 _tokenPrice = (_underlyingValue * _sharePrice) / (10**_assetDecimals);

            // Convert to 18 decimals
            return _tokenPrice * (10**(18 - feedDecimals[_token]));
        } else if(_ft == FeedType.CurveLPVirtualPricePeggedAssets) {
            uint256 _virtualPrice = ICurvePool(_feed).get_virtual_price();

            // Get price of underlying asset
            (address _underlyingAsset) = abi.decode(oracle_metadata[_token], (address));
            uint256 _underlyingPrice = _getUSDPrice(_underlyingAsset);

            return (_underlyingPrice * _virtualPrice) / (10**18);
        } else {
            revert("Dangerous Call");
        }
    }

    function _chainlinkPrice(address _feed) internal view returns (uint256) {
        (
                /*uint80 roundID*/,
                int _p,
                /*uint startedAt*/,
                /*uint timeStamp*/,
                /*uint80 answeredInRound*/
            ) = AggregatorV3Interface(_feed).latestRoundData();

            require(_p > 0, "Oracle failure");

            return uint256(_p);
    }

    // State Getters
    
    /// @return Owner of the contract
    function getOwner() external view returns (address) {
        return owner;
    }

    /// @return Pending owner of the contract before accepting ownership
    function getPendingOwner() external view returns (address) {
        return pendingOwner;
    }

    /// @return Feed, feed type and feed decimals of a token
    /// @param _token Address of the token
    function getFeed(address _token) external view returns (address, FeedType, uint8) {
        return (feeds[_token], feedTypes[_token], feedDecimals[_token]);
    }
}
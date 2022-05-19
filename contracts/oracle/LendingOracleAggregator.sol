// SPDX-License-Identifier: UNLICENSED

// Copyright (c) 2022 RedaOps - All rights reserved
// Telegram: @tudorog

// Version: 19-May-2022
pragma solidity ^0.8.2;

import "./../interfaces/IOracle.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "./../interfaces/yearn/IYearnVaultV2.sol";
import "./../interfaces/curve/ICurvePool.sol";
import "./../interfaces/benqi/IBenqiStakedAvax.sol";
import "./../interfaces/benqi/IBenqiToken.sol";

/// @title LendingOracleAggregator
/// @author Radar Global (tudor@radar.global)
/// @notice Oracle aggregator supporting multiple
/// oracle types. Used in `LendingPair`
contract LendingOracleAggregator is IOracle {

    enum FeedType {
        ChainlinkDirect,
        ChainlinkETH,
        ChainlinkYearnUnderlying,
        CurveLPVirtualPricePeggedAssets,
        AvalancheBENQIsAvax,
        AvalancheBENQIAsset
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
            oracle_metadata[_token] = _oracleMetadata[i];
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
        } else if(_ft == FeedType.AvalancheBENQIsAvax) {
            (address _avax) = abi.decode(oracle_metadata[_token], (address));
            uint256 _avaxPrice = _getUSDPrice(_avax);

            uint256 _totalSupply = IBenqiStakedAvax(_feed).totalSupply();
            uint256 _totalPooledAvax = IBenqiStakedAvax(_feed).totalPooledAvax();

            return (_avaxPrice * _totalPooledAvax) / _totalSupply;
        } else if(_ft == FeedType.AvalancheBENQIAsset) {
            (address _underlying, uint256 _underlyingDecimals) = abi.decode(oracle_metadata[_token], (address,uint256));
            uint256 _underlyingPrice = _getUSDPrice(_underlying);

            uint256 _benqiExchangeRate = IBenqiToken(_feed).exchangeRateStored();

            uint256 _unscaledPrice = (_underlyingPrice * _benqiExchangeRate) / (10**18);

            // All Benqi assets have 8 decimals
            if (_underlyingDecimals < 8) {
                return _unscaledPrice * (10**(8-_underlyingDecimals));
            } else {
                return _unscaledPrice / (10**(_underlyingDecimals-8));
            }
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
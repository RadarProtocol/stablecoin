// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "./../interfaces/IStrategy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockStrategy is IStrategy {
    using SafeERC20 for IERC20;

    address private investor;
    mapping(address => bool) private supportedTokens;

    modifier onlyInvestor {
        require(msg.sender == investor, "Unauthorized");
        _;
    }

    constructor(address _investor, address[] memory _supportedTokens) {
        investor = _investor;
        for(uint i = 0; i < _supportedTokens.length; i++) {
            supportedTokens[_supportedTokens[i]] = true;
        }
    }

    function invested(address _token) external view override returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }

    function getIsSupportedToken(address _token) external view override returns (bool) {
        return supportedTokens[_token];
    }

    function exit(address _token) external override onlyInvestor {
        // Check token supported
        if (IERC20(_token).balanceOf(address(this)) != 0) {
            IERC20(_token).safeTransfer(investor, IERC20(_token).balanceOf(address(this)));
        }
    }

    function depositToStrategy(address _token, uint256 _amount) external override onlyInvestor {
        IERC20(_token).safeTransferFrom(investor, address(this), _amount);
    }

    function withdrawFromStrategy(address _token, uint256 _amount) external override onlyInvestor {
        IERC20(_token).safeTransfer(investor, _amount);
    }

    function isLiquid(address _token, uint256 _amount) external view override returns (bool) {
        return IERC20(_token).balanceOf(address(this)) >= _amount;
    }

    function harvest(address) external override onlyInvestor {
        // Do nothing
    }

    function getInvestor() external view override returns (address) {
        return investor;
    }

    function shouldHarvest(address) external pure override returns (bool) {
        return true;
    }
}
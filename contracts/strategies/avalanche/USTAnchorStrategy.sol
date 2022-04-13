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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../../interfaces/IStrategy.sol";
import "./../../interfaces/ILickHitter.sol";

contract USTAnchorStrategy is IStrategy {
    using SafeERC20 for IERC20;

    uint256 constant MAX_UINT = 2**256 - 1;

    address private immutable yieldVault;

    address private immutable UST;
    address private immutable ANCHOR;

    modifier onlyLickHitter {
        require(msg.sender == yieldVault, "Unauthorized");
        _;
    }

    constructor(
        address _yv,
        address _ust,
        address _anchor
    ) {
        yieldVault = _yv;
        UST = _ust;
        ANCHOR = _anchor;
        IERC20(_ust).safeApprove(_anchor, MAX_UINT);
    }

    // Backup
    function reApprove() external {
        IERC20(UST).safeApprove(ANCHOR, 0);
        IERC20(UST).safeApprove(ANCHOR, MAX_UINT);
    }

    // Strategy functions

    function harvest(address) external override {}

    function depositToStrategy(address, uint256 _amount) external override onlyLickHitter {
        IERC20(UST).safeTransferFrom(msg.sender, address(this), _amount);

        uint256 _ustBal = IERC20(UST).balanceOf(address(this));

    }

    function withdrawFromStrategy(address, uint256 _amount) external override onlyLickHitter {
        IERC20(UST).safeTransfer(yieldVault, _amount);
    }

    function exit(address) external override onlyLickHitter {

    }

    // State Getters

    function getInvestor() external override view returns (address) {
        return yieldVault;
    }

    function isLiquid(address, uint256 _amt) external view override returns (bool) {
        uint256 _ustBal = IERC20(UST).balanceOf(address(this));
        return (_ustBal >= _amt);
    }

    function shouldHarvest(address) external view override returns (bool) {
        // Never harvest since aUST is interest bearing by itself
        return false;
    }

    function getIsSupportedToken(address _token) external view override returns (bool) {
        // This strategy only supports UST for Anchor
        return (_token == UST);
    }

    function invested(address) external view override returns (uint256) {
        // TODO: Implement
    }
}
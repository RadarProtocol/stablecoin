// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "./../interfaces/ILiquidator.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockLiquidator is ILiquidator {

    address private stablecoin;
    address private lp;

    event LiqDebugEvent(
        address token,
        address initiator,
        uint256 totalRepayAmount,
        uint256 totalCollateralReceived
    );

    constructor(address _sb, address _lp) {
        stablecoin = _sb;
        lp = _lp;
    }

    function liquidateHook(
        address _token,
        address _initiator,
        uint256 _repayAmount,
        uint256 _collateralLiquidated
    ) external override {
        require(msg.sender == lp);
        // Just receive collateral and approve for repay amount
        IERC20(stablecoin).approve(lp, _repayAmount);
        emit LiqDebugEvent(_token, _initiator, _repayAmount, _collateralLiquidated);
    }
}
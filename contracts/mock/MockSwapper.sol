// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;

import "./../interfaces/ISwapper.sol";
import "./../interfaces/ILickHitter.sol";
import "./../interfaces/IRadarUSD.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockSwapper is ISwapper {

    address private yieldVault;
    address private stablecoin;

    constructor(address _yv, address _sb) {
        yieldVault = _yv;
        stablecoin = _sb;
    }

    function depositHook(
        address _collateral,
        bytes calldata
    ) external override {
        // Since this is a mock swapper and it will already have collateral
        // Just receive stablecoin, burn it, and deposit collateral that it has

        uint256 _sbBal = IERC20(stablecoin).balanceOf(address(this));
        uint256 _clBal = IERC20(_collateral).balanceOf(address(this));

        IRadarUSD(stablecoin).burn(_sbBal);

        IERC20(_collateral).approve(yieldVault, _clBal);
        ILickHitter(yieldVault).deposit(_collateral, msg.sender, _clBal);
    }

    function repayHook(
        address _collateral,
        bytes calldata
    ) external override {
        // Since this is a mock swapper and it will already have stablecoin
        // Just receive collateral, burn it, and deposit stablecoin that it has

        uint256 _sbBal = IERC20(stablecoin).balanceOf(address(this));
        uint256 _clBal = IERC20(_collateral).balanceOf(address(this));

        IRadarUSD(_collateral).burn(_clBal);

        IERC20(stablecoin).approve(yieldVault, _sbBal);
        ILickHitter(yieldVault).deposit(stablecoin, msg.sender, _sbBal);
    }
}
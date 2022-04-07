import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { ICurvePool, RadarUSD } from "../../../typechain";
import CurvePoolFactoryABI from "./CurvePoolFactoryABI.json";
import { manipulateLocalERC20Balance } from './LocalManipulation';

export const deployUSDR3PoolCurveFactory = async (
    deployer: SignerWithAddress,
    USDR: RadarUSD,
    POOL3: any,
    fee: any
) => {
    const curveFactoryAddress = "0xB9fC157394Af804a3578134A6585C0dc9cc990d4";
    const DPI = new ethers.utils.Interface(
        JSON.parse(JSON.stringify(CurvePoolFactoryABI))
    );

    const curveFactory = new ethers.Contract(
        curveFactoryAddress,
        DPI,
        deployer
    );


    const USDRPoolTx = await curveFactory.deploy_metapool(
        "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7", // 3Pool
        "USDR 3Pool",
        "USDR3Pool",
        USDR.address,
        500,
        fee
    );
    const rc = await USDRPoolTx.wait();
    
    const pool_count = await curveFactory.pool_count();
    const USDRPoolAddress = await curveFactory.pool_list(pool_count-1);

    const ICurvePoolInterface = new ethers.utils.Interface([
        "function add_liquidity(uint256[2] memory amounts, uint256 _min_mint_amount) external",
        "function coins(uint256) external view returns (address)",
        "function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external returns (uint256)"
    ]);
    const USDRPool = new ethers.Contract(
        USDRPoolAddress,
        ICurvePoolInterface,
        deployer
    );

    const coin0 = await USDRPool.coins(0);
    const coin1 = await USDRPool.coins(1);
    expect(coin0).to.eq(USDR.address);
    expect(coin1).to.eq(POOL3.address);

    return USDRPool;
};

export const set3PoolTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
        3, // Slot for 3Pool token
        receiver.address,
        amount,
        true
    );
}

export const setUSTTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xa693B19d2931d498c5B318dF961919BB4aee87a5",
        5, // Slot for UST token
        receiver.address,
        amount,
        false
    );
}

export const setyvWETHV2TokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xa258C4606Ca8206D8aA700cE2143D7db854D168c",
        3, // Slot for yvWETH token
        receiver.address,
        amount,
        true
    );
}

export const setyvDAIV2TokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xdA816459F1AB5631232FE5e97a05BBBb94970c95",
        3, // Slot for yvWETH token
        receiver.address,
        amount,
        true
    );
}

export const setyvUSDCV2TokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE",
        3, // Slot for yvWETH token
        receiver.address,
        amount,
        true
    );
}

export const setyvUSDTV2TokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x7Da96a3891Add058AdA2E826306D812C638D87a7",
        4, // Slot for yvUSDT token
        receiver.address,
        amount,
        true
    );
}

export const setcrvstETHTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x06325440D014e39736583c165C2963BA99fAf14E",
        2, // Slot for crvstETH token
        receiver.address,
        amount,
        true
    );
}

export const setcrvFRAXTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
        15, // Slot for crvFRAX token
        receiver.address,
        amount,
        true
    );
}
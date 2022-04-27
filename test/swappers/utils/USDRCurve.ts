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

export const deployUSDR3PoolCurveFactoryAvalanche = async (
    deployer: SignerWithAddress,
    USDR: RadarUSD,
    POOL3: any,
    fee: any
) => {
    const curveFactoryAddress = "0xb17b674D9c5CB2e441F8e196a2f048A81355d031";
    const DPI = new ethers.utils.Interface(
        JSON.parse(JSON.stringify(CurvePoolFactoryABI))
    );

    const curveFactory = new ethers.Contract(
        curveFactoryAddress,
        DPI,
        deployer
    );


    const USDRPoolTx = await curveFactory.deploy_metapool(
        "0x7f90122BF0700F9E7e1F688fe926940E8839F353", // av3Crv
        "USDR av3Crv",
        "USDRav",
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

export const setcrvIBTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x5282a4eF67D9C33135340fB3289cc1711c13638C",
        2, // Slot for crvIB token
        receiver.address,
        amount,
        true
    );
}

export const setCRVTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xD533a949740bb3306d119CC777fa900bA034cd52",
        3, // Slot for CRV token
        receiver.address,
        amount,
        true
    );
}

export const setCVXTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b",
        0, // Slot for CVX token
        receiver.address,
        amount,
        false
    );
}

export const setUSDTTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        2, // Slot for USDT token
        receiver.address,
        amount,
        false
    );
}

export const setFRAXTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x853d955aCEf822Db058eb8505911ED77F175b99e",
        0, // Slot for FRAX token
        receiver.address,
        amount,
        false
    );
}

export const setDAITokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x6B175474E89094C44Da98b954EedeAC495271d0F",
        2, // Slot for DAI token
        receiver.address,
        amount,
        false
    );
}

export const setavaxDAITokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
        0, // Slot for DAI.e (AVAX) token
        receiver.address,
        amount,
        false
    );
}

export const setavaxav3CRVTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x1337BedC9D22ecbe766dF105c9623922A27963EC",
        2, // Slot for av3Crv (AVAX) token
        receiver.address,
        amount,
        true
    );
}

export const setavaxcrvUSDBTCETHTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828",
        7, // Slot for crvUSDBTCETH (AVAX) token
        receiver.address,
        amount,
        true
    );
}

export const setavaxCRVTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x47536F17F4fF30e64A96a7555826b8f9e66ec468",
        2, // Slot for CRV (AVAX) token
        receiver.address,
        amount,
        false
    );
}

export const setavaxWAVAXTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
        3, // Slot for WAVAX (AVAX) token
        receiver.address,
        amount,
        false
    );
}

export const setavaxUSDTTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0xc7198437980c041c805a1edcba50c1ce5db95118",
        0, // Slot for USDT (AVAX) token
        receiver.address,
        amount,
        false
    );
}

export const setavaxSAVAXTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
        203, // Slot for SAVAX (AVAX) token
        receiver.address,
        amount,
        false
    );
}

export const setavaxCrvTricryptoTokenBalance = async (
    receiver: SignerWithAddress,
    amount: BigNumberish
) => {
    await manipulateLocalERC20Balance(
        receiver,
        "0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828",
        7, // Slot for Curve TriCrypto LP (AVAX) token
        receiver.address,
        amount,
        true
    );
}
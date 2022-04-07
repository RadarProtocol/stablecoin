import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { CurveIronbankSwapper } from "../../typechain";
import { allowanceCheck } from "./utils/SwapperTestUtils";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance, setcrvIBTokenBalance } from "./utils/USDRCurve";

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const USDC = stableFactory.attach(USDCAddress);

    const crvIBAddress = "0x5282a4eF67D9C33135340fB3289cc1711c13638C";
    const crvIB = stableFactory.attach(crvIBAddress);

    const Pool3Address = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const POOL3 = stableFactory.attach(Pool3Address);

    const CURVE_3POOL_IRONBANK_ADDRESS = "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF";

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(crvIB.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveIronbankSwapper");
    const swapper = await swapperFactory.deploy(
        crvIBAddress,
        USDC.address,
        USDR.address,
        USDRPool.address,
        CURVE_3POOL_IRONBANK_ADDRESS,
        yieldVault.address
    );
    
    // Add liquidity to the USDR3Pool
    const LIQ_AMT = ethers.utils.parseEther('100000000');

    // Get USDR
    await USDR.mint(deployer.address, LIQ_AMT)

    // Get 3Pool
    await set3PoolTokenBalance(
        deployer,
        LIQ_AMT
    );

    const bof = await POOL3.balanceOf(deployer.address);
    expect(bof).to.eq(LIQ_AMT);

    // Approves
    await POOL3.approve(USDRPool.address, LIQ_AMT);
    await USDR.approve(USDRPool.address, LIQ_AMT);

    // Deposit liquidity
    await USDRPool.add_liquidity(
        [LIQ_AMT, LIQ_AMT],
        0
    );

    return {
        deployer,
        otherAddress1,
        otherAddress2,
        USDR,
        USDC,
        crvIB,
        POOL3,
        USDRPool,
        CURVE_3POOL_IRONBANK_ADDRESS,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: CurveIronbankSwapper,
    USDR: any,
    crvIB: any,
    USDC: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await crvIB.balanceOf(swapper.address);
    const b3 = await USDC.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(b3).to.eq(0);
}

describe('CurveIronbankSwapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            crvIB,
            USDC,
            USDRPool,
            CURVE_3POOL_IRONBANK_ADDRESS,
            swapper,
            yieldVault
        } = await snapshot();

        await allowanceCheck(
            [USDR, USDC, crvIB, crvIB, USDC, USDR],
            [USDRPool.address, CURVE_3POOL_IRONBANK_ADDRESS, yieldVault.address, CURVE_3POOL_IRONBANK_ADDRESS, USDRPool.address, yieldVault.address],
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            [USDR, USDC, crvIB, crvIB, USDC, USDR],
            [USDRPool.address, CURVE_3POOL_IRONBANK_ADDRESS, yieldVault.address, CURVE_3POOL_IRONBANK_ADDRESS, USDRPool.address, yieldVault.address],
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            crvIB
        } = await snapshot();

        // Swap should not be possible if checkAllowance doesn't work
        const TEST_AMT = ethers.utils.parseEther('1000');
        await USDR.mint(swapper.address, TEST_AMT);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                0,
                0
            ]
        );

        await swapper.depositHook(crvIB.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            crvIB,
            USDC,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const SHARE_INCONSISTENCY = 500;
        const directDeposit = ethers.utils.parseEther('10')
        const borrow = ethers.utils.parseEther('100');
        const minUSDC = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const mincrvIB = minUSDC.sub(minUSDC.mul(SLIPPAGE_TOLERANCE).div(10000)).sub(minUSDC.mul(SHARE_INCONSISTENCY).div(10000));
        const myMinCollateral = mincrvIB.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC.div(10**12),
                mincrvIB
            ]
        );

        // Direct deposit UST
        await setcrvIBTokenBalance(deployer, BigNumber.from(directDeposit));
        await crvIB.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(crvIB.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(crvIB.address, deployer.address);
        const myBal = await yieldVault.convertShares(crvIB.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, crvIB, USDC);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            crvIB,
            USDC,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const SHARE_INCONSISTENCY = 500;
        const directRepay = ethers.utils.parseEther('10'); // repay 10 USDR
        const collatRemoved = ethers.utils.parseEther('100')
        const minUSDC = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUSDR = minUSDC.sub(minUSDC.mul(SLIPPAGE_TOLERANCE).div(10000)).sub(minUSDC.mul(SHARE_INCONSISTENCY).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC.div(10**12),
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setcrvIBTokenBalance(deployer, collatRemoved);
        await crvIB.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(crvIB.address, swapData);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, crvIB, USDC);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            crvIB,
            USDC,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = ethers.utils.parseEther('1000');
        const repayRequired = ethers.utils.parseEther('904.5');
        const minUSDC = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000));

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC.div(10**12),
                repayRequired
            ]
        );

        // Remove collateral
        await setcrvIBTokenBalance(deployer, collateralLiquidated);
        await crvIB.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            crvIB.address,
            otherAddress1.address,
            repayRequired,
            0,
            swapData
        );

        const yvsBal = await yieldVault.balanceOf(USDR.address, deployer.address);
        const yvBal = await yieldVault.convertShares(USDR.address, yvsBal, 0);
        expect(yvBal).to.be.gte(repayRequired);
        
        const userReward = await USDR.balanceOf(otherAddress1.address);
        console.log(`Liquidate user reward: ${userReward}`);
        expect(userReward).to.be.gte(ethers.utils.parseEther("1"));

        await checkSwapperEmptyBalance(swapper, USDR, crvIB, USDC);
    });
});
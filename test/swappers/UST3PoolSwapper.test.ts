import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { LickHitter, RadarUSD, UST3PoolSwapper } from "../../typechain";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance, setUSTTokenBalance } from "./utils/USDRCurve";

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const USTAddress = "0xa693B19d2931d498c5B318dF961919BB4aee87a5";
    const UST = stableFactory.attach(USTAddress);

    const Pool3Address = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const POOL3 = stableFactory.attach(Pool3Address);

    const CURVE_3POOL_UST_ADDRESS = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269";

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(UST.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("UST3PoolSwapper");
    const swapper = await swapperFactory.deploy(
        USTAddress,
        USDR.address,
        Pool3Address,
        USDRPool.address,
        CURVE_3POOL_UST_ADDRESS,
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
        UST,
        POOL3,
        USDRPool,
        CURVE_3POOL_UST_ADDRESS,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: UST3PoolSwapper,
    USDR: any,
    UST: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await UST.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(0);
}

describe('UST3PoolSwapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            UST,
            POOL3,
            USDRPool,
            CURVE_3POOL_UST_ADDRESS,
            swapper,
            yieldVault
        } = await snapshot();

        const allowanceCheck = async (
            USDR: RadarUSD,
            USDRPool: any,
            CURVE_3POOL_TOKEN: any,
            CURVE_UST_POOL: any,
            UST: RadarUSD,
            yv: LickHitter,
            swapper: UST3PoolSwapper,
            allowance: BigNumberish
        ) => {
            const a1 = await USDR.allowance(swapper.address, USDRPool.address);
            const a2 = await CURVE_3POOL_TOKEN.allowance(swapper.address, CURVE_UST_POOL);
            const a3 = await UST.allowance(swapper.address, yv.address);
            const a4 = await UST.allowance(swapper.address, CURVE_UST_POOL);
            const a5 = await CURVE_3POOL_TOKEN.allowance(swapper.address, USDRPool.address);
            const a6 = await USDR.allowance(swapper.address, yv.address);

            expect(a1)
            .to.eq(a2)
            .to.eq(a3)
            .to.eq(a4)
            .to.eq(a5)
            .to.eq(a6)
            .to.eq(allowance);
        }

        await allowanceCheck(
            USDR,
            USDRPool,
            POOL3,
            CURVE_3POOL_UST_ADDRESS,
            UST,
            yieldVault,
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            USDR,
            USDRPool,
            POOL3,
            CURVE_3POOL_UST_ADDRESS,
            UST,
            yieldVault,
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            UST
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

        await swapper.depositHook(UST.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            UST,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = 100 * 10**6; // 100 UST
        const borrow = ethers.utils.parseEther('10');
        const min3Pool = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUST = min3Pool.sub(min3Pool.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**6).div(ethers.utils.parseEther('1'));
        const myMinCollateral = minUST.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                min3Pool,
                minUST
            ]
        );

        // Direct deposit UST
        await setUSTTokenBalance(deployer, BigNumber.from(directDeposit));
        await UST.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(UST.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(UST.address, deployer.address);
        const myBal = await yieldVault.convertShares(UST.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, UST);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            UST,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const directRepay = ethers.utils.parseEther('1'); // repay 1 USDR
        const collatRemoved = BigNumber.from(100 * 10**6); // 100 UST
        const min3Pool = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(ethers.utils.parseEther('1')).div(10**6);
        const minUSDR = min3Pool.sub(min3Pool.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                min3Pool,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setUSTTokenBalance(deployer, collatRemoved);
        await UST.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(UST.address, swapData);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, UST);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            UST,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = BigNumber.from(945 * 10**6); // 94.5 UST
        const repayRequired = ethers.utils.parseEther('904.5');
        const min3Pool = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(ethers.utils.parseEther('1')).div(10**6);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                min3Pool,
                repayRequired
            ]
        );

        // Remove collateral
        await setUSTTokenBalance(deployer, collateralLiquidated);
        await UST.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            UST.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, UST);
    });
});
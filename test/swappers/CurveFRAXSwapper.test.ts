import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { CurveFRAXSwapper } from "../../typechain";
import { allowanceCheck } from "./utils/SwapperTestUtils";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance, setcrvFRAXTokenBalance } from "./utils/USDRCurve";

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const crvFRAXAddress = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";
    const crvFRAX = stableFactory.attach(crvFRAXAddress);

    const Pool3Address = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const POOL3 = stableFactory.attach(Pool3Address);

    const CURVE_3POOL_FRAX_ADDRESS = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(crvFRAX.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveFRAXSwapper");
    const swapper = await swapperFactory.deploy(
        crvFRAXAddress,
        USDR.address,
        Pool3Address,
        USDRPool.address,
        CURVE_3POOL_FRAX_ADDRESS,
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
        crvFRAX,
        POOL3,
        USDRPool,
        CURVE_3POOL_FRAX_ADDRESS,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: CurveFRAXSwapper,
    USDR: any,
    crvFRAX: any,
    pool3: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await crvFRAX.balanceOf(swapper.address);
    const b3 = await pool3.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(b3).to.eq(0);
}

describe('CurveFRAXSwapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            crvFRAX,
            POOL3,
            USDRPool,
            CURVE_3POOL_FRAX_ADDRESS,
            swapper,
            yieldVault
        } = await snapshot();

        await allowanceCheck(
            [USDR, POOL3, crvFRAX, POOL3, USDR],
            [USDRPool.address, CURVE_3POOL_FRAX_ADDRESS, yieldVault.address, USDRPool.address, yieldVault.address],
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            [USDR, POOL3, crvFRAX, POOL3, USDR],
            [USDRPool.address, CURVE_3POOL_FRAX_ADDRESS, yieldVault.address, USDRPool.address, yieldVault.address],
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            crvFRAX
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

        await swapper.depositHook(crvFRAX.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            crvFRAX,
            yieldVault,
            deployer,
            POOL3
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('10')
        const borrow = ethers.utils.parseEther('100');
        const min3Pool = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const mincrvFRAX = min3Pool.sub(min3Pool.mul(SLIPPAGE_TOLERANCE).div(10000));
        const myMinCollateral = mincrvFRAX.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                min3Pool,
                mincrvFRAX
            ]
        );

        // Direct deposit UST
        await setcrvFRAXTokenBalance(deployer, BigNumber.from(directDeposit));
        await crvFRAX.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(crvFRAX.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(crvFRAX.address, deployer.address);
        const myBal = await yieldVault.convertShares(crvFRAX.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, crvFRAX, POOL3);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            crvFRAX,
            POOL3,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const directRepay = ethers.utils.parseEther('10'); // repay 1 USDR
        const collatRemoved = ethers.utils.parseEther('100')
        const min3Pool = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000));
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
        await setcrvFRAXTokenBalance(deployer, collatRemoved);
        await crvFRAX.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(crvFRAX.address, swapData);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, crvFRAX, POOL3);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            crvFRAX,
            POOL3,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = ethers.utils.parseEther('945');
        const repayRequired = ethers.utils.parseEther('904.5');
        const min3Pool = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000));

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
        await setcrvFRAXTokenBalance(deployer, collateralLiquidated);
        await crvFRAX.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            crvFRAX.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, crvFRAX, POOL3);
    });
});
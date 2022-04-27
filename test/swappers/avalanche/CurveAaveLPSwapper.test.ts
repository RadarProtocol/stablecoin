import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance } from '../utils/USDRCurve';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(av3Crv.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveAaveLPSwapper");
    const swapper = await swapperFactory.deploy(
        yieldVault.address,
        USDR.address,
        USDRPool.address
    );

    // Add liquidity to the USDR3Pool
    const LIQ_AMT = ethers.utils.parseEther('100000000');

    // Get USDR
    await USDR.mint(deployer.address, LIQ_AMT)

    // Get 3Pool
    await setavaxav3CRVTokenBalance(
        deployer,
        LIQ_AMT
    );

    const bof = await av3Crv.balanceOf(deployer.address);
    expect(bof).to.eq(LIQ_AMT);

    // Approves
    await av3Crv.approve(USDRPool.address, LIQ_AMT);
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
        av3Crv,
        USDRPool,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: any,
    USDR: any,
    av3Crv: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await av3Crv.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(0);
}

describe('Avalanche: CurveAaveLPSwapper', () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            av3Crv
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('10')
        const borrow = ethers.utils.parseEther('100');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const myMinCollateral = minav3Crv.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256"
            ], [
                minav3Crv
            ]
        );

        // Direct deposit 
        await setavaxav3CRVTokenBalance(deployer, directDeposit);
        await av3Crv.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(av3Crv.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(av3Crv.address, deployer.address);
        const myBal = await yieldVault.convertShares(av3Crv.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            av3Crv
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = ethers.utils.parseEther('2000');
        const minUSDR = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256"
            ], [
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setavaxav3CRVTokenBalance(deployer, collatRemoved);
        await av3Crv.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(av3Crv.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, av3Crv);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            av3Crv,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = ethers.utils.parseEther('5000');
        const repayRequired = ethers.utils.parseEther('4700');

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256"
            ], [
                repayRequired
            ]
        );

        // Remove collateral
        await setavaxav3CRVTokenBalance(deployer, collateralLiquidated);
        await av3Crv.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            av3Crv.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv);
    });
});
import { ethers } from "hardhat";
import { expect } from "chai";
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxCrvTricryptoTokenBalance } from "../utils/USDRCurve";

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const DAI = stableFactory.attach("0xd586E7F844cEa2F87f50152665BCbc2C279D8d70");
    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");
    const tricryptoLp = stableFactory.attach("0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(tricryptoLp.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveTricryptoLPSwapper");
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
        tricryptoLp,
        USDRPool,
        swapper,
        stableFactory,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: any,
    USDR: any,
    DAI: any,
    av3Crv: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await av3Crv.balanceOf(swapper.address);
    const b3 = await DAI.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(b3).to.eq(0);
}

describe("Avalanche: CurveTricryptoLPSwapper", () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            av3Crv,
            yieldVault,
            deployer,
            tricryptoLp
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('0.5')
        const borrow = ethers.utils.parseEther('100000');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minTriCrypto = ethers.utils.parseEther('50')
        const myMinCollateral = minTriCrypto.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minav3Crv,
                minTriCrypto
            ]
        );

        // Direct deposit 
        await setavaxCrvTricryptoTokenBalance(deployer, directDeposit);
        await tricryptoLp.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(tricryptoLp.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(tricryptoLp.address, deployer.address);
        const myBal = await yieldVault.convertShares(tricryptoLp.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv, tricryptoLp);
    });
    it('repayHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            av3Crv,
            tricryptoLp,
            stableFactory
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('1000');
        const collatRemoved = ethers.utils.parseEther('0.7');
        const minUSDR = ethers.utils.parseEther('1');
        const minav3Crv = minUSDR.add(minUSDR.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minav3Crv,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setavaxCrvTricryptoTokenBalance(deployer, collatRemoved);
        await tricryptoLp.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(tricryptoLp.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, tricryptoLp, av3Crv);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            av3Crv,
            tricryptoLp,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = ethers.utils.parseEther('200');
        const repayRequired = ethers.utils.parseEther('250000');

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                0,
                repayRequired
            ]
        );

        // Remove collateral
        await setavaxCrvTricryptoTokenBalance(deployer, collateralLiquidated);
        await tricryptoLp.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            tricryptoLp.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv, tricryptoLp);
    });
});
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxWAVAXTokenBalance } from '../utils/USDRCurve';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const USDT = stableFactory.attach("0xc7198437980c041c805A1EDcbA50c1Ce5db95118");
    const WAVAX = stableFactory.attach("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(WAVAX.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("AvaxSwapper");
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
        WAVAX,
        av3Crv,
        USDRPool,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: any,
    USDR: any,
    WAVAX: any,
    av3Crv: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await WAVAX.balanceOf(swapper.address);
    const b3 = await av3Crv.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(b3).to.eq(0);
}

describe('Avalanche: AvaxSwapper', () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            yieldVault,
            deployer,
            av3Crv
        } = await snapshot();

        const avaxPrice = 80;

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('10')
        const borrow = ethers.utils.parseEther('100');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUSDT = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000)).div(10**12);
        const minwAVAX = minUSDT.sub(minUSDT.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12).div(avaxPrice);
        const myMinCollateral = minwAVAX.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minav3Crv,
                minUSDT,
                minwAVAX
            ]
        );

        // Direct deposit 
        await setavaxWAVAXTokenBalance(deployer, directDeposit);
        await WAVAX.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(WAVAX.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(WAVAX.address, deployer.address);
        const myBal = await yieldVault.convertShares(WAVAX.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, WAVAX, av3Crv);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            yieldVault,
            deployer,
            av3Crv
        } = await snapshot();

        const avaxPrice = 80;

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = ethers.utils.parseEther('10');
        const minUSDT = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(avaxPrice).div(10**12);
        const minav3Crv = minUSDT.sub(minUSDT.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12);
        const minUSDR = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minUSDT,
                minav3Crv,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setavaxWAVAXTokenBalance(deployer, collatRemoved);
        await WAVAX.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(WAVAX.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, WAVAX, av3Crv);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            yieldVault,
            deployer,
            av3Crv,
            otherAddress1
        } = await snapshot();

        const avaxPrice = 80;

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = ethers.utils.parseEther('200');
        const repayRequired = ethers.utils.parseEther('14000');
        const minUSDT = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(avaxPrice).div(10**12);
        const minav3Crv = minUSDT.sub(minUSDT.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minUSDT,
                minav3Crv,
                repayRequired
            ]
        );

        // Remove collateral
        await setavaxWAVAXTokenBalance(deployer, collateralLiquidated);
        await WAVAX.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            WAVAX.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv, WAVAX);
    });
});
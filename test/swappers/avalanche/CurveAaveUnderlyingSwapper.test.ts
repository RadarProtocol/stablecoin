import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxDAITokenBalance, setavaxUSDCTokenBalance, setavaxUSDTTokenBalance } from '../utils/USDRCurve';
import { BigNumber } from 'ethers';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const DAI = stableFactory.attach("0xd586E7F844cEa2F87f50152665BCbc2C279D8d70");
    const USDC = stableFactory.attach("0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664");
    const USDT = stableFactory.attach("0xc7198437980c041c805A1EDcbA50c1Ce5db95118");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(DAI.address, BUFFER);
    await yieldVault.addSupportedToken(USDC.address, BUFFER);
    await yieldVault.addSupportedToken(USDT.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveAaveUnderlyingSwapper");
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
        yieldVault,
        DAI,
        USDC,
        USDT
    }
}

const checkSwapperEmptyBalance = async (
    swapper: any,
    tokens: Array<any>
) => {
    for(var i = 0; i < tokens.length; i++) {
        const b = await tokens[i].balanceOf(swapper.address);
        expect(b).to.eq(0);
    }
}

describe("Avalanche: CurveAaveUnderlyingSwapper", () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            DAI,
            USDC,
            USDT
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('10')
        const borrow = ethers.utils.parseEther('100');
        const minDAI = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const myMinCollateral = minDAI.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minDAI,
                minDAI
            ]
        );

        // Direct deposit 
        await setavaxDAITokenBalance(deployer, directDeposit);
        await DAI.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(DAI.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(DAI.address, deployer.address);
        const myBal = await yieldVault.convertShares(DAI.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, [DAI, USDR, USDC, USDT]);
    });
    it('repayHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            DAI,
            USDC,
            USDT
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = BigNumber.from(2000 * 10**6);
        const minUSDR = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12);
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDR,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setavaxUSDTTokenBalance(deployer, collatRemoved);
        await USDT.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(USDT.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, [USDR, DAI, USDC, USDT]);
    });
    it('liquidateHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            DAI,
            USDC,
            USDT,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = BigNumber.from(5000 * 10**6);
        const minav3Crv = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12);
        const repayRequired = ethers.utils.parseEther('4700');

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minav3Crv,
                repayRequired
            ]
        );

        // Remove collateral
        await setavaxUSDCTokenBalance(deployer, collateralLiquidated);
        await USDC.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            USDC.address,
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

        await checkSwapperEmptyBalance(swapper, [USDR, USDC, DAI, USDT]);
    });
});
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxwBTCTokenBalance, setavaxwETHTokenBalance } from '../utils/USDRCurve';

const wETHPrice = 3102;
const wBTCPrice = 41425;

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const wETH = stableFactory.attach("0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB");
    const wBTC = stableFactory.attach("0x50b7545627a5162F82A992c33b87aDc75187B218");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(wETH.address, BUFFER);
    await yieldVault.addSupportedToken(wBTC.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurveTricryptoUnderlyingSwapper");
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
        wETH,
        wBTC
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

describe("Avalanche: CurveTricryptoUnderlyingSwapper", () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            wBTC
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = ethers.utils.parseEther('0.5')
        const borrow = ethers.utils.parseEther('2500');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minavwETH = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000)).div(wETHPrice);
        const myMinCollateral = minavwETH.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minav3Crv,
                minavwETH
            ]
        );

        // Direct deposit 
        await setavaxwETHTokenBalance(deployer, directDeposit);
        await wETH.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(wETH.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(wETH.address, deployer.address);
        const myBal = await yieldVault.convertShares(wETH.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, [wETH, USDR, wBTC]);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            wBTC
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = ethers.utils.parseEther('1');
        const minav3Crv = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(wETHPrice);
        const minUSDR = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000));
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
        await setavaxwETHTokenBalance(deployer, collatRemoved);
        await wETH.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(wETH.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, [USDR, wETH, wBTC]);
    });
    it('liquidateHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            otherAddress1,
            wBTC
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = BigNumber.from(1 * 10**8);
        const minav3Crv = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**10).mul(wBTCPrice);
        const repayRequired = ethers.utils.parseEther('38000');

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
        await setavaxwBTCTokenBalance(deployer, collateralLiquidated);
        await wBTC.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            wBTC.address,
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

        await checkSwapperEmptyBalance(swapper, [USDR, wBTC, wETH]);
    });
});
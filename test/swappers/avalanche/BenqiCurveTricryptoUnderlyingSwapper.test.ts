import { ethers } from 'hardhat';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxwBTCTokenBalance, setavaxwETHTokenBalance } from '../utils/USDRCurve';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const wETHPrice = 3102;
const wBTCPrice = 41425;

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const wETH = stableFactory.attach("0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB");
    const wBTC = stableFactory.attach("0x50b7545627a5162F82A992c33b87aDc75187B218");

    const qiETH = stableFactory.attach("0x334AD834Cd4481BB02d09615E7c11a00579A7909");
    const qiBTC = stableFactory.attach("0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(qiETH.address, BUFFER);
    await yieldVault.addSupportedToken(qiBTC.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("BenqiCurveTricryptoUnderlyingSwapper");
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
        wBTC,
        qiETH,
        qiBTC
    }
}

const depositToBenqi = async (
    token: any,
    qiToken: any,
    amount: BigNumberish,
    deployer: SignerWithAddress
) => {
    const qiInterface = new ethers.utils.Interface([
        "function mint(uint mintAmount) external returns (uint)"
    ]);

    const c = new ethers.Contract(
        qiToken.address,
        qiInterface,
        deployer
    );

    await token.approve(qiToken.address, amount);
    await c.mint(amount);
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

describe("Avalanche: BenqiCurveTricryptoUnderlyingSwapper", () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            wBTC,
            qiETH
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = BigNumber.from(25 * 10**8);
        const borrow = ethers.utils.parseEther('2500');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minavwETH = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000)).div(wETHPrice);
        const myMinCollateral = minavwETH.mul(50).div(10**10).add(directDeposit);

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
        await setavaxwETHTokenBalance(deployer, ethers.utils.parseEther('1'));
        await depositToBenqi(
            wETH,
            qiETH,
            ethers.utils.parseEther('1'),
            deployer
        );
        await qiETH.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(qiETH.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(qiETH.address, deployer.address);
        const myBal = await yieldVault.convertShares(qiETH.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, [wETH, USDR, wBTC, qiETH]);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            wBTC,
            qiETH
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = BigNumber.from(50 * 10**8);
        const minav3Crv = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(wETHPrice).div(50).mul(10**10);
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
        await setavaxwETHTokenBalance(deployer, ethers.utils.parseEther('2'));
        await depositToBenqi(
            wETH,
            qiETH,
            ethers.utils.parseEther('2'),
            deployer
        );
        await qiETH.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(qiETH.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, [USDR, wETH, wBTC, qiETH]);
    });
    it('liquidateHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            wETH,
            otherAddress1,
            wBTC,
            qiBTC
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = BigNumber.from(50 * 10**8);
        const minav3Crv = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**10).mul(wBTCPrice).div(50);
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
        await depositToBenqi(
            wBTC,
            qiBTC,
            collateralLiquidated,
            deployer
        );
        await qiBTC.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            qiBTC.address,
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

        await checkSwapperEmptyBalance(swapper, [USDR, wBTC, wETH, qiBTC]);
    });
});
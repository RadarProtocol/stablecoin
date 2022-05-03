import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxWAVAXTokenBalance } from '../utils/USDRCurve';
import { BigNumber, BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const USDT = stableFactory.attach("0xc7198437980c041c805A1EDcbA50c1Ce5db95118");
    const WAVAX = stableFactory.attach("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");
    const qiAVAX = stableFactory.attach("0xaf2c034C764d53005cC6cbc092518112cBD652bb");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(qiAVAX.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("BenqiAvaxSwapper");
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
        qiAVAX,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: any,
    USDR: any,
    WAVAX: any,
    av3Crv: any,
    qiAVAX: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await WAVAX.balanceOf(swapper.address);
    const b3 = await av3Crv.balanceOf(swapper.address);
    const b4 = await qiAVAX.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(b3).to.eq(b4).to.eq(0);
}

const avaxToQiAvax = async (
    deployer: SignerWithAddress,
    qiAVAX: string,
    amount: BigNumberish
) => {
    const mintInterface = new ethers.utils.Interface([
        "function mint() external payable"
    ]);

    const c = new ethers.Contract(
        qiAVAX,
        mintInterface,
        deployer
    );

    await c.mint({value: amount});
}

describe('Avalanche: BenqiAvaxSwapper', () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            yieldVault,
            qiAVAX,
            av3Crv,
            deployer
        } = await snapshot();

        const avaxPrice = 80;

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = BigNumber.from(10 * 10**8);
        const borrow = ethers.utils.parseEther('100');
        const minav3Crv = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUSDT = minav3Crv.sub(minav3Crv.mul(SLIPPAGE_TOLERANCE).div(10000)).div(10**12);
        const minwAVAX = minUSDT.sub(minUSDT.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**12).div(avaxPrice);
        const myMinCollateral = minwAVAX.div(10**10).add(directDeposit);

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
        await avaxToQiAvax(
            deployer,
            qiAVAX.address,
            ethers.utils.parseEther('100')
        );
        await qiAVAX.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(qiAVAX.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(qiAVAX.address, deployer.address);
        const myBal = await yieldVault.convertShares(qiAVAX.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, WAVAX, av3Crv, qiAVAX);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            qiAVAX,
            yieldVault,
            deployer,
            av3Crv
        } = await snapshot();

        const avaxPrice = 1; // Accounting for qiAVAX

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = BigNumber.from(10 * 10**8);
        const minUSDT = collatRemoved.mul(10**10).sub(collatRemoved.mul(10**10).mul(SLIPPAGE_TOLERANCE).div(10000)).mul(avaxPrice).div(10**12);
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
        await avaxToQiAvax(
            deployer,
            qiAVAX.address,
            ethers.utils.parseEther('100')
        );
        await qiAVAX.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(qiAVAX.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, WAVAX, av3Crv, qiAVAX);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            WAVAX,
            yieldVault,
            deployer,
            av3Crv,
            otherAddress1,
            qiAVAX
        } = await snapshot();

        const avaxPrice = 1; // Accounting for qiAVAX

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = BigNumber.from(10000 * 10**8);
        const repayRequired = ethers.utils.parseEther('14000');
        const minUSDT = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**10).mul(avaxPrice).div(10**12);
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
        await avaxToQiAvax(
            deployer,
            qiAVAX.address,
            ethers.utils.parseEther('500')
        );
        await qiAVAX.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            qiAVAX.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, av3Crv, WAVAX, qiAVAX);
    });
});
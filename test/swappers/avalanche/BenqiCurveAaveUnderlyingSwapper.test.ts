import { ethers } from 'hardhat';
import { expect } from 'chai';
import { deployUSDR3PoolCurveFactoryAvalanche, setavaxav3CRVTokenBalance, setavaxDAITokenBalance, setavaxUSDCTokenBalance, setavaxUSDTTokenBalance } from '../utils/USDRCurve';
import { BigNumber, BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const av3Crv = stableFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");

    const DAI = stableFactory.attach("0xd586E7F844cEa2F87f50152665BCbc2C279D8d70");
    const USDC = stableFactory.attach("0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664");
    const USDT = stableFactory.attach("0xc7198437980c041c805A1EDcbA50c1Ce5db95118");

    const qiDAI = stableFactory.attach("0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D");
    const qiUSDC = stableFactory.attach("0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F");
    const qiUSDT = stableFactory.attach("0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C");

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(qiDAI.address, BUFFER);
    await yieldVault.addSupportedToken(qiUSDC.address, BUFFER);
    await yieldVault.addSupportedToken(qiUSDT.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactoryAvalanche(
        deployer,
        USDR,
        av3Crv,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("BenqiCurveAaveUnderlyingSwapper");
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
        USDT,
        qiDAI,
        qiUSDC,
        qiUSDT
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

describe("Avalanche: BenqiCurveAaveUnderlyingSwapper", () => {
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            DAI,
            USDC,
            USDT,
            qiDAI
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directDeposit = BigNumber.from(10 * 10**8);
        const borrow = ethers.utils.parseEther('100');
        const minDAI = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const myMinCollateral = minDAI.mul(45).div(10**10).add(directDeposit);

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
        await setavaxDAITokenBalance(deployer, ethers.utils.parseEther('1000'));
        await depositToBenqi(
            DAI,
            qiDAI,
            ethers.utils.parseEther('1000'),
            deployer
        );
        await qiDAI.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(qiDAI.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(qiDAI.address, deployer.address);
        const myBal = await yieldVault.convertShares(qiDAI.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, [DAI, USDR, USDC, USDT, qiDAI]);
    });
    it('repayHook', async () => {
        const {
            swapper,
            USDR,
            yieldVault,
            deployer,
            DAI,
            USDC,
            USDT,
            qiUSDT
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 300;
        const directRepay = ethers.utils.parseEther('100');
        const collatRemoved = BigNumber.from(2000 * 10**8);
        const minUSDR = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**10).div(50);
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
        await setavaxUSDTTokenBalance(deployer, ethers.utils.parseEther('5000'));
        await depositToBenqi(
            USDT,
            qiUSDT,
            ethers.utils.parseEther('5000'),
            deployer
        );
        await qiUSDT.transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(qiUSDT.address, swapData);

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, [USDR, DAI, USDC, USDT, qiUSDT]);
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
            otherAddress1,
            qiUSDC
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const collateralLiquidated = BigNumber.from(250000 * 10**8);
        const minav3Crv = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(10**10).div(50);
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
        await setavaxUSDCTokenBalance(deployer, ethers.utils.parseEther('1'));
        await depositToBenqi(
            USDC,
            qiUSDC,
            ethers.utils.parseEther('1'),
            deployer
        );
        await qiUSDC.transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            qiUSDC.address,
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

        await checkSwapperEmptyBalance(swapper, [USDR, USDC, DAI, USDT, qiUSDC]);
    });
});
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { LickHitter, RadarUSD, Yearn3PoolUnderlyingSwapper } from "../../typechain";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance , setyvDAIV2TokenBalance, setyvUSDTV2TokenBalance, setyvUSDCV2TokenBalance } from "./utils/USDRCurve";

const YearnSharePriceInterface = new ethers.utils.Interface([
    "function pricePerShare() external view returns (uint256)"
]);

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const yvDAIAddress = "0xdA816459F1AB5631232FE5e97a05BBBb94970c95";
    const yvDAI = stableFactory.attach(yvDAIAddress);

    const yvUSDCAddress = "0xa354F35829Ae975e850e23e9615b11Da1B3dC4DE";
    const yvUSDC = stableFactory.attach(yvUSDCAddress);

    const yvUSDTAddress = "0x7Da96a3891Add058AdA2E826306D812C638D87a7";
    const yvUSDT = stableFactory.attach(yvUSDTAddress);

    const DAIAddress = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const DAI = stableFactory.attach(DAIAddress);

    const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const USDC = stableFactory.attach(USDCAddress);

    const USDTAddress = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const USDT = stableFactory.attach(USDTAddress);

    const Pool3Address = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const POOL3 = stableFactory.attach(Pool3Address);

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(yvDAI.address, BUFFER);
    await yieldVault.addSupportedToken(yvUSDC.address, BUFFER);
    await yieldVault.addSupportedToken(yvUSDT.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("Yearn3PoolUnderlyingSwapper");
    const swapper = await swapperFactory.deploy(
        USDR.address,
        DAI.address,
        USDC.address,
        USDT.address,
        USDRPool.address,
        yieldVault.address
    );
    
    // Add liquidity to the USDR3Pool
    const LIQ_AMT = ethers.utils.parseEther('1000000000');

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
        DAI,
        USDC,
        USDT,
        POOL3,
        USDRPool,
        yvDAI,
        yvUSDC,
        yvUSDT,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: Yearn3PoolUnderlyingSwapper,
    USDR: any,
    yvDAI: any,
    yvUSDC: any,
    yvUSDT: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await yvDAI.balanceOf(swapper.address);
    const b3 = await yvUSDC.balanceOf(swapper.address);
    const b4 = await yvUSDT.balanceOf(swapper.address);

    expect(b1)
    .to.eq(b2)
    .to.eq(b3)
    .to.eq(b4)
    .to.eq(0);
}

describe('Yearn3PoolUnderlyingSwapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            DAI,
            USDC,
            USDT,
            USDRPool,
            swapper,
            yieldVault
        } = await snapshot();

        const allowanceCheck = async (
            USDR: RadarUSD,
            USDRPool: any,
            DAI: any,
            USDC: any,
            USDT: any,
            yv: any,
            swapper: Yearn3PoolUnderlyingSwapper,
            allowance: BigNumberish
        ) => {
            const a1 = await USDR.allowance(swapper.address, USDRPool.address);
            const a2 = await DAI.allowance(swapper.address, USDRPool.address);
            const a3 = await USDC.allowance(swapper.address, USDRPool.address);
            const a4 = await USDT.allowance(swapper.address, USDRPool.address);
            const a5 = await USDR.allowance(swapper.address, yv.address);

            expect(a1)
            .to.eq(a2)
            .to.eq(a3)
            .to.eq(a4)
            .to.eq(a5)
            .to.eq(allowance);
        }

        await allowanceCheck(
            USDR,
            USDRPool,
            DAI,
            USDC,
            USDT,
            yieldVault,
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            USDR,
            USDRPool,
            DAI,
            USDC,
            USDT,
            yieldVault,
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            yvDAI
        } = await snapshot();

        // Swap should not be possible if checkAllowance doesn't work
        const TEST_AMT = ethers.utils.parseEther('100');
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

        await swapper.depositHook(yvDAI.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yvDAI,
            yvUSDC,
            yvUSDT,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const directDeposit = ethers.utils.parseEther('200')
        const borrow = ethers.utils.parseEther('10000');
        const minUnderlyingDAI = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUnderlyingUSDC = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000)).div(10**12);
        const minUnderlyingUSDT = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000)).div(10**12);
        const yvCDAI = new ethers.Contract(
            yvDAI.address,
            YearnSharePriceInterface,
            deployer
        );
        const yvCUSDC = new ethers.Contract(
            yvUSDC.address,
            YearnSharePriceInterface,
            deployer
        );
        const yvCUSDT = new ethers.Contract(
            yvUSDT.address,
            YearnSharePriceInterface,
            deployer
        );
        const spDAI = await yvCDAI.pricePerShare();
        const spUSDC = await yvCUSDC.pricePerShare();
        const spUSDT = await yvCUSDT.pricePerShare();

        const myMinCollateralDAI = minUnderlyingDAI.mul(ethers.utils.parseEther('1')).div(spDAI).add(directDeposit);
        const myMinCollateralUSDC = minUnderlyingUSDC.mul(10**6).div(spUSDC).add(directDeposit);
        const myMinCollateralUSDT = minUnderlyingUSDT.mul(10**6).div(spUSDT).add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapDataDAI = abiCoder.encode(
            [
                "uint256"
            ], [
                minUnderlyingDAI
            ]
        );
        const swapDataUSDC = abiCoder.encode(
            [
                "uint256"
            ], [
                minUnderlyingUSDC
            ]
        );
        const swapDataUSDT = abiCoder.encode(
            [
                "uint256"
            ], [
                minUnderlyingUSDT
            ]
        );

        // Direct deposit yvDAIV2
        await setyvDAIV2TokenBalance(deployer, BigNumber.from(directDeposit));
        await yvDAI.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(yvDAI.address, swapDataDAI);

        const mySharesBal1 = await yieldVault.balanceOf(yvDAI.address, deployer.address);
        const myBal1 = await yieldVault.convertShares(yvDAI.address, mySharesBal1, 0);
        expect(myBal1).to.be.gte(myMinCollateralDAI);

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);

        // Direct deposit yvUSDCV2
        await setyvUSDCV2TokenBalance(deployer, BigNumber.from(directDeposit));
        await yvUSDC.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(yvUSDC.address, swapDataUSDC);

        const mySharesBal2 = await yieldVault.balanceOf(yvUSDC.address, deployer.address);
        const myBal2 = await yieldVault.convertShares(yvUSDC.address, mySharesBal2, 0);
        expect(myBal2).to.be.gte(myMinCollateralUSDC);

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);

        // Direct deposit yvUSDTV2
        await setyvUSDTV2TokenBalance(deployer, BigNumber.from(directDeposit));
        await yvUSDT.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(yvUSDT.address, swapDataUSDT);

        const mySharesBal3 = await yieldVault.balanceOf(yvUSDT.address, deployer.address);
        const myBal3 = await yieldVault.convertShares(yvUSDT.address, mySharesBal3, 0);
        expect(myBal3).to.be.gte(myMinCollateralUSDT);

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            yvDAI,
            yvUSDC,
            yvUSDT,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const yvCDAI = new ethers.Contract(
            yvDAI.address,
            YearnSharePriceInterface,
            deployer
        );
        const yvCUSDC = new ethers.Contract(
            yvUSDC.address,
            YearnSharePriceInterface,
            deployer
        );
        const yvCUSDT = new ethers.Contract(
            yvUSDT.address,
            YearnSharePriceInterface,
            deployer
        );
        const spDAI = await yvCDAI.pricePerShare();
        const spUSDC = await yvCUSDC.pricePerShare();
        const spUSDT = await yvCUSDT.pricePerShare();

        const directRepay = ethers.utils.parseEther('100'); // repay 100 USDR
        const collatRemoved = ethers.utils.parseEther('2000'); // 2000 yv tokens

        const expectedSwapDAI = collatRemoved.mul(spDAI).div(ethers.utils.parseEther('1'));
        const expectedSwapUSDC = collatRemoved.mul(spUSDC).div(ethers.utils.parseEther('1'));
        const expectedSwapUSDT = collatRemoved.mul(spUSDT).div(ethers.utils.parseEther('1'));

        const minUSDRDAI = expectedSwapDAI.sub(expectedSwapDAI.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUSDRUSDC = expectedSwapUSDC.sub(expectedSwapUSDC.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minUSDRUSDT = expectedSwapUSDT.sub(expectedSwapUSDT.mul(SLIPPAGE_TOLERANCE).div(10000));

        const minRepaymentDAI = directRepay.add(minUSDRDAI);
        const minRepaymentUSDC = directRepay.add(minUSDRUSDC);
        const minRepaymentUSDT = directRepay.add(minUSDRUSDT);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapDataDAI = abiCoder.encode(
            [
                "uint256"
            ], [
                minUSDRDAI
            ]
        );
        const swapDataUSDC = abiCoder.encode(
            [
                "uint256"
            ], [
                minUSDRUSDC
            ]
        );
        const swapDataUSDT = abiCoder.encode(
            [
                "uint256"
            ], [
                minUSDRUSDT
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setyvDAIV2TokenBalance(deployer, collatRemoved);
        await yvDAI.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(yvDAI.address, swapDataDAI);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepaymentDAI);
        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);


        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setyvUSDCV2TokenBalance(deployer, collatRemoved.div(10**12));
        await yvUSDC.connect(deployer).transfer(swapper.address, collatRemoved.div(10**12));

        // Do swap
        await swapper.repayHook(yvUSDC.address, swapDataUSDC);

        // Check balance

        const myShares2 = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal2 = await yieldVault.convertShares(USDR.address, myShares2, 0);

        expect(myBal2).to.be.gte(minRepaymentDAI.add(minRepaymentUSDC));
        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);


        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setyvUSDTV2TokenBalance(deployer, collatRemoved.div(10**12));
        await yvUSDT.connect(deployer).transfer(swapper.address, collatRemoved.div(10**12));

        // Do swap
        await swapper.repayHook(yvUSDT.address, swapDataUSDT);

        // Check balance

        const myShares3 = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal3 = await yieldVault.convertShares(USDR.address, myShares3, 0);

        expect(myBal3).to.be.gte(minRepaymentDAI.add(minRepaymentUSDC).add(minRepaymentUSDT));
        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            yvDAI,
            yvUSDC,
            yvUSDT,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = ethers.utils.parseEther('20000');
        const repayRequired = ethers.utils.parseEther('18200');

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256"
            ], [
                repayRequired
            ]
        );

        // Remove collateral
        await setyvDAIV2TokenBalance(deployer, collateralLiquidated);
        await yvDAI.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            yvDAI.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);


        // Remove collateral
        await setyvUSDCV2TokenBalance(deployer, collateralLiquidated.div(10**12));
        await yvUSDC.connect(deployer).transfer(swapper.address, collateralLiquidated.div(10**12));

        // Liquidate
        await swapper.liquidateHook(
            yvUSDC.address,
            otherAddress1.address,
            repayRequired,
            0,
            swapData
        );

        const yvsBal2 = await yieldVault.balanceOf(USDR.address, deployer.address);
        const yvBal2 = await yieldVault.convertShares(USDR.address, yvsBal2, 0);
        expect(yvBal2).to.be.gte(repayRequired.mul(2));
        
        const userReward2 = await USDR.balanceOf(otherAddress1.address);
        console.log(`Liquidate user reward: ${userReward2}`);
        expect(userReward2).to.be.gte(ethers.utils.parseEther("2"));

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);


        // Remove collateral
        await setyvUSDTV2TokenBalance(deployer, collateralLiquidated.div(10**12));
        await yvUSDT.connect(deployer).transfer(swapper.address, collateralLiquidated.div(10**12));

        // Liquidate
        await swapper.liquidateHook(
            yvUSDT.address,
            otherAddress1.address,
            repayRequired,
            0,
            swapData
        );

        const yvsBal3 = await yieldVault.balanceOf(USDR.address, deployer.address);
        const yvBal3 = await yieldVault.convertShares(USDR.address, yvsBal3, 0);
        expect(yvBal3).to.be.gte(repayRequired.mul(3));
        
        const userReward3 = await USDR.balanceOf(otherAddress1.address);
        console.log(`Liquidate user reward: ${userReward3}`);
        expect(userReward3).to.be.gte(ethers.utils.parseEther("3"));

        await checkSwapperEmptyBalance(swapper, USDR, yvDAI, yvUSDC, yvUSDT);
    });
});
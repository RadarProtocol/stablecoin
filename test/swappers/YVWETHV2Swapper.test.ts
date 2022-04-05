import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { LickHitter, RadarUSD, YVWETHV2Swapper } from "../../typechain";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance ,setyvWETHV2TokenBalance } from "./utils/USDRCurve";

const YearnSharePriceInterface = new ethers.utils.Interface([
    "function pricePerShare() external view returns (uint256)"
]);

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const yvWETHAddress = "0xa258C4606Ca8206D8aA700cE2143D7db854D168c";
    const yvWETH = stableFactory.attach(yvWETHAddress);

    const WETHAddress = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
    const WETH = stableFactory.attach(WETHAddress);

    const USDCAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const USDC = stableFactory.attach(USDCAddress);

    const Pool3Address = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const POOL3 = stableFactory.attach(Pool3Address);

    const yvFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yvFactory.deploy(
        otherAddress1.address
    );

    const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

    const BUFFER = ethers.utils.parseEther('10');
    await yieldVault.addSupportedToken(yvWETH.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("YVWETHV2Swapper");
    const swapper = await swapperFactory.deploy(
        USDR.address,
        WETHAddress,
        USDCAddress,
        yvWETHAddress,
        USDRPool.address,
        UNISWAP_V3_ROUTER,
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
        WETH,
        USDC,
        POOL3,
        USDRPool,
        yvWETH,
        UNISWAP_V3_ROUTER,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: YVWETHV2Swapper,
    USDR: any,
    yvWETH: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await yvWETH.balanceOf(swapper.address);
    expect(b1).to.eq(b2).to.eq(0);
}

describe('YVWETHV2Swapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            USDC,
            UNISWAP_V3_ROUTER,
            WETH,
            yvWETH,
            USDRPool,
            swapper,
            yieldVault
        } = await snapshot();

        const allowanceCheck = async (
            USDR: RadarUSD,
            USDRPool: any,
            USDC: any,
            UNI_ROUTER: any,
            yvw: any,
            yv: any,
            weth: any,
            swapper: YVWETHV2Swapper,
            allowance: BigNumberish
        ) => {
            const a1 = await USDR.allowance(swapper.address, USDRPool.address);
            const a2 = await USDC.allowance(swapper.address, UNI_ROUTER);
            const a3 = await weth.allowance(swapper.address, yvw.address);
            const a4 = await weth.allowance(swapper.address, UNI_ROUTER);
            const a5 = await USDC.allowance(swapper.address, USDRPool.address);
            const a6 = await USDR.allowance(swapper.address, yv.address);

            expect(a1)
            .to.eq(a2)
            .to.eq(a3)
            .to.eq(a4)
            .to.eq(a5)
            .to.eq(a6)
            .to.eq(allowance);
        }

        await allowanceCheck(
            USDR,
            USDRPool,
            USDC,
            UNISWAP_V3_ROUTER,
            yvWETH,
            yieldVault,
            WETH,
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            USDR,
            USDRPool,
            USDC,
            UNISWAP_V3_ROUTER,
            yvWETH,
            yieldVault,
            WETH,
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            yvWETH
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

        await swapper.depositHook(yvWETH.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            yvWETH,
            yieldVault,
            deployer
        } = await snapshot();

        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("0.0003381828758");

        const SLIPPAGE_TOLERANCE = 100;
        const directDeposit = ethers.utils.parseEther('1')
        const borrow = ethers.utils.parseEther('10000');
        const minUSDC = borrow.sub(borrow.mul(SLIPPAGE_TOLERANCE).div(10000)).div(10**12);
        const minWETH = minUSDC.sub(minUSDC.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(approxWethPrice).div(10**6);
        const yvC = new ethers.Contract(
            yvWETH.address,
            YearnSharePriceInterface,
            deployer
        );
        const sp = await yvC.pricePerShare();
        const myMinCollateral = minWETH.mul(ethers.utils.parseEther('1')).div(sp).add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC,
                minWETH
            ]
        );

        // Direct deposit yvWETHV2
        await setyvWETHV2TokenBalance(deployer, BigNumber.from(directDeposit));
        await yvWETH.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(yvWETH.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(yvWETH.address, deployer.address);
        const myBal = await yieldVault.convertShares(yvWETH.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, USDR, yvWETH);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            yvWETH,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const yvC = new ethers.Contract(
            yvWETH.address,
            YearnSharePriceInterface,
            deployer
        );
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const sp = await yvC.pricePerShare();
        const directRepay = ethers.utils.parseEther('100'); // repay 1 USDR
        const collatRemoved = ethers.utils.parseEther('1'); // 1 yvWETH UST
        const minUSDC = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(sp).div(ethers.utils.parseEther('1')).mul(approxWethPrice).div(ethers.utils.parseEther('1')).div(10**12);
        const minUSDR = minUSDC.sub(minUSDC.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setyvWETHV2TokenBalance(deployer, collatRemoved);
        await yvWETH.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(yvWETH.address, swapData);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, USDR, yvWETH);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            yvWETH,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = ethers.utils.parseEther('5') // 5 yvWETH
        const repayRequired = ethers.utils.parseEther('12000');
        const yvC = new ethers.Contract(
            yvWETH.address,
            YearnSharePriceInterface,
            deployer
        );
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const sp = await yvC.pricePerShare();
        const minUSDC = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(sp).div(ethers.utils.parseEther('1')).mul(approxWethPrice).div(ethers.utils.parseEther('1')).div(10**12);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256"
            ], [
                minUSDC,
                repayRequired
            ]
        );

        // Remove collateral
        await setyvWETHV2TokenBalance(deployer, collateralLiquidated);
        await yvWETH.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            yvWETH.address,
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

        await checkSwapperEmptyBalance(swapper, USDR, yvWETH);
    });
});
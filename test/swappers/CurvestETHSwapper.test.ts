import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { CurvestETHSwapper } from "../../typechain";
import { allowanceCheck } from "./utils/SwapperTestUtils";
import { deployUSDR3PoolCurveFactory, set3PoolTokenBalance , setcrvstETHTokenBalance } from "./utils/USDRCurve";

const CurveVirtualPriceInterface = new ethers.utils.Interface([
    "function get_virtual_price() external view returns (uint256)"
]);

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await stableFactory.deploy();

    const crvstETHAddress = "0x06325440D014e39736583c165C2963BA99fAf14E";
    const crvstETHPool = "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022";
    const crvstETH = stableFactory.attach(crvstETHAddress);

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
    await yieldVault.addSupportedToken(crvstETH.address, BUFFER);
    await yieldVault.addSupportedToken(USDR.address, BUFFER);

    const USDRPool = await deployUSDR3PoolCurveFactory(
        deployer,
        USDR,
        POOL3,
        10000000 // 0.1%
    );

    const swapperFactory = await ethers.getContractFactory("CurvestETHSwapper");
    const swapper = await swapperFactory.deploy(
        WETHAddress,
        crvstETHAddress,
        USDR.address,
        USDCAddress,
        USDRPool.address,
        crvstETHPool,
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
        crvstETH,
        crvstETHPool,
        UNISWAP_V3_ROUTER,
        swapper,
        yieldVault
    }
}

const checkSwapperEmptyBalance = async (
    swapper: CurvestETHSwapper,
    deployer: SignerWithAddress,
    USDR: any,
    crvstETH: any,
    USDC: any,
    WETH: any
) => {
    const b1 = await USDR.balanceOf(swapper.address);
    const b2 = await crvstETH.balanceOf(swapper.address);
    const b3 = await USDC.balanceOf(swapper.address);
    const b4 = await WETH.balanceOf(swapper.address);
    const b5 = await deployer.provider!.getBalance(swapper.address);
    expect(b1)
    .to.eq(b2)
    .to.eq(b3)
    .to.eq(b4)
    .to.eq(b5)
    .to.eq(0);
}

describe('CurvestETHSwapper', () => {
    it("approve all", async () => {
        const {
            USDR,
            USDC,
            UNISWAP_V3_ROUTER,
            WETH,
            crvstETH,
            crvstETHPool,
            USDRPool,
            swapper,
            yieldVault
        } = await snapshot();

        await allowanceCheck(
            [USDR, USDC, crvstETH, crvstETH, WETH, USDC, USDR],
            [USDRPool.address, UNISWAP_V3_ROUTER, yieldVault.address, crvstETHPool, UNISWAP_V3_ROUTER, USDRPool.address, yieldVault.address],
            swapper,
            0
        );

        await swapper.reApprove();

        await allowanceCheck(
            [USDR, USDC, crvstETH, crvstETH, WETH, USDC, USDR],
            [USDRPool.address, UNISWAP_V3_ROUTER, yieldVault.address, crvstETHPool, UNISWAP_V3_ROUTER, USDRPool.address, yieldVault.address],
            swapper,
            ethers.constants.MaxUint256
        );
    });
    it("checkAllowance", async () => {
        const {
            swapper,
            USDR,
            crvstETH
        } = await snapshot();

        // Swap should not be possible if checkAllowance doesn't work
        const TEST_AMT = ethers.utils.parseEther('100');
        await USDR.mint(swapper.address, TEST_AMT);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                0,
                0,
                0
            ]
        );

        await swapper.depositHook(crvstETH.address, swapData);

    });
    it("depositHook", async () => {
        const {
            swapper,
            USDR,
            USDC,
            WETH,
            crvstETH,
            crvstETHPool,
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
        const crvP = new ethers.Contract(
            crvstETHPool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await crvP.get_virtual_price();
        const mincrvstETH = minWETH.mul(ethers.utils.parseEther('1')).div(vp);
        const myMinCollateral = mincrvstETH.add(directDeposit);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minUSDC,
                minWETH,
                mincrvstETH
            ]
        );

        // Direct deposit crvstETH
        await setcrvstETHTokenBalance(deployer, BigNumber.from(directDeposit));
        await crvstETH.connect(deployer).transfer(swapper.address, directDeposit);

        // Borrow USDT
        await USDR.mint(swapper.address, borrow);

        // Do swap
        await swapper.depositHook(crvstETH.address, swapData);

        const mySharesBal = await yieldVault.balanceOf(crvstETH.address, deployer.address);
        const myBal = await yieldVault.convertShares(crvstETH.address, mySharesBal, 0);
        expect(myBal).to.be.gte(myMinCollateral);

        await checkSwapperEmptyBalance(swapper, deployer, USDR, crvstETH, USDC, WETH);
    });
    it("repayHook", async () => {
        const {
            swapper,
            USDR,
            USDC,
            WETH,
            crvstETH,
            crvstETHPool,
            yieldVault,
            deployer
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 200;
        const crvP = new ethers.Contract(
            crvstETHPool,
            CurveVirtualPriceInterface,
            deployer
        );
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const vp = await crvP.get_virtual_price();
        const directRepay = ethers.utils.parseEther('100'); // repay 100 USDR
        const collatRemoved = ethers.utils.parseEther('1'); // 1 crvstETH UST
        const minETH = collatRemoved.sub(collatRemoved.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(vp).div(ethers.utils.parseEther('1'))
        const minUSDC = minETH.sub(minETH.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(approxWethPrice).div(ethers.utils.parseEther('1')).div(10**12);
        const minUSDR = minUSDC.sub(minUSDC.mul(SLIPPAGE_TOLERANCE).div(10000));
        const minRepayment = directRepay.add(minUSDR);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minETH,
                minUSDC,
                minUSDR
            ]
        );

        // direct repay
        await USDR.mint(swapper.address, directRepay);

        // Remove collateral
        await setcrvstETHTokenBalance(deployer, collatRemoved);
        await crvstETH.connect(deployer).transfer(swapper.address, collatRemoved);

        // Do swap
        await swapper.repayHook(crvstETH.address, swapData);

        // Check balance

        const myShares = await yieldVault.balanceOf(USDR.address, deployer.address);
        const myBal = await yieldVault.convertShares(USDR.address, myShares, 0);

        expect(myBal).to.be.gte(minRepayment);
        await checkSwapperEmptyBalance(swapper, deployer, USDR, crvstETH, USDC, WETH);
    });
    it("liquidateHook", async () => {
        const {
            swapper,
            USDR,
            crvstETH,
            crvstETHPool,
            USDC,
            WETH,
            yieldVault,
            deployer,
            otherAddress1
        } = await snapshot();

        const SLIPPAGE_TOLERANCE = 180;
        const collateralLiquidated = ethers.utils.parseEther('5') // 5 crvstETH
        const repayRequired = ethers.utils.parseEther('12000');
        const crvP = new ethers.Contract(
            crvstETHPool,
            CurveVirtualPriceInterface,
            deployer
        );
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const vp = await crvP.get_virtual_price();
        const minETH = collateralLiquidated.sub(collateralLiquidated.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(vp).div(ethers.utils.parseEther('1'))
        const minUSDC = minETH.sub(minETH.mul(SLIPPAGE_TOLERANCE).div(10000)).mul(approxWethPrice).div(ethers.utils.parseEther('1')).div(10**12);

        const abiCoder = new ethers.utils.AbiCoder();
        const swapData = abiCoder.encode(
            [
                "uint256",
                "uint256",
                "uint256"
            ], [
                minETH,
                minUSDC,
                repayRequired
            ]
        );

        // Remove collateral
        await setcrvstETHTokenBalance(deployer, collateralLiquidated);
        await crvstETH.connect(deployer).transfer(swapper.address, collateralLiquidated);

        // Liquidate
        await swapper.liquidateHook(
            crvstETH.address,
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

        await checkSwapperEmptyBalance(swapper, deployer, USDR, crvstETH, USDC, WETH);
    });
});
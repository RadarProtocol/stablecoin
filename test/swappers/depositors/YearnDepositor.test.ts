import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LendingPair, LickHitter } from "../../../typechain";
import { BigNumber } from "ethers";
import { setUSDTTokenBalance } from "../utils/USDRCurve";

const snapshot = async () => {
    const [deployer, investor, pokeMe, otherAddress1] = await ethers.getSigners();

    const depositorFactory = await ethers.getContractFactory("YearnDepositor");
    const depositor = await depositorFactory.deploy("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

    const yieldVaultFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yieldVaultFactory.deploy(pokeMe.address);

    const masterFactory = await ethers.getContractFactory("LendingPair");
    const proxyFactory = await ethers.getContractFactory("LendingNUP");

    const masterContract = await masterFactory.deploy();

    const usdrFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await usdrFactory.deploy();

    return {
        deployer,
        investor,
        depositor,
        yieldVault,
        proxyFactory,
        masterContract,
        masterFactory,
        USDR,
        usdrFactory,
        otherAddress1
    }
}

const YearnSharePriceInterface = new ethers.utils.Interface([
    "function pricePerShare() external view returns (uint256)"
]);

const depositChecks = async (
    inv: SignerWithAddress,
    lendingPair: LendingPair,
    tkn: any,
    yv: LickHitter,
    vc: Array<any>
) => {
    var i = 0;

    const lpBal = await tkn.balanceOf(lendingPair.address);
    const userShares = await lendingPair.getCollateralBalance(inv.address);
    const yvBal = await yv.tokenBalanceOf(tkn.address, lendingPair.address);
    const yvActBal = await tkn.balanceOf(yv.address);

    expect(lpBal).to.eq(vc[i++]);
    expect(userShares)
    .to.eq(yvBal)
    .to.eq(yvActBal)
    .to.be.closeTo(vc[i++], 100);
}

describe("YearnDepositor", () => {
    it("Direct ETH Deposit", async () => {
        const {
            investor,
            depositor,
            yieldVault,
            proxyFactory,
            masterContract,
            masterFactory,
            USDR,
            usdrFactory,
            otherAddress1
        } = await snapshot();

        const WETH_address = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
        const yvWETH_address = "0xa258C4606Ca8206D8aA700cE2143D7db854D168c";

        const depositAmount = ethers.utils.parseEther('20'); // 20 ETH

        // Create lending pair and register assets
        await yieldVault.addSupportedToken(yvWETH_address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            yvWETH_address,
            USDR.address,
            100, // 1%
            100, // 1%
            500, // 5%
            1000, // 10%
            yieldVault.address,
            otherAddress1.address,
            9200, // 92%
            otherAddress1.address,
            otherAddress1.address
        ]);

        const lendingPairProxy = await proxyFactory.deploy(initData, masterContract.address);
        const lendingPair = masterFactory.attach(lendingPairProxy.address);

        // Deposit through depositor
        const tx = await depositor.connect(investor).depositYearnUnderlying(
            investor.address,
            yvWETH_address,
            WETH_address,
            lendingPair.address,
            depositAmount,
            true,
            {
                value: depositAmount
            }
        );
        const rc = await tx.wait();

        const yvWETH = await usdrFactory.attach(yvWETH_address);
        const yvWETH_pps = new ethers.Contract(
            yvWETH_address,
            YearnSharePriceInterface,
            investor
        );
        const sp = await yvWETH_pps.pricePerShare();
        const recYearn = depositAmount.mul(ethers.utils.parseEther('1')).div(sp);

        await depositChecks(
            investor,
            lendingPair,
            yvWETH,
            yieldVault,
            [
                0,
                recYearn
            ]
        );

        // Do it again to see reduces gas cost (no approve, two less SSTORE OPCODEs)
        const tx2 = await depositor.connect(investor).depositYearnUnderlying(
            investor.address,
            yvWETH_address,
            WETH_address,
            lendingPair.address,
            depositAmount,
            true,
            {
                value: depositAmount
            }
        );
        const rc2 = await tx2.wait();

        await depositChecks(
            investor,
            lendingPair,
            yvWETH,
            yieldVault,
            [
                0,
                recYearn.mul(2)
            ]
        );

        expect(rc.gasUsed.sub(40000)).to.be.gte(rc2.gasUsed);
    });
    it("USDT Deposit", async () => {
        const {
            investor,
            depositor,
            yieldVault,
            proxyFactory,
            masterContract,
            masterFactory,
            USDR,
            usdrFactory,
            otherAddress1
        } = await snapshot();

        const USDT_address = "0xdac17f958d2ee523a2206206994597c13d831ec7";
        const USDT = await usdrFactory.attach(USDT_address);
        const yvUSDT_address = "0x7Da96a3891Add058AdA2E826306D812C638D87a7";

        const depositAmount = BigNumber.from(100 * 10**6); // 100 USDT

        // Create lending pair and register assets
        await yieldVault.addSupportedToken(yvUSDT_address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            yvUSDT_address,
            USDR.address,
            100, // 1%
            100, // 1%
            500, // 5%
            1000, // 10%
            yieldVault.address,
            otherAddress1.address,
            9200, // 92%
            otherAddress1.address,
            otherAddress1.address
        ]);

        const lendingPairProxy = await proxyFactory.deploy(initData, masterContract.address);
        const lendingPair = masterFactory.attach(lendingPairProxy.address);

        // Get USDT
        await setUSDTTokenBalance(investor, depositAmount);
        await USDT.connect(investor).approve(depositor.address, depositAmount);

        // Deposit through depositor
        const tx = await depositor.connect(investor).depositYearnUnderlying(
            investor.address,
            yvUSDT_address,
            USDT_address,
            lendingPair.address,
            depositAmount,
            false
        );
        await tx.wait();

        const yvUSDT = await usdrFactory.attach(yvUSDT_address);
        const yvUSDT_pps = new ethers.Contract(
            yvUSDT_address,
            YearnSharePriceInterface,
            investor
        );
        const sp = await yvUSDT_pps.pricePerShare();
        const recYearn = depositAmount.mul(10**6).div(sp);

        await depositChecks(
            investor,
            lendingPair,
            yvUSDT,
            yieldVault,
            [
                0,
                recYearn
            ]
        );
    });
});
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LendingPair, LickHitter } from "../../../typechain";
import { BigNumber } from "ethers";
import { setFRAXTokenBalance, setUSDTTokenBalance } from "../utils/USDRCurve";

const snapshot = async () => {
    const [deployer, investor, pokeMe, otherAddress1] = await ethers.getSigners();

    const depositorFactory = await ethers.getContractFactory("CurveDepositor");
    const depositor = await depositorFactory.deploy();

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

const CurveVirtualPriceInterface = new ethers.utils.Interface([
    "function get_virtual_price() external view returns (uint256)"
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
    .to.be.closeTo(vc[i++], userShares.div(100));
}

describe("CurveDepositor", () => {
    it("stETH (use eth)", async () => {
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

        const crvstETHAddress = "0x06325440D014e39736583c165C2963BA99fAf14E";

        const depositAmount = ethers.utils.parseEther('20'); // 20 ETH

        // Create lending pair and register assets
        await yieldVault.addSupportedToken(crvstETHAddress, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            crvstETHAddress,
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
        const crvstETH = await usdrFactory.attach(crvstETHAddress);
        const crvstETH_vp = new ethers.Contract(
            "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
            CurveVirtualPriceInterface,
            investor
        );
        const vp = await crvstETH_vp.get_virtual_price();
        const recCurve = depositAmount.mul(ethers.utils.parseEther('1')).div(vp);

        const add_liquidity_interface = new ethers.utils.Interface(["function add_liquidity(uint256[2] memory,uint256) external payable returns (uint256)"]);
        const addLiquidityTx = add_liquidity_interface.encodeFunctionData("add_liquidity", [
            [depositAmount, 0],
            recCurve.sub(recCurve.div(100))
        ]);
        const tx = await depositor.connect(investor).depositCurveAddLiquidity(
            investor.address,
            crvstETHAddress,
            "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
            addLiquidityTx,
            ethers.constants.AddressZero,
            lendingPair.address,
            depositAmount,
            true,
            {
                value: depositAmount
            }
        );
        const rc = await tx.wait();

        await depositChecks(
            investor,
            lendingPair,
            crvstETH,
            yieldVault,
            [
                0,
                recCurve
            ]
        );

        // Do it again to see reduces gas cost (no approve, two less SSTORE OPCODEs)
        const tx2 = await depositor.connect(investor).depositCurveAddLiquidity(
            investor.address,
            crvstETHAddress,
            "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
            addLiquidityTx,
            ethers.constants.AddressZero,
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
            crvstETH,
            yieldVault,
            [
                0,
                recCurve.mul(2)
            ]
        );

        expect(rc.gasUsed.sub(20000)).to.be.gte(rc2.gasUsed);
    });
    it("crvIB", async () => {
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

        const crvIBAddress = "0x5282a4eF67D9C33135340fB3289cc1711c13638C";

        const depositAmount = BigNumber.from(1000 * 10**6); // 1000 USDT

        // Create lending pair and register assets
        await yieldVault.addSupportedToken(crvIBAddress, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            crvIBAddress,
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
        const crvstIB = await usdrFactory.attach(crvIBAddress);
        const crvstIB_vp = new ethers.Contract(
            "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF",
            CurveVirtualPriceInterface,
            investor
        );
        const vp = await crvstIB_vp.get_virtual_price();
        const recCurve = depositAmount.mul(ethers.utils.parseEther('1')).div(vp);

        const add_liquidity_interface = new ethers.utils.Interface(["function add_liquidity(uint256[3] memory,uint256,bool) external returns (uint256)"]);
        const addLiquidityTx = add_liquidity_interface.encodeFunctionData("add_liquidity", [
            [0, 0, depositAmount],
            recCurve.sub(recCurve.div(100)),
            true
        ]);

        await setUSDTTokenBalance(investor, depositAmount);
        const USDT = await usdrFactory.attach("0xdAC17F958D2ee523a2206206994597C13D831ec7");
        await USDT.connect(investor).approve(depositor.address, depositAmount);
        await depositor.connect(investor).depositCurveAddLiquidity(
            investor.address,
            crvIBAddress,
            "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF",
            addLiquidityTx,
            "0xdAC17F958D2ee523a2206206994597C13D831ec7",
            lendingPair.address,
            depositAmount,
            false
        );

        await depositChecks(
            investor,
            lendingPair,
            crvstIB,
            yieldVault,
            [
                0,
                recCurve.mul(10**12) // Scale decimals
            ]
        );
    });
    it("crvFRAX", async () => {
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

        const crvFRAXAddress = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B";

        const depositAmount = ethers.utils.parseEther('1000') // 1000 FRAX

        // Create lending pair and register assets
        await yieldVault.addSupportedToken(crvFRAXAddress, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            crvFRAXAddress,
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
        const crvFRAX = await usdrFactory.attach(crvFRAXAddress);
        const crvFRAX_vp = new ethers.Contract(
            "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
            CurveVirtualPriceInterface,
            investor
        );
        const vp = await crvFRAX_vp.get_virtual_price();
        const recCurve = depositAmount.mul(ethers.utils.parseEther('1')).div(vp);

        const add_liquidity_interface = new ethers.utils.Interface(["function add_liquidity(uint256[2] memory,uint256) external returns (uint256)"]);
        const addLiquidityTx = add_liquidity_interface.encodeFunctionData("add_liquidity", [
            [depositAmount, 0],
            recCurve.sub(recCurve.div(100))
        ]);

        await setFRAXTokenBalance(investor, depositAmount);
        const FRAX = await usdrFactory.attach("0x853d955acef822db058eb8505911ed77f175b99e");
        await FRAX.connect(investor).approve(depositor.address, depositAmount);
        await depositor.connect(investor).depositCurveAddLiquidity(
            investor.address,
            crvFRAXAddress,
            "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
            addLiquidityTx,
            "0x853d955acef822db058eb8505911ed77f175b99e",
            lendingPair.address,
            depositAmount,
            false
        );

        await depositChecks(
            investor,
            lendingPair,
            crvFRAX,
            yieldVault,
            [
                0,
                recCurve
            ]
        );
    });
});
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LendingPair, LickHitter } from "../../../../typechain";
import { setavaxDAITokenBalance, setavaxUSDCTokenBalance, setavaxwBTCTokenBalance } from "../../utils/USDRCurve";

const snapshot = async () => {
    const [deployer, investor, pokeMe, otherAddress1] = await ethers.getSigners();

    const depositorFactory = await ethers.getContractFactory("BenqiDepositor");
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

describe('Avalanche: BenqiDepositor', () => {
    it("deposit: AVAX", async () => {
        const {
            investor,
            USDR,
            otherAddress1,
            proxyFactory,
            masterFactory,
            usdrFactory,
            masterContract,
            yieldVault,
            depositor
        } = await snapshot();

        const amount = ethers.utils.parseEther('10');
        const qiAVAX = usdrFactory.attach("0xaf2c034C764d53005cC6cbc092518112cBD652bb");
        
        await yieldVault.addSupportedToken(qiAVAX.address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            qiAVAX.address,
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

        await depositor.connect(investor).deposit(
            ethers.constants.AddressZero,
            qiAVAX.address,
            lendingPair.address,
            investor.address,
            0,
            {
                value: amount
            }
        );

        await depositChecks(
            investor,
            lendingPair,
            qiAVAX,
            yieldVault,
            [
                0,
                amount.div(10**10).mul(50) // Scale
            ]
        );
    });
    it("deposit: DAI", async () => {
        const {
            investor,
            USDR,
            otherAddress1,
            proxyFactory,
            masterFactory,
            usdrFactory,
            masterContract,
            yieldVault,
            depositor
        } = await snapshot();

        const amount = ethers.utils.parseEther('10');
        const qiDAIPrice = ethers.utils.parseEther('0.0207828453');
        const DAI = usdrFactory.attach("0xd586e7f844cea2f87f50152665bcbc2c279d8d70");
        const qiDAI = usdrFactory.attach("0x835866d37afb8cb8f8334dccdaf66cf01832ff5d");
        
        await yieldVault.addSupportedToken(qiDAI.address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            qiDAI.address,
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

        await setavaxDAITokenBalance(investor, amount);
        await DAI.connect(investor).approve(depositor.address, amount);

        await depositor.connect(investor).deposit(
            DAI.address,
            qiDAI.address,
            lendingPair.address,
            investor.address,
            amount
        );

        await depositChecks(
            investor,
            lendingPair,
            qiDAI,
            yieldVault,
            [
                0,
                amount.div(10**10).mul(ethers.utils.parseEther('1')).div(qiDAIPrice) // Scale
            ]
        );
    });
    it("deposit: wBTC", async () => {
        const {
            investor,
            USDR,
            otherAddress1,
            proxyFactory,
            masterFactory,
            usdrFactory,
            masterContract,
            yieldVault,
            depositor
        } = await snapshot();

        const amount = ethers.utils.parseEther('10');
        const qiBTCPrice = ethers.utils.parseEther('0.02');
        const wBTC = usdrFactory.attach("0x50b7545627a5162F82A992c33b87aDc75187B218");
        const qiBTC = usdrFactory.attach("0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568");
        
        await yieldVault.addSupportedToken(qiBTC.address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            qiBTC.address,
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

        await setavaxwBTCTokenBalance(investor, amount);
        await wBTC.connect(investor).approve(depositor.address, amount);

        await depositor.connect(investor).deposit(
            wBTC.address,
            qiBTC.address,
            lendingPair.address,
            investor.address,
            amount
        );

        await depositChecks(
            investor,
            lendingPair,
            qiBTC,
            yieldVault,
            [
                0,
                amount.mul(ethers.utils.parseEther('1')).div(qiBTCPrice) // Scale
            ]
        );
    });
    it("deposit: USDC", async () => {
        const {
            investor,
            USDR,
            otherAddress1,
            proxyFactory,
            masterFactory,
            usdrFactory,
            masterContract,
            yieldVault,
            depositor
        } = await snapshot();

        const amount = ethers.utils.parseEther('10');
        const qiUSDCPrice = ethers.utils.parseEther('0.02058731523');
        const USDC = usdrFactory.attach("0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664");
        const qiUSDC = usdrFactory.attach("0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F");
        
        await yieldVault.addSupportedToken(qiUSDC.address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            qiUSDC.address,
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

        await setavaxUSDCTokenBalance(investor, amount);
        await USDC.connect(investor).approve(depositor.address, amount);

        await depositor.connect(investor).deposit(
            USDC.address,
            qiUSDC.address,
            lendingPair.address,
            investor.address,
            amount
        );

        await depositChecks(
            investor,
            lendingPair,
            qiUSDC,
            yieldVault,
            [
                0,
                amount.mul(10**2).mul(ethers.utils.parseEther('1')).div(qiUSDCPrice) // Scale
            ]
        );
    });
});
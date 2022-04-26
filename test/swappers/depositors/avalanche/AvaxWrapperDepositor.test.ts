import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LendingPair, LickHitter } from "../../../../typechain";

const snapshot = async () => {
    const [deployer, investor, pokeMe, otherAddress1] = await ethers.getSigners();

    const depositorFactory = await ethers.getContractFactory("AvaxWrapperDepositor");
    const depositor = await depositorFactory.deploy();

    const yieldVaultFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yieldVaultFactory.deploy(pokeMe.address);

    const masterFactory = await ethers.getContractFactory("LendingPair");
    const proxyFactory = await ethers.getContractFactory("LendingNUP");

    const masterContract = await masterFactory.deploy();

    const usdrFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await usdrFactory.deploy();

    const WAVAX = await usdrFactory.attach("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");

    return {
        deployer,
        investor,
        depositor,
        yieldVault,
        proxyFactory,
        masterContract,
        masterFactory,
        USDR,
        WAVAX,
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

describe('Avalanche: AvaxWrapperDepositor', () => {
    it('deposit', async () => {
        const {
            investor,
            WAVAX,
            USDR,
            otherAddress1,
            proxyFactory,
            masterFactory,
            masterContract,
            yieldVault,
            depositor
        } = await snapshot();

        const amount = ethers.utils.parseEther('10');
        
        await yieldVault.addSupportedToken(WAVAX.address, 0);

        const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);
        const initData = initInterface.encodeFunctionData("init", [
            WAVAX.address,
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
            lendingPair.address,
            investor.address,
            {
                value: amount
            }
        );

        await depositChecks(
            investor,
            lendingPair,
            WAVAX,
            yieldVault,
            [
                0,
                amount
            ]
        );
    });
});
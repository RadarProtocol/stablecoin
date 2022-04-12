import { ethers } from "hardhat";
import { expect } from "chai";
import { setcrvFRAXTokenBalance, setcrvIBTokenBalance, setcrvstETHTokenBalance, setCRVTokenBalance, setCVXTokenBalance } from "../swappers/utils/USDRCurve";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ConvexCurveLPStrategy, LickHitter } from "../../typechain";

const snapshot = async () => {
    const [deployer, otherAddress1, investor, pokeMe] = await ethers.getSigners();

    const USDRFactory = await ethers.getContractFactory("RadarUSD");
    
    const crvstETH = USDRFactory.attach("0x06325440D014e39736583c165C2963BA99fAf14E");
    const crvIB = USDRFactory.attach("0x5282a4eF67D9C33135340fB3289cc1711c13638C");
    const crvFRAX = USDRFactory.attach("0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B");
    const CRV = USDRFactory.attach("0xD533a949740bb3306d119CC777fa900bA034cd52");
    const CVX = USDRFactory.attach("0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B");

    const yieldVaultFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yieldVaultFactory.deploy(pokeMe.address);

    await yieldVault.addSupportedTokens(
        [crvstETH.address, crvIB.address, crvFRAX.address],
        [0, 0, 0]
    );

    const convexTokensStrategyData = [
        {
            token: crvstETH.address,
            pid: 25,
            poolType: 1,
            crvPool: "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022"
        }, {
            token: crvFRAX.address,
            pid: 32,
            poolType: 0,
            crvPool: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"
        }
    ];

    const _tokens = convexTokensStrategyData.map(x => x.token);
    const _pids = convexTokensStrategyData.map(x => x.pid);
    const _ptps = convexTokensStrategyData.map(x => x.poolType);
    const _ps = convexTokensStrategyData.map(x => x.crvPool);

    const strategyDeployer = await ethers.getContractFactory("ConvexCurveLPStrategy");
    const strategy = await strategyDeployer.deploy(
        yieldVault.address,
        _tokens,
        _pids,
        _ptps,
        _ps,
        ethers.utils.parseEther('1')
    );

    await strategy.updatePid(crvIB.address, 29, 2, "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF");

    await yieldVault.addStrategy(crvstETH.address, strategy.address);
    await yieldVault.addStrategy(crvIB.address, strategy.address);
    await yieldVault.addStrategy(crvFRAX.address, strategy.address);

    return {
        crvstETH,
        crvIB,
        crvFRAX,
        yieldVault,
        deployer,
        otherAddress1,
        USDRFactory,
        investor,
        pokeMe,
        CRV,
        CVX,
        convexTokensStrategyData,
        strategy
    }
}

const withdrawChecks = async (
    token: any,
    inv: SignerWithAddress,
    cvxRewardPool: any,
    yv: LickHitter,
    s: ConvexCurveLPStrategy,
    vc: Array<any>
) => {
    var i = 0;

    const tyvbal = await token.balanceOf(yv.address);
    const tsbal = await token.balanceOf(s.address);
    expect(tyvbal).to.eq(vc[i++]);
    expect(tsbal).to.eq(vc[i++]);

    const iyvbal = await yv.balanceOf(token.address, inv.address);
    expect(iyvbal).to.eq(vc[i++]);

    const rpb = await cvxRewardPool.balanceOf(s.address);
    expect(rpb).to.eq(vc[i++]);

    const iv = await s.invested(token.address);
    expect(iv).to.eq(vc[i++]);

    const userBal = await token.balanceOf(inv.address);
    expect(userBal).to.eq(vc[i++]);
}

const harvestChecks = async (
    token: any,
    inv: SignerWithAddress,
    cvxRewardPool: any,
    yv: LickHitter,
    s: ConvexCurveLPStrategy,
    vc: Array<any>
) => {
    var i = 0;

    const tyvbal = await token.balanceOf(yv.address);
    const tsbal = await token.balanceOf(s.address);
    expect(tyvbal).to.eq(vc[i++]);
    expect(tsbal).to.eq(vc[i++]);

    const iyvbal = await yv.balanceOf(token.address, inv.address);
    expect(iyvbal).to.eq(vc[i++]);

    const iActualBal = await yv.convertShares(token.address, iyvbal, 0);
    expect(iActualBal).to.be.closeTo(vc[i++], iActualBal.div(10));

    const rpb = await cvxRewardPool.balanceOf(s.address);
    expect(rpb).to.be.closeTo(vc[i++], rpb.div(10));

    const iv = await s.invested(token.address);
    expect(iv).to.be.closeTo(vc[i++], iv.div(10));
}

describe('ConvexCurveLPStrategy', () => {
    it("Initial State Getters", async () => {
        const {
            yieldVault,
            strategy,
            otherAddress1,
            crvstETH
        } = await snapshot();

        const invested1 = await strategy.invested(crvstETH.address);
        expect(invested1).to.eq(0);
        await expect(strategy.invested(otherAddress1.address)).to.be.revertedWith("Unsupported token");

        const il = await strategy.isLiquid(crvstETH.address, 0);
        expect(il).to.eq(true);

        const sh = await strategy.shouldHarvest(crvstETH.address);
        expect(sh).to.eq(false);
        await expect(strategy.shouldHarvest(otherAddress1.address)).to.be.revertedWith("Unsupported token");

        const giv = await strategy.getInvestor();
        expect(giv).to.eq(yieldVault.address);

        const git1 = await strategy.getIsSupportedToken(crvstETH.address);
        expect(git1).to.eq(true);
        const git2 = await strategy.getIsSupportedToken(otherAddress1.address);
        expect(git2).to.eq(false);
    });
    it("Access Control", async () => {
        const {
            strategy,
            otherAddress1
        } = await snapshot();

        await expect(strategy.connect(otherAddress1).updatePid(ethers.constants.AddressZero, 0, 0, ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(strategy.connect(otherAddress1).updateMinCRVHarvestAmount(0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.connect(otherAddress1).withdrawBlockedAssets(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");

        await expect(strategy.depositToStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.withdrawFromStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.exit(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(strategy.harvest(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
    });
    it("State Setters", async () => {
        const {
            strategy,
            crvstETH,
            otherAddress1,
            USDRFactory
        } = await snapshot();

        const mockToken = await USDRFactory.deploy();

        await strategy.updatePid(mockToken.address, 0, 0, ethers.constants.AddressZero);

        const sh = await strategy.shouldHarvest(crvstETH.address);
        expect(sh).to.eq(false);

        await strategy.updateMinCRVHarvestAmount(0);

        const sh2 = await strategy.shouldHarvest(crvstETH.address);
        expect(sh2).to.eq(true);
    });
    it("withdraw blocked assets", async () => {
        const {
            strategy,
            crvFRAX,
            deployer,
            otherAddress1
        } = await snapshot();
        const amount = ethers.utils.parseEther('1');

        await setcrvFRAXTokenBalance(deployer, amount);
        await crvFRAX.transfer(strategy.address, amount);

        await strategy.withdrawBlockedAssets(crvFRAX.address, otherAddress1.address, amount);

        const b = await crvFRAX.balanceOf(otherAddress1.address);
        expect(b).to.eq(amount);
    });
    it("deposit", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvFRAX,
            crvIB,
            crvstETH,
            pokeMe,
            USDRFactory
        } = await snapshot();

        const depositChecks = async (
            token: any,
            inv: SignerWithAddress,
            cvxRewardPool: any,
            yv: LickHitter,
            s: ConvexCurveLPStrategy,
            vc: Array<any>
        ) => {
            var i = 0;

            const tyvbal = await token.balanceOf(yv.address);
            const tsbal = await token.balanceOf(s.address);
            expect(tyvbal).to.eq(vc[i++]);
            expect(tsbal).to.eq(vc[i++]);

            const iyvbal = await yv.balanceOf(token.address, inv.address);
            expect(iyvbal).to.eq(vc[i++]);

            const rpb = await cvxRewardPool.balanceOf(s.address);
            expect(rpb).to.eq(vc[i++]);

            const iv = await s.invested(token.address);
            expect(iv).to.eq(vc[i++]);
        }

        const investAmount = ethers.utils.parseEther('100');

        await setcrvFRAXTokenBalance(investor, investAmount);
        await crvFRAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvFRAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvFRAX.address);
        const cvxFraxRewardPool = USDRFactory.attach("0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e");
        await depositChecks(
            crvFRAX,
            investor,
            cvxFraxRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount,
                investAmount
            ]
        );

        await setcrvIBTokenBalance(investor, investAmount);
        await crvIB.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvIB.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvIB.address);
        const cvxIBRewardPool = USDRFactory.attach("0x3E03fFF82F77073cc590b656D42FceB12E4910A8");
        await depositChecks(
            crvIB,
            investor,
            cvxIBRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount,
                investAmount
            ]
        );

        await setcrvstETHTokenBalance(investor, investAmount);
        await crvstETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvstETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvstETH.address);
        const cvxStethRewardPool = USDRFactory.attach("0x0A760466E1B4621579a82a39CB56Dda2F4E70f03");
        await depositChecks(
            crvstETH,
            investor,
            cvxStethRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount,
                investAmount
            ]
        );
    });
    it("withdraw", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvFRAX,
            crvIB,
            crvstETH,
            pokeMe,
            USDRFactory
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');
        const withdrawAmount = ethers.utils.parseEther('16');
        
        await setcrvFRAXTokenBalance(investor, investAmount);
        await crvFRAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvFRAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvFRAX.address);
        const cvxFraxRewardPool = USDRFactory.attach("0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e");
        await yieldVault.connect(investor).withdraw(crvFRAX.address, investor.address, withdrawAmount);
        await withdrawChecks(
            crvFRAX,
            investor,
            cvxFraxRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );

        await setcrvIBTokenBalance(investor, investAmount);
        await crvIB.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvIB.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvIB.address);
        const cvxIBRewardPool = USDRFactory.attach("0x3E03fFF82F77073cc590b656D42FceB12E4910A8");
        await yieldVault.connect(investor).withdraw(crvIB.address, investor.address, withdrawAmount);
        await withdrawChecks(
            crvIB,
            investor,
            cvxIBRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );

        await setcrvstETHTokenBalance(investor, investAmount);
        await crvstETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvstETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvstETH.address);
        const cvxStethRewardPool = USDRFactory.attach("0x0A760466E1B4621579a82a39CB56Dda2F4E70f03");
        await yieldVault.connect(investor).withdraw(crvstETH.address, investor.address, withdrawAmount)
        await withdrawChecks(
            crvstETH,
            investor,
            cvxStethRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );
    });
    it("exit", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvFRAX,
            crvIB,
            crvstETH,
            pokeMe,
            USDRFactory
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');
        
        await setcrvFRAXTokenBalance(investor, investAmount);
        await crvFRAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvFRAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvFRAX.address);
        const cvxFraxRewardPool = USDRFactory.attach("0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e");
        await yieldVault.emptyStrategy(crvFRAX.address);
        await withdrawChecks(
            crvFRAX,
            investor,
            cvxFraxRewardPool,
            yieldVault,
            strategy,
            [
                investAmount,
                0,
                investAmount,
                0,
                0,
                0
            ]
        );

        await setcrvIBTokenBalance(investor, investAmount);
        await crvIB.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvIB.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvIB.address);
        const cvxIBRewardPool = USDRFactory.attach("0x3E03fFF82F77073cc590b656D42FceB12E4910A8");
        await yieldVault.emptyStrategy(crvIB.address);
        await withdrawChecks(
            crvIB,
            investor,
            cvxIBRewardPool,
            yieldVault,
            strategy,
            [
                investAmount,
                0,
                investAmount,
                0,
                0,
                0
            ]
        );

        await setcrvstETHTokenBalance(investor, investAmount);
        await crvstETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvstETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvstETH.address);
        const cvxStethRewardPool = USDRFactory.attach("0x0A760466E1B4621579a82a39CB56Dda2F4E70f03");
        await yieldVault.emptyStrategy(crvstETH.address);
        await withdrawChecks(
            crvstETH,
            investor,
            cvxStethRewardPool,
            yieldVault,
            strategy,
            [
                investAmount,
                0,
                investAmount,
                0,
                0,
                0
            ]
        );
    });
    it("harvest: USDMetapool", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvFRAX,
            pokeMe,
            CRV,
            CVX,
            otherAddress1,
            USDRFactory
        } = await snapshot(); 

        const investAmount = ethers.utils.parseEther('100');
        const fakeRewardAmountCRV = ethers.utils.parseEther('8.865248227'); // $25 in CRV
        const fakeRewardAmountCVX = ethers.utils.parseEther('0.8503401361'); // $25 in CVX

        await setcrvFRAXTokenBalance(investor, investAmount);
        await crvFRAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvFRAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvFRAX.address);
        const cvxFraxRewardPool = USDRFactory.attach("0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e");

        // Send fake rewards and execute
        await strategy.updateMinCRVHarvestAmount(0);
        await setCRVTokenBalance(otherAddress1, fakeRewardAmountCRV);
        await setCVXTokenBalance(otherAddress1, fakeRewardAmountCVX);
        await CRV.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCRV);
        await CVX.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCVX);
        await yieldVault.connect(pokeMe).executeStrategy(crvFRAX.address);

        await harvestChecks(
            crvFRAX,
            investor,
            cvxFraxRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount.add(ethers.utils.parseEther('50')),
                investAmount.add(ethers.utils.parseEther('50')),
                investAmount.add(ethers.utils.parseEther('50'))
            ]
        );

        // Withdraw and check
        const actualUserAmount = await yieldVault.convertShares(crvFRAX.address, investAmount, 0);
        await yieldVault.connect(investor).withdraw(crvFRAX.address, investor.address, investAmount);
        const b = await crvFRAX.balanceOf(investor.address);
        expect(b).to.eq(actualUserAmount);
        expect(actualUserAmount).to.be.gt(investAmount);
    });
    it("harvest: ETH", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvstETH,
            pokeMe,
            CRV,
            CVX,
            otherAddress1,
            USDRFactory
        } = await snapshot(); 

        const investAmount = ethers.utils.parseEther('10');
        const fakeRewardAmountCRV = ethers.utils.parseEther('1204.9645390071'); // 1 eth in CRV
        const fakeRewardAmountCVX = ethers.utils.parseEther('115.7356948229'); // 1 eth in CVX

        await setcrvstETHTokenBalance(investor, investAmount);
        await crvstETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvstETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvstETH.address);
        const cvxStethRewardPool = USDRFactory.attach("0x0A760466E1B4621579a82a39CB56Dda2F4E70f03");

        // Send fake rewards and execute
        await strategy.updateMinCRVHarvestAmount(0);
        await setCRVTokenBalance(otherAddress1, fakeRewardAmountCRV);
        await setCVXTokenBalance(otherAddress1, fakeRewardAmountCVX);
        await CRV.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCRV);
        await CVX.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCVX);
        await yieldVault.connect(pokeMe).executeStrategy(crvstETH.address);

        await harvestChecks(
            crvstETH,
            investor,
            cvxStethRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount.add(ethers.utils.parseEther('2')),
                investAmount.add(ethers.utils.parseEther('2')),
                investAmount.add(ethers.utils.parseEther('2'))
            ]
        );

        // Withdraw and check
        const actualUserAmount = await yieldVault.convertShares(crvstETH.address, investAmount, 0);
        await yieldVault.connect(investor).withdraw(crvstETH.address, investor.address, investAmount);
        const b = await crvstETH.balanceOf(investor.address);
        expect(b).to.eq(actualUserAmount);
        expect(actualUserAmount).to.be.gt(investAmount);
    });
    it("harvest: USDDirectUnderlying", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            crvIB,
            pokeMe,
            CRV,
            CVX,
            otherAddress1,
            USDRFactory
        } = await snapshot(); 

        const investAmount = ethers.utils.parseEther('100');
        const fakeRewardAmountCRV = ethers.utils.parseEther('8.865248227'); // $25 in CRV
        const fakeRewardAmountCVX = ethers.utils.parseEther('0.8503401361'); // $25 in CVX

        await setcrvIBTokenBalance(investor, investAmount);
        await crvIB.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvIB.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvIB.address);
        const cvxIBRewardPool = USDRFactory.attach("0x3E03fFF82F77073cc590b656D42FceB12E4910A8");

        // Send fake rewards and execute
        await strategy.updateMinCRVHarvestAmount(0);
        await setCRVTokenBalance(otherAddress1, fakeRewardAmountCRV);
        await setCVXTokenBalance(otherAddress1, fakeRewardAmountCVX);
        await CRV.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCRV);
        await CVX.connect(otherAddress1).transfer(strategy.address, fakeRewardAmountCVX);
        await yieldVault.connect(pokeMe).executeStrategy(crvIB.address);

        await harvestChecks(
            crvIB,
            investor,
            cvxIBRewardPool,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount.add(ethers.utils.parseEther('50')),
                investAmount.add(ethers.utils.parseEther('50')),
                investAmount.add(ethers.utils.parseEther('50'))
            ]
        );

        // Withdraw and check
        const actualUserAmount = await yieldVault.convertShares(crvIB.address, investAmount, 0);
        await yieldVault.connect(investor).withdraw(crvIB.address, investor.address, investAmount);
        const b = await crvIB.balanceOf(investor.address);
        expect(b).to.eq(actualUserAmount);
        expect(actualUserAmount).to.be.gt(investAmount);
    });
});
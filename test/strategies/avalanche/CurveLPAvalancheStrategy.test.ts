import { ethers, network } from "hardhat";
import { expect } from "chai";
import { setavaxav3CRVTokenBalance, setavaxCRVTokenBalance, setavaxcrvUSDBTCETHTokenBalance, setavaxDAITokenBalance, setavaxWAVAXTokenBalance } from "../../swappers/utils/USDRCurve";
import { LickHitter } from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const CurveRewardContractInterface = new ethers.utils.Interface([
    "function notify_reward_amount(address _token) external",
    "function get_reward() external"
]);

const snapshot = async () => {
    const [deployer, otherAddress1, investor, pokeMe] = await ethers.getSigners();

    const USDRFactory = await ethers.getContractFactory("RadarUSD");
    
    const wAVAX = USDRFactory.attach("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    const DAI = USDRFactory.attach("0xd586E7F844cEa2F87f50152665BCbc2C279D8d70");
    const CRV = USDRFactory.attach("0x47536F17F4fF30e64A96a7555826b8f9e66ec468");

    const av3CRV = USDRFactory.attach("0x1337BedC9D22ecbe766dF105c9623922A27963EC");
    const crvUSDBTCETH = USDRFactory.attach("0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828");

    const yieldVaultFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yieldVaultFactory.deploy(pokeMe.address);

    await yieldVault.addSupportedTokens(
        [av3CRV.address, crvUSDBTCETH.address],
        [0, 0]
    );

    const strategyDeployer = await ethers.getContractFactory("CurveLPAvalancheStrategy");
    const strategy = await strategyDeployer.deploy(
        yieldVault.address,
        [CRV.address, CRV.address],
        [1, 1]
    );

    await yieldVault.addStrategy(av3CRV.address, strategy.address);
    await yieldVault.addStrategy(crvUSDBTCETH.address, strategy.address);

    return {
        wAVAX,
        DAI,
        av3CRV,
        crvUSDBTCETH,
        yieldVault,
        deployer,
        otherAddress1,
        USDRFactory,
        investor,
        pokeMe,
        CRV,
        strategy
    }
}

const harvestChecks = async (
    token: any,
    inv: SignerWithAddress,
    yv: LickHitter,
    s: any,
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

    const iv = await s.invested(token.address);
    expect(iv).to.be.closeTo(vc[i++], iv.div(10));
}

const withdrawChecks = async (
    token: any,
    inv: SignerWithAddress,
    yv: LickHitter,
    s: any,
    vc: Array<any>
) => {
    var i = 0;

    const tyvbal = await token.balanceOf(yv.address);
    const tsbal = await token.balanceOf(s.address);
    expect(tyvbal).to.eq(vc[i++]);
    expect(tsbal).to.eq(vc[i++]);

    const iyvbal = await yv.balanceOf(token.address, inv.address);
    expect(iyvbal).to.eq(vc[i++]);

    const iv = await s.invested(token.address);
    expect(iv).to.eq(vc[i++]);

    const userBal = await token.balanceOf(inv.address);
    expect(userBal).to.eq(vc[i++]);
}

describe('Avalanche: CurveLPAvalancheStrategy', async () => {
    it("Initial State Getters", async () => {
        const {
            yieldVault,
            strategy,
            otherAddress1,
            av3CRV
        } = await snapshot();

        const invested1 = await strategy.invested(av3CRV.address);
        expect(invested1).to.eq(0);
        await expect(strategy.invested(otherAddress1.address)).to.be.revertedWith("Unsupported token");

        const il = await strategy.isLiquid(av3CRV.address, 0);
        expect(il).to.eq(true);

        const sh = await strategy.shouldHarvest(av3CRV.address);
        expect(sh).to.eq(false);
        await expect(strategy.shouldHarvest(otherAddress1.address)).to.be.revertedWith("Unsupported token");

        const giv = await strategy.getInvestor();
        expect(giv).to.eq(yieldVault.address);

        const git1 = await strategy.getIsSupportedToken(av3CRV.address);
        expect(git1).to.eq(true);
        const git2 = await strategy.getIsSupportedToken(otherAddress1.address);
        expect(git2).to.eq(false);
    });
    it("Access Control", async () => {
        const {
            strategy,
            otherAddress1
        } = await snapshot();

        await expect(strategy.connect(otherAddress1).updateMinHarvest(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.connect(otherAddress1).withdrawBlockedAssets(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");

        await expect(strategy.depositToStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.withdrawFromStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.exit(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(strategy.harvest(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
    });
    it("State Setters", async () => {
        const {
            strategy,
            av3CRV,
            CRV,
            USDRFactory
        } = await snapshot();

        const mockToken = await USDRFactory.deploy();

        await strategy.updateMinHarvest(av3CRV.address, CRV.address, 0);

        const sh2 = await strategy.shouldHarvest(av3CRV.address);
        expect(sh2).to.eq(true);
    });
    it("withdraw blocked assets", async () => {
        const {
            strategy,
            DAI,
            deployer,
            otherAddress1
        } = await snapshot();
        const amount = ethers.utils.parseEther('1');

        await setavaxDAITokenBalance(deployer, amount);
        await DAI.transfer(strategy.address, amount);

        await strategy.withdrawBlockedAssets(DAI.address, otherAddress1.address, amount);

        const b = await DAI.balanceOf(otherAddress1.address);
        expect(b).to.eq(amount);
    });
    it("deposit", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            av3CRV,
            crvUSDBTCETH,
            pokeMe
        } = await snapshot();

        const depositChecks = async (
            token: any,
            inv: SignerWithAddress,
            yv: LickHitter,
            s: any,
            vc: Array<any>
        ) => {
            var i = 0;

            const tyvbal = await token.balanceOf(yv.address);
            const tsbal = await token.balanceOf(s.address);
            expect(tyvbal).to.eq(vc[i++]);
            expect(tsbal).to.eq(vc[i++]);

            const iyvbal = await yv.balanceOf(token.address, inv.address);
            expect(iyvbal).to.eq(vc[i++]);

            const iv = await s.invested(token.address);
            expect(iv).to.eq(vc[i++]);
        }

        const investAmount = ethers.utils.parseEther('100');

        await setavaxav3CRVTokenBalance(investor, investAmount);
        await av3CRV.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(av3CRV.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(av3CRV.address);
        await depositChecks(
            av3CRV,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount,
                investAmount
            ]
        );

        await setavaxcrvUSDBTCETHTokenBalance(investor, investAmount);
        await crvUSDBTCETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvUSDBTCETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvUSDBTCETH.address);
        await depositChecks(
            crvUSDBTCETH,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
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
            av3CRV,
            crvUSDBTCETH,
            pokeMe
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');
        const withdrawAmount = ethers.utils.parseEther('16');
        
        await setavaxav3CRVTokenBalance(investor, investAmount);
        await av3CRV.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(av3CRV.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(av3CRV.address);
        await yieldVault.connect(investor).withdraw(av3CRV.address, investor.address, withdrawAmount);
        await withdrawChecks(
            av3CRV,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );

        await setavaxcrvUSDBTCETHTokenBalance(investor, investAmount);
        await crvUSDBTCETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvUSDBTCETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvUSDBTCETH.address);
        await yieldVault.connect(investor).withdraw(crvUSDBTCETH.address, investor.address, withdrawAmount);
        await withdrawChecks(
            crvUSDBTCETH,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
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
            av3CRV,
            crvUSDBTCETH,
            pokeMe
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');
        
        await setavaxav3CRVTokenBalance(investor, investAmount);
        await av3CRV.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(av3CRV.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(av3CRV.address);
        await yieldVault.emptyStrategy(av3CRV.address);
        await withdrawChecks(
            av3CRV,
            investor,
            yieldVault,
            strategy,
            [
                investAmount,
                0,
                investAmount,
                0,
                0
            ]
        );

        await setavaxcrvUSDBTCETHTokenBalance(investor, investAmount);
        await crvUSDBTCETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvUSDBTCETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvUSDBTCETH.address);
        await yieldVault.emptyStrategy(crvUSDBTCETH.address);
        await withdrawChecks(
            crvUSDBTCETH,
            investor,
            yieldVault,
            strategy,
            [
                investAmount,
                0,
                investAmount,
                0,
                0
            ]
        );
    });
    it("harvest: av3CRV", async () => {
        const {
            strategy,
            otherAddress1,
            investor,
            pokeMe,
            av3CRV,
            yieldVault,
            deployer,
            CRV
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');

        const fakeRewardAmountCRV = ethers.utils.parseEther('20').mul(7911131); // $44.2
        const fakeRewardAmountWAVAX = ethers.utils.parseEther('10').mul(7911131); // $782.7

        // Deposit
        await setavaxav3CRVTokenBalance(investor, investAmount);
        await av3CRV.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(av3CRV.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(av3CRV.address);

        // Fake rewards
        const av3CrvRewardsContract = new ethers.Contract(
            "0xB504b6EB06760019801a91B451d3f7BD9f027fC9",
            CurveRewardContractInterface,
            deployer
        );
        await setavaxCRVTokenBalance(otherAddress1, fakeRewardAmountCRV);
        // await setavaxWAVAXTokenBalance(otherAddress1, fakeRewardAmountWAVAX);
        await CRV.connect(otherAddress1).transfer(av3CrvRewardsContract.address, fakeRewardAmountCRV);
        // await wAVAX.connect(otherAddress1).transfer(av3CrvRewardsContract.address, fakeRewardAmountWAVAX);
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x7EeAC6CDdbd1D0B8aF061742D41877D7F707289a"],
        });
        const rewardNotifierav3CRV = await ethers.provider.getSigner(
            "0x7EeAC6CDdbd1D0B8aF061742D41877D7F707289a"
        );
        await av3CrvRewardsContract.connect(rewardNotifierav3CRV).notify_reward_amount(CRV.address);

        // Pass 7 days for reward to accumulate
        await (deployer.provider as any).send("evm_increaseTime", [604800]);
        await network.provider.request({
            method: "evm_mine",
            params: [],
        });

        // Harvest
        await strategy.updateMinHarvest(av3CRV.address, CRV.address, 0);
        await yieldVault.connect(pokeMe).executeStrategy(av3CRV.address);

        await harvestChecks(
            av3CRV,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount, // shares remain the same
                investAmount.add(ethers.utils.parseEther('44')), // We have about $44 more
                investAmount.add(ethers.utils.parseEther('44')), // We have about $44 more
            ]
        );
    });
    it("harvest: crvUSDBTCETH", async () => {
        const {
            strategy,
            otherAddress1,
            investor,
            pokeMe,
            wAVAX,
            yieldVault,
            DAI,
            deployer,
            CRV,
            crvUSDBTCETH
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');

        const fakeRewardAmountCRV = ethers.utils.parseEther('20').mul(692); // $44.2
        const fakeRewardAmountWAVAX = ethers.utils.parseEther('10').mul(692); // $782.7

        // Deposit
        await setavaxcrvUSDBTCETHTokenBalance(investor, investAmount);
        await crvUSDBTCETH.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(crvUSDBTCETH.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(crvUSDBTCETH.address);

        // Fake rewards
        const crvUSDBTCETHRewardsContract = new ethers.Contract(
            "0xa05e565ca0a103fcd999c7a7b8de7bd15d5f6505",
            CurveRewardContractInterface,
            deployer
        );
        await setavaxCRVTokenBalance(otherAddress1, fakeRewardAmountCRV);
        await setavaxWAVAXTokenBalance(otherAddress1, fakeRewardAmountWAVAX);
        await CRV.connect(otherAddress1).transfer(crvUSDBTCETHRewardsContract.address, fakeRewardAmountCRV);
        await wAVAX.connect(otherAddress1).transfer(crvUSDBTCETHRewardsContract.address, fakeRewardAmountWAVAX);
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x7EeAC6CDdbd1D0B8aF061742D41877D7F707289a"],
        });
        const rewardNotifierav3CRV = await ethers.provider.getSigner(
            "0x7EeAC6CDdbd1D0B8aF061742D41877D7F707289a"
        );
        await crvUSDBTCETHRewardsContract.connect(rewardNotifierav3CRV).notify_reward_amount(CRV.address);

        // Pass 7 days for reward to accumulate
        await (deployer.provider as any).send("evm_increaseTime", [604800]);
        await network.provider.request({
            method: "evm_mine",
            params: [],
        });

        // Harvest
        await strategy.updateMinHarvest(crvUSDBTCETH.address, CRV.address, 0);
        await yieldVault.connect(pokeMe).executeStrategy(crvUSDBTCETH.address);

        await harvestChecks(
            crvUSDBTCETH,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmount, // shares remain the same
                investAmount.add(ethers.utils.parseEther('826').div(3000)), // We have about $826 more
                investAmount.add(ethers.utils.parseEther('826').div(3000)), // We have about $826 more
            ]
        );
    });
});
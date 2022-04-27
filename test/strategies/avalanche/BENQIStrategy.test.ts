import { ethers, network } from "hardhat";
import { expect } from "chai";
import { LickHitter } from "../../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { setavaxDAITokenBalance, setavaxUSDTTokenBalance, setavaxWAVAXTokenBalance } from "../../swappers/utils/USDRCurve";
import { BigNumber } from "ethers";

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
    expect(tyvbal).to.be.closeTo(vc[i++], tyvbal.div(10000));
    expect(tsbal).to.be.closeTo(vc[i++], tsbal.div(10000));

    const iyvbal = await yv.balanceOf(token.address, inv.address);
    expect(iyvbal).to.be.closeTo(vc[i++], iyvbal.div(10000));

    const iv = await s.invested(token.address);
    expect(iv).to.be.closeTo(vc[i++], iv.div(10000));

    const userBal = await token.balanceOf(inv.address);
    expect(userBal).to.be.closeTo(vc[i++], userBal.div(10000));
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
    expect(tyvbal).to.be.closeTo(vc[i++], tyvbal.div(10000));
    expect(tsbal).to.be.closeTo(vc[i++], tsbal.div(10000));

    const iyvbal = await yv.balanceOf(token.address, inv.address);
    expect(iyvbal).to.be.closeTo(vc[i++], iyvbal.div(10000));

    const iActualBal = await yv.convertShares(token.address, iyvbal, 0);
    expect(iActualBal).to.be.closeTo(vc[i++], iActualBal.div(10000));

    const iv = await s.invested(token.address);
    expect(iv).to.be.closeTo(vc[i++], iv.div(10000));
}

const snapshot = async () => {
    const [deployer, otherAddress1, investor, pokeMe] = await ethers.getSigners();

    const USDRFactory = await ethers.getContractFactory("RadarUSD");

    const QI = USDRFactory.attach("0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5");

    const wAVAX = USDRFactory.attach("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7");
    const DAI = USDRFactory.attach("0xd586E7F844cEa2F87f50152665BCbc2C279D8d70");
    const USDT = USDRFactory.attach("0xc7198437980c041c805a1edcba50c1ce5db95118");

    const yieldVaultFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await yieldVaultFactory.deploy(pokeMe.address);

    await yieldVault.addSupportedTokens(
        [wAVAX.address, DAI.address, USDT.address],
        [0, 0, 0]
    );

    const strategyDeployer = await ethers.getContractFactory("BENQIStrategy");
    const strategy = await strategyDeployer.deploy(
        yieldVault.address,
        [wAVAX.address, DAI.address, USDT.address],
        ["0x5C0401e81Bc07Ca70fAD469b451682c0d747Ef1c", "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D", "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C"]
    );

    await yieldVault.addStrategy(wAVAX.address, strategy.address);
    await yieldVault.addStrategy(DAI.address, strategy.address);
    await yieldVault.addStrategy(USDT.address, strategy.address);

    return {
        DAI,
        USDT,
        wAVAX,
        yieldVault,
        deployer,
        otherAddress1,
        USDRFactory,
        investor,
        pokeMe,
        strategy,
        QI
    }
}

describe("Avalanche: BENQIStrategy", () => {
    it("Initial State Getters", async () => {
        const {
            yieldVault,
            strategy,
            otherAddress1,
            DAI
        } = await snapshot();

        const invested1 = await strategy.invested(DAI.address);
        expect(invested1).to.eq(0);
        await expect(strategy.invested(otherAddress1.address)).to.be.revertedWith("Unsupported token");

        const il = await strategy.isLiquid(DAI.address, 0);
        expect(il).to.eq(true);

        const sh = await strategy.shouldHarvest(DAI.address);
        expect(sh).to.eq(true);

        const giv = await strategy.getInvestor();
        expect(giv).to.eq(yieldVault.address);

        const git1 = await strategy.getIsSupportedToken(DAI.address);
        expect(git1).to.eq(true);
        const git2 = await strategy.getIsSupportedToken(otherAddress1.address);
        expect(git2).to.eq(false);
    });
    it("Accesss Control", async () => {
        const {
            strategy,
            otherAddress1
        } = await snapshot();

        await expect(strategy.connect(otherAddress1).editToken(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(strategy.connect(otherAddress1).withdrawBlockedAssets(ethers.constants.AddressZero, ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");

        await expect(strategy.depositToStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.withdrawFromStrategy(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(strategy.exit(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(strategy.harvest(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
    });
    it("State setters", async () => {
        const {
            strategy,
            DAI
        } = await snapshot();

        await strategy.editToken(DAI.address, ethers.constants.AddressZero);
        const is = await strategy.getIsSupportedToken(DAI.address);
        expect(is).to.eq(false);

        await strategy.editToken(DAI.address, "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D");
        const is2 = await strategy.getIsSupportedToken(DAI.address);
        expect(is2).to.eq(true);
    });
    it("Withdraw blocked assets", async () => {
        const {
            strategy,
            DAI,
            deployer,
            otherAddress1,
            USDRFactory
        } = await snapshot();
        const amount = ethers.utils.parseEther('1');

        await setavaxDAITokenBalance(deployer, amount);
        await DAI.transfer(strategy.address, amount);

        await expect(strategy.withdrawBlockedAssets(DAI.address, otherAddress1.address, amount)).to.be.revertedWith(
            "Illegal Asset"
        );

        const mockToken = await USDRFactory.deploy();
        await mockToken.mint(strategy.address, amount);
        await strategy.withdrawBlockedAssets(mockToken.address, otherAddress1.address, amount);

        const b = await mockToken.balanceOf(otherAddress1.address);
        expect(b).to.eq(amount);
    });
    it("Deposit", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            DAI,
            wAVAX,
            USDT,
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
            expect(iyvbal).to.be.closeTo(vc[i++], iyvbal.div(100000));

            const iv = await s.invested(token.address);
            expect(iv).to.be.closeTo(vc[i++], iv.div(100000));
        }

        const investAmount = ethers.utils.parseEther('100');
        const investAmountUSDT = BigNumber.from(100 * 10**6);

        await setavaxWAVAXTokenBalance(investor, investAmount);
        await wAVAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(wAVAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(wAVAX.address);
        await depositChecks(
            wAVAX,
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

        await setavaxDAITokenBalance(investor, investAmount);
        await DAI.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(DAI.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(DAI.address);
        await depositChecks(
            DAI,
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

        await setavaxUSDTTokenBalance(investor, investAmountUSDT);
        await USDT.connect(investor).approve(yieldVault.address, investAmountUSDT);
        await yieldVault.connect(investor).deposit(USDT.address, investor.address, investAmountUSDT);
        await yieldVault.connect(pokeMe).executeStrategy(USDT.address);
        await depositChecks(
            USDT,
            investor,
            yieldVault,
            strategy,
            [
                0,
                0,
                investAmountUSDT,
                investAmountUSDT
            ]
        );
    });
    it("Withdraw", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            USDT,
            DAI,
            wAVAX,
            pokeMe
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');
        const withdrawAmount = ethers.utils.parseEther('16');

        const investAmountUSDT = BigNumber.from(100 * 10**6);
        const withdrawAmountUSDT = BigNumber.from(16 * 10**6);
        
        await setavaxWAVAXTokenBalance(investor, investAmount);
        await wAVAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(wAVAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(wAVAX.address);
        await yieldVault.connect(investor).withdraw(wAVAX.address, investor.address, withdrawAmount);
        await withdrawChecks(
            wAVAX,
            investor,
            yieldVault,
            strategy,
            [
                BigNumber.from(0),
                BigNumber.from(0),
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );

        await setavaxDAITokenBalance(investor, investAmount);
        await DAI.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(DAI.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(DAI.address);
        await yieldVault.connect(investor).withdraw(DAI.address, investor.address, withdrawAmount);
        await withdrawChecks(
            DAI,
            investor,
            yieldVault,
            strategy,
            [
                BigNumber.from(0),
                BigNumber.from(0),
                investAmount.sub(withdrawAmount),
                investAmount.sub(withdrawAmount),
                withdrawAmount
            ]
        );

        await setavaxUSDTTokenBalance(investor, investAmountUSDT);
        await USDT.connect(investor).approve(yieldVault.address, investAmountUSDT);
        await yieldVault.connect(investor).deposit(USDT.address, investor.address, investAmountUSDT);
        await yieldVault.connect(pokeMe).executeStrategy(USDT.address);
        await yieldVault.connect(investor).withdraw(USDT.address, investor.address, withdrawAmountUSDT);
        await withdrawChecks(
            USDT,
            investor,
            yieldVault,
            strategy,
            [
                BigNumber.from(0),
                BigNumber.from(0),
                investAmountUSDT.sub(withdrawAmountUSDT),
                investAmountUSDT.sub(withdrawAmountUSDT),
                withdrawAmountUSDT
            ]
        );
    });
    it("Exit", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            USDT,
            DAI,
            wAVAX,
            pokeMe
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');

        const investAmountUSDT = BigNumber.from(100 * 10**6);
        
        await setavaxWAVAXTokenBalance(investor, investAmount);
        await wAVAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(wAVAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(wAVAX.address);
        await yieldVault.emptyStrategy(wAVAX.address);
        await withdrawChecks(
            wAVAX,
            investor,
            yieldVault,
            strategy,
            [
                investAmount,
                BigNumber.from(0),
                investAmount,
                BigNumber.from(0),
                BigNumber.from(0)
            ]
        );

        await setavaxDAITokenBalance(investor, investAmount);
        await DAI.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(DAI.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(DAI.address);
        await yieldVault.emptyStrategy(DAI.address);
        await withdrawChecks(
            DAI,
            investor,
            yieldVault,
            strategy,
            [
                investAmount,
                BigNumber.from(0),
                investAmount,
                BigNumber.from(0),
                BigNumber.from(0)
            ]
        );

        await setavaxUSDTTokenBalance(investor, investAmountUSDT);
        await USDT.connect(investor).approve(yieldVault.address, investAmountUSDT);
        await yieldVault.connect(investor).deposit(USDT.address, investor.address, investAmountUSDT);
        await yieldVault.connect(pokeMe).executeStrategy(USDT.address);
        await yieldVault.emptyStrategy(USDT.address);
        await withdrawChecks(
            USDT,
            investor,
            yieldVault,
            strategy,
            [
                investAmountUSDT,
                BigNumber.from(0),
                investAmountUSDT,
                BigNumber.from(0),
                BigNumber.from(0)
            ]
        );
    });
    it("harvest: AVAX", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            pokeMe,
            wAVAX,
            deployer
        } = await snapshot();

        const investAmount = ethers.utils.parseEther('100');

        await setavaxWAVAXTokenBalance(investor, investAmount);
        await wAVAX.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(wAVAX.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(wAVAX.address);

        // Pass 7 days
        await (deployer.provider as any).send("evm_increaseTime", [604800]);
        await network.provider.request({
            method: "evm_mine",
            params: [],
        });

        await yieldVault.connect(pokeMe).executeStrategy(wAVAX.address);
        const expectedReward = ethers.utils.parseEther('0.0761'); // 3.97% APY scaled for 7 days
        await harvestChecks(
            wAVAX,
            investor,
            yieldVault,
            strategy,
            [
                BigNumber.from(0),
                BigNumber.from(0),
                investAmount, // shares remain the same
                investAmount.add(expectedReward),
                investAmount.add(expectedReward),
            ]
        );
    });
    it("harvest: USDT", async () => {
        const {
            strategy,
            yieldVault,
            investor,
            pokeMe,
            USDT,
            deployer
        } = await snapshot();

        const investAmount = BigNumber.from(10000 * 10**6);

        await setavaxUSDTTokenBalance(investor, investAmount);
        await USDT.connect(investor).approve(yieldVault.address, investAmount);
        await yieldVault.connect(investor).deposit(USDT.address, investor.address, investAmount);
        await yieldVault.connect(pokeMe).executeStrategy(USDT.address);

        // Pass 7 days
        await (deployer.provider as any).send("evm_increaseTime", [604800]);
        await network.provider.request({
            method: "evm_mine",
            params: [],
        });

        await yieldVault.connect(pokeMe).executeStrategy(USDT.address);
        const expectedReward = BigNumber.from(8.035 * 10**6); // 4.19% APY scaled for 7 days
        await harvestChecks(
            USDT,
            investor,
            yieldVault,
            strategy,
            [
                BigNumber.from(0),
                BigNumber.from(0),
                investAmount, // shares remain the same
                investAmount.add(expectedReward),
                investAmount.add(expectedReward),
            ]
        );
    });
});
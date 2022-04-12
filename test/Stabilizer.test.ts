import { ethers } from "hardhat";
import { expect } from "chai";
import { setDAITokenBalance, setUSDTTokenBalance } from "./swappers/utils/USDRCurve";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Stabilizer } from "../typechain/Stabilizer";
import { LickHitter, RadarUSD } from "../typechain";
import { BigNumber } from "ethers";
import { signERC2612Permit } from 'eth-permit';

const snapshot = async () => {
    const [deployer, investor, pokeMe, feeReceiver] = await ethers.getSigners();

    const usdrFactory = await ethers.getContractFactory("RadarUSD");
    const USDR = await usdrFactory.deploy();

    const lickHitterFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await lickHitterFactory.deploy(pokeMe.address);

    const USDT = usdrFactory.attach("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    const DAI = usdrFactory.attach("0x6B175474E89094C44Da98b954EedeAC495271d0F");

    await yieldVault.addSupportedToken(USDT.address, 0);
    await yieldVault.addSupportedToken(DAI.address, 0);

    const stabilizerFactory = await ethers.getContractFactory("Stabilizer");
    const stabilizer = await stabilizerFactory.deploy(
        USDR.address,
        pokeMe.address,
        [USDT.address, DAI.address],
        0,
        0,
        feeReceiver.address,
        yieldVault.address
    );

    await USDR.addMinter(stabilizer.address);

    return {
        deployer,
        investor,
        pokeMe,
        feeReceiver,
        USDR,
        yieldVault,
        USDT,
        DAI,
        stabilizer,
        usdrFactory
    }
}

const mintBurnChecks = async (
    token: any,
    us: RadarUSD,
    iv: SignerWithAddress,
    s: Stabilizer,
    e: any,
    yv: LickHitter,
    vc: Array<any>
) => {
    var i = 0;

    expect(e.event).to.eq(vc[i++]);
    expect(e.args!.user).to.eq(vc[i++]);
    expect(e.args!.amount).to.eq(vc[i++]);

    const uTokenBal = await token.balanceOf(iv.address);
    const uUsdrBal = await us.balanceOf(iv.address);
    expect(uTokenBal).to.eq(vc[i++]);
    expect(uUsdrBal).to.eq(vc[i++]);

    const sTokenBal = await token.balanceOf(s.address);
    const sUsdrBal = await us.balanceOf(s.address);
    expect(sTokenBal).to.eq(vc[i++]);
    expect(sUsdrBal).to.eq(vc[i++]);

    const aTB = await s.availableForBurning(token.address);
    expect(aTB).to.eq(vc[i++]);
    const aF = await s.getAccumulatedFees(token.address);
    expect(aF).to.eq(vc[i++]);

    const yvShares = await yv.balanceOf(token.address, s.address);
    expect(yvShares).to.eq(vc[i++]);
}

describe('Stabilizer', () => {
    it("Access Control", async () => {
        const {
            investor,
            stabilizer,
            pokeMe
        } = await snapshot();

        await expect(stabilizer.connect(pokeMe).changePokeMe(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).addSupportedToken(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).removeSupportedToken(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).changeFees(0, 0, ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).changeYieldVault(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).backupReApprove(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(pokeMe).withdrawFromYieldFarming(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");

        await expect(stabilizer.connect(investor).depositToYieldFarming(ethers.constants.AddressZero, 0)).to.be.revertedWith("Unauthorized");
        await expect(stabilizer.connect(investor).claimFees(ethers.constants.AddressZero)).to.be.revertedWith("Unauthorized");
    });
    it("Owner setters", async () => {
        const {
            stabilizer,
            yieldVault,
            USDT,
            pokeMe,
            feeReceiver,
            usdrFactory
        } = await snapshot();

        const pm1 = await stabilizer.pokeMe();
        expect(pm1).to.eq(pokeMe.address);
        await stabilizer.changePokeMe(ethers.constants.AddressZero);
        const pm2 = await stabilizer.pokeMe();
        expect(pm2).to.eq(ethers.constants.AddressZero);

        const at1 = await stabilizer.isSupportedToken(USDT.address);
        expect(at1).to.eq(true);
        await stabilizer.removeSupportedToken(USDT.address);
        const at2 = await stabilizer.isSupportedToken(USDT.address);
        expect(at2).to.eq(false);
        await stabilizer.addSupportedToken(USDT.address);
        const at3 = await stabilizer.isSupportedToken(USDT.address);
        expect(at3).to.eq(true);
        const al = await USDT.allowance(stabilizer.address, yieldVault.address);
        expect(al).to.eq(ethers.constants.MaxUint256);

        const mf1 = await stabilizer.MINT_FEE();
        const bf1 = await stabilizer.BURN_FEE();
        const fr1 = await stabilizer.FEE_RECEIVER();
        expect(mf1).to.eq(bf1).to.eq(0);
        expect(fr1).to.eq(feeReceiver.address);
        await stabilizer.changeFees(16, 42, pokeMe.address);
        const mf2 = await stabilizer.MINT_FEE();
        const bf2 = await stabilizer.BURN_FEE();
        const fr2 = await stabilizer.FEE_RECEIVER();
        expect(mf2).to.eq(16);
        expect(bf2).to.eq(42);
        expect(fr2).to.eq(pokeMe.address);

        const mockToken = await usdrFactory.deploy();
        await stabilizer.addSupportedToken(mockToken.address);
        const at4 = await stabilizer.isSupportedToken(mockToken.address);
        expect(at4).to.eq(true);
        const al2 = await mockToken.allowance(stabilizer.address, yieldVault.address);
        expect(al2).to.eq(ethers.constants.MaxUint256);

        const yv1 = await stabilizer.yieldVault();
        expect(yv1).to.eq(yieldVault.address);
        await stabilizer.changeYieldVault(ethers.constants.AddressZero);
        const yv2 = await stabilizer.yieldVault();
        expect(yv2).to.eq(ethers.constants.AddressZero);
    });
    it("backupReApprove", async () => {
        const {
            stabilizer,
            yieldVault,
            USDT
        } = await snapshot();

        await stabilizer.backupReApprove(USDT.address);
        const al = await USDT.allowance(stabilizer.address, yieldVault.address);
        expect(al).to.eq(ethers.constants.MaxUint256);
    });
    it("mint: USDT & DAI (fee + no fee)", async () => {
        const {
            stabilizer,
            investor,
            USDT,
            USDR,
            DAI,
            yieldVault,
            feeReceiver
        } = await snapshot();

        var mintAmount = BigNumber.from(100 * 10**6); // 100 USDT
        await setUSDTTokenBalance(investor, mintAmount);
        await USDT.connect(investor).approve(stabilizer.address, mintAmount);
        await expect(stabilizer.mint(ethers.constants.AddressZero, mintAmount)).to.be.revertedWith("Token not supported")
        const tx1 = await stabilizer.connect(investor).mint(USDT.address, mintAmount);
        const rc1 = await tx1.wait();
        const e1 = rc1.events![rc1.events!.length-1];
        await mintBurnChecks(
            USDT,
            USDR,
            investor,
            stabilizer,
            e1,
            yieldVault,
            [
                "USDRMinted", // event name
                investor.address, // event user
                mintAmount.mul(10**12), // event amount
                0, // user token bal
                mintAmount.mul(10**12), // user USDR bal
                mintAmount, // stabilizer token bal
                0, // stabilizer USDR bal
                mintAmount, // available for burning
                0, // accumulated fees
                0 // stabilizer's yield vault shares
            ]
        );

        // Burn investor USDR
        await USDR.connect(investor).burn(mintAmount.mul(10**12));

        mintAmount = ethers.utils.parseEther('1000'); // 1000 DAI
        await stabilizer.changeFees(100, 0, feeReceiver.address); // 1% fee
        var DAIMintFee = ethers.utils.parseEther('10');
        await setDAITokenBalance(investor, mintAmount);
        await DAI.connect(investor).approve(stabilizer.address, mintAmount);
        const tx2 = await stabilizer.connect(investor).mint(DAI.address, mintAmount);
        const rc2 = await tx2.wait();
        const e2 = rc2.events![rc2.events!.length-1];
        await mintBurnChecks(
            DAI,
            USDR,
            investor,
            stabilizer,
            e2,
            yieldVault,
            [
                "USDRMinted", // event name
                investor.address, // event user
                mintAmount.sub(DAIMintFee), // event amount
                0, // user token bal
                mintAmount.sub(DAIMintFee), // user USDR bal
                mintAmount, // stabilizer token bal
                0, // stabilizer USDR bal
                mintAmount.sub(DAIMintFee), // available for burning
                DAIMintFee, // accumulated fees
                0 // stabilizer's yield vault shares
            ]
        );
    });
    it("YF: deposit and withdraw", async () => {
        const {
            stabilizer,
            investor,
            USDT,
            pokeMe,
            yieldVault
        } = await snapshot();

        const yfDepositWithdrawChecks = async (
            s: Stabilizer,
            usdt: RadarUSD,
            yv: LickHitter,
            vc: Array<any>
        ) => {
            var i = 0;

            const usdtStabBal = await usdt.balanceOf(s.address);
            expect(usdtStabBal).to.eq(vc[i++]);

            const usdtYvBal = await usdt.balanceOf(yv.address);
            expect(usdtYvBal).to.eq(vc[i++]);

            const yvShares = await yv.balanceOf(usdt.address, s.address);
            expect(yvShares).to.eq(vc[i++]);
        }

        // Deposit
        var mintAmount = BigNumber.from(100 * 10**6); // 100 USDT
        await setUSDTTokenBalance(investor, mintAmount);
        await USDT.connect(investor).approve(stabilizer.address, mintAmount);
        await stabilizer.connect(investor).mint(USDT.address, mintAmount);

        // Deposit to YF
        await stabilizer.connect(pokeMe).depositToYieldFarming(USDT.address, mintAmount);

        await yfDepositWithdrawChecks(
            stabilizer,
            USDT,
            yieldVault,
            [
                0,
                mintAmount,
                mintAmount
            ]
        );

        // Withdraw from YF
        await stabilizer.withdrawFromYieldFarming(USDT.address, mintAmount);

        await yfDepositWithdrawChecks(
            stabilizer,
            USDT,
            yieldVault,
            [
                mintAmount,
                0,
                0
            ]
        );
    });
    it("burn: USDT & DAI (permit + approve) (no withdraw + withdraw) (no fee + fee)", async () => {
        const {
            stabilizer,
            investor,
            USDT,
            USDR,
            DAI,
            yieldVault,
            feeReceiver,
            pokeMe
        } = await snapshot();

        // Mint with USDT
        var mintAmount = BigNumber.from(100 * 10**6); // 100 USDT
        await setUSDTTokenBalance(investor, mintAmount);
        await USDT.connect(investor).approve(stabilizer.address, mintAmount);
        await stabilizer.connect(investor).mint(USDT.address, mintAmount);

        // Burn USDT with permit, no withdraw from YF and no fee
        const sig = await signERC2612Permit(
            investor,
            USDR.address,
            investor.address,
            stabilizer.address,
            mintAmount.mul(10**12).toString()
        );
        const abiCoder = new ethers.utils.AbiCoder();
        const permitData = abiCoder.encode(
            ["address", "address", "uint", "uint", "uint8", "bytes32", "bytes32"],
            [investor.address, stabilizer.address, mintAmount.mul(10**12), sig.deadline, sig.v, sig.r, sig.s]
        );
        await USDR.connect(investor).approve(stabilizer.address, 0);
        const tx1 = await stabilizer.connect(investor).burn(USDT.address, mintAmount.mul(10**12), permitData);
        const rc1 = await tx1.wait();
        const e1 = rc1.events![rc1.events!.length-1];
        await mintBurnChecks(
            USDT,
            USDR,
            investor,
            stabilizer,
            e1,
            yieldVault,
            [
                "USDRBurned", // event name
                investor.address, // event user
                mintAmount.mul(10**12), // event amount
                mintAmount, // user token bal
                0, // user USDR bal
                0, // stabilizer token bal
                0, // stabilizer USDR bal
                0, // available for burning
                0, // accumulated fees
                0 // stabilizer's yield vault shares
            ]
        );

        // Mint with DAI
        mintAmount = ethers.utils.parseEther('1000'); // 1000 DAI
        var withdrawAmount = ethers.utils.parseEther('600');
        var fee = ethers.utils.parseEther('6');
        await setDAITokenBalance(investor, mintAmount);
        await DAI.connect(investor).approve(stabilizer.address, mintAmount);
        await stabilizer.connect(investor).mint(DAI.address, mintAmount);

        // Burn DAI without permit, withdraw from YF and 1% fee
        await stabilizer.connect(pokeMe).depositToYieldFarming(DAI.address, mintAmount.div(2));
        await stabilizer.changeFees(100, 100, feeReceiver.address);
        await USDR.connect(investor).approve(stabilizer.address, withdrawAmount);
        const tx2 = await stabilizer.connect(investor).burn(DAI.address, withdrawAmount, []);
        const rc2 = await tx2.wait();
        const e2 = rc2.events![rc2.events!.length-1];
        await mintBurnChecks(
            DAI,
            USDR,
            investor,
            stabilizer,
            e2,
            yieldVault,
            [
                "USDRBurned", // event name
                investor.address, // event user
                withdrawAmount, // event amount
                withdrawAmount.sub(fee), // user token bal
                mintAmount.sub(withdrawAmount), // user USDR bal
                0, // stabilizer token bal
                0, // stabilizer USDR bal
                mintAmount.sub(withdrawAmount.sub(fee)).sub(fee), // available for burning
                fee, // accumulated fees
                ethers.utils.parseEther('406') // stabilizer's yield vault shares
            ]
        );

        // Burning with enough balance but over fee
        await stabilizer.changeFees(0, 0, feeReceiver.address);

        // Contract still has 406 DAI but only 400 AFB, tx should fail
        await expect(stabilizer.connect(investor).burn(DAI.address, ethers.utils.parseEther('401'), [])).to.be.revertedWith("Not enough tokens");
    });
    it("claim fees (no withdraw + withdraw)", async () => {
        const {
            stabilizer,
            investor,
            USDT,
            USDR,
            DAI,
            yieldVault,
            feeReceiver,
            pokeMe
        } = await snapshot();

        const claimFeesCheck = async (
            s: Stabilizer,
            tkn: RadarUSD,
            frcv: SignerWithAddress,
            yv: LickHitter,
            vc: Array<any>
        ) => {
            var i = 0;

            const af = await s.getAccumulatedFees(tkn.address);
            expect(af).to.eq(vc[i++]);

            const atb = await s.availableForBurning(tkn.address);
            expect(atb).to.eq(vc[i++]);

            const sTokenAmt = await tkn.balanceOf(s.address);
            const sShareAmt = await yv.balanceOf(tkn.address, s.address);
            expect(sTokenAmt).to.eq(vc[i++]);
            expect(sShareAmt).to.eq(vc[i++]);

            const fRcvBal = await tkn.balanceOf(frcv.address);
            expect(fRcvBal).to.eq(vc[i++]);
        }

        await stabilizer.changeFees(1000, 0, feeReceiver.address);

        // Mint DAI with 10% fee and claim without withdraw
        var mintAmount = ethers.utils.parseEther('1000'); // 1000 DAI
        var DAIMintFee = ethers.utils.parseEther('100');
        await setDAITokenBalance(investor, mintAmount);
        await DAI.connect(investor).approve(stabilizer.address, mintAmount);
        await stabilizer.connect(investor).mint(DAI.address, mintAmount);

        await claimFeesCheck(
            stabilizer,
            DAI,
            feeReceiver,
            yieldVault,
            [
                DAIMintFee,
                mintAmount.sub(DAIMintFee),
                mintAmount,
                0,
                0
            ]
        );

        await stabilizer.connect(pokeMe).claimFees(DAI.address);

        await claimFeesCheck(
            stabilizer,
            DAI,
            feeReceiver,
            yieldVault,
            [
                0,
                mintAmount.sub(DAIMintFee),
                mintAmount.sub(DAIMintFee),
                0,
                DAIMintFee
            ]
        );

        // Mint USDT with 1% fee and claim with withdraw
        await stabilizer.changeFees(100, 0, feeReceiver.address);
        mintAmount = BigNumber.from(100 * 10**6);
        var USDTMintFee = BigNumber.from(10**6);
        await setUSDTTokenBalance(investor, mintAmount);
        await USDT.connect(investor).approve(stabilizer.address, mintAmount);
        await stabilizer.connect(investor).mint(USDT.address, mintAmount);
        await stabilizer.connect(pokeMe).depositToYieldFarming(USDT.address, mintAmount);

        await claimFeesCheck(
            stabilizer,
            USDT,
            feeReceiver,
            yieldVault,
            [
                USDTMintFee,
                mintAmount.sub(USDTMintFee),
                0,
                mintAmount,
                0
            ]
        );

        await stabilizer.connect(pokeMe).claimFees(USDT.address);

        await claimFeesCheck(
            stabilizer,
            USDT,
            feeReceiver,
            yieldVault,
            [
                0,
                mintAmount.sub(USDTMintFee),
                0,
                mintAmount.sub(USDTMintFee),
                USDTMintFee
            ]
        );
    });
})
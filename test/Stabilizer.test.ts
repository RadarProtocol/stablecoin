import { ethers } from "hardhat";
import { expect } from "chai";

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
        stabilizer
    }
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
            feeReceiver
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
    it.skip("mint: USDT & DAI (fee + no fee)");
    it.skip("YF: deposit and withdraw");
    it.skip("burn: USDT & DAI (permit + approve) (no withdraw + withdraw) (no fee + fee)");
    it.skip("claim fees (no withdraw + withdraw)");
})
import { expect } from "chai";
import { ethers } from "hardhat";

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("TheStableMoney");
    const stablecoin = await stableFactory.deploy();

    return {
        deployer,
        otherAddress1,
        otherAddress2,
        stablecoin
    }
}

describe("Stablecoin", () => {
    it("Initial State", async () => {
        const {
            deployer,
            stablecoin
        } = await snapshot();

        const owner = await stablecoin.owner();
        expect(owner).to.eq(deployer.address);

        const pendingOwner = await stablecoin.pendingOwner();
        expect(pendingOwner).to.eq(ethers.constants.AddressZero);

        const isMinter = await stablecoin.minter(deployer.address);
        expect(isMinter).to.eq(true);

        const name = await stablecoin.name();
        expect(name).to.eq("The Stable Money");

        const symbol = await stablecoin.symbol();
        expect(symbol).to.eq("TSM");

        const decimals = await stablecoin.decimals();
        expect(decimals).to.eq(18);

        const totalSupply = await stablecoin.totalSupply();
        expect(totalSupply).to.eq(0);
    });
    it("Access Control", async () => {
        const {
            stablecoin,
            deployer,
            otherAddress1
        } = await snapshot();

        await stablecoin.removeMinter(deployer.address);

        await expect(stablecoin.mint(ethers.constants.AddressZero, 1)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(stablecoin.connect(otherAddress1).mint(ethers.constants.AddressZero, 1)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(stablecoin.connect(otherAddress1).addMinter(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(stablecoin.connect(otherAddress1).removeMinter(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(stablecoin.connect(otherAddress1).transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(stablecoin.claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );
    });
    it("Minter Management", async () => {
        const {
            stablecoin,
            otherAddress1
        } = await snapshot();

        const isBefore = await stablecoin.minter(otherAddress1.address);
        expect(isBefore).to.eq(false);

        const tx = await stablecoin.addMinter(otherAddress1.address);
        const receipt = await tx.wait();
        const event = receipt.events![0];

        expect(event.event).to.eq("MinterAdded")
        expect(event.args.minter).to.eq(otherAddress1.address);

        const isAfter = await stablecoin.minter(otherAddress1.address);
        expect(isAfter).to.eq(true);

        const tx2 = await stablecoin.removeMinter(otherAddress1.address);
        const receipt2 = await tx2.wait();
        const event2 = receipt2.events![0];

        expect(event2.event).to.eq("MinterRemoved");
        expect(event2.args.minter).to.eq(otherAddress1.address);

        const isFinal = await stablecoin.minter(otherAddress1.address);
        expect(isFinal).to.eq(false);
    });
    it("Minting", async () => {
        const {
            stablecoin,
            otherAddress1
        } = await snapshot();

        const amount = ethers.utils.parseEther("1000000");

        await stablecoin.mint(otherAddress1.address, amount);

        const bal = await stablecoin.balanceOf(otherAddress1.address);
        expect(bal).to.eq(amount);
    });
    it.skip("Burning");
    it.skip("Ownership Transfer");
    it.skip("ERC20 Functionality");
});
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

        const ts = await stablecoin.totalSupply();
        expect(ts).to.eq(amount);
    });
    it("Burning", async () => {
        const {
            stablecoin,
            otherAddress1
        } = await snapshot();

        const amount = ethers.utils.parseEther("1");

        await stablecoin.mint(otherAddress1.address, amount);

        await expect(stablecoin.burn(amount)).to.be.revertedWith(
            "ERC20: burn amount exceeds balance"
        );

        await stablecoin.connect(otherAddress1).burn(amount);

        const bs = await stablecoin.balanceOf(otherAddress1.address);
        const ts = await stablecoin.totalSupply();
        expect(bs).to.eq(ts).to.eq(0);
    });
    it("Ownership Transfer", async () => {
        const {
            stablecoin,
            deployer,
            otherAddress1
        } = await snapshot();

        await expect(stablecoin.connect(otherAddress1).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await stablecoin.connect(deployer).transferOwnership(otherAddress1.address);

        const getPendingOwnerCall = await stablecoin.pendingOwner();
        expect(getPendingOwnerCall).to.equal(otherAddress1.address);

        await expect(stablecoin.connect(deployer).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        const tx = await stablecoin.connect(otherAddress1).claimOwnership();
        const receipt = await tx.wait();

        const event = receipt.events![0];

        expect(event.event).to.eq('OwnershipTransferred');
        expect(event.args.oldOwner).to.eq(deployer.address);
        expect(event.args.newOwner).to.eq(otherAddress1.address);

        const getPendingOwnerCall2 = await stablecoin.pendingOwner();
        const getOwnerCall = await stablecoin.owner();
        expect(getPendingOwnerCall2).to.equal(ethers.constants.AddressZero);
        expect(getOwnerCall).to.equal(otherAddress1.address);

        await expect(stablecoin.connect(deployer).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await stablecoin.connect(otherAddress1).transferOwnership(deployer.address);
    });
    it("ERC20 Functionality", async () => {
        const {
            deployer,
            otherAddress1,
            otherAddress2,
            stablecoin
        } = await snapshot();

        const amount = ethers.utils.parseEther('100000000');
        await stablecoin.mint(deployer.address, amount);

        const bs1 = await stablecoin.balanceOf(deployer.address);
        const ts1 = await stablecoin.totalSupply();
        expect(bs1).to.eq(ts1).to.eq(amount);

        await stablecoin.transfer(otherAddress1.address, amount);
        const bs2 = await stablecoin.balanceOf(deployer.address);
        const bs3 = await stablecoin.balanceOf(otherAddress1.address);
        const ts2 = await stablecoin.totalSupply();
        expect(bs3).to.eq(ts2).to.eq(amount);
        expect(bs2).to.eq(0);

        await stablecoin.connect(otherAddress1).approve(otherAddress2.address, amount);

        const all1 = await stablecoin.allowance(otherAddress1.address, otherAddress2.address);
        expect(all1).to.eq(amount);

        await stablecoin.connect(otherAddress2).transferFrom(otherAddress1.address, otherAddress2.address, amount);

        const all2 = await stablecoin.allowance(otherAddress1.address, otherAddress2.address);
        expect(all2).to.eq(0);

        const bs4 = await stablecoin.balanceOf(otherAddress1.address);
        const bs5 = await stablecoin.balanceOf(otherAddress2.address);
        expect(bs4).to.eq(0);
        expect(bs5).to.eq(amount);

        const finalTS = await stablecoin.totalSupply();
        expect(finalTS).to.eq(amount);

        await expect(stablecoin.connect(deployer).transferFrom(otherAddress2.address, deployer.address, amount)).to.be.revertedWith(
            "ERC20: insufficient allowance"
        );

        await stablecoin.connect(otherAddress2).burn(amount);

        const ts0 = await stablecoin.totalSupply();
        expect(ts0).to.eq(0);
    });
});
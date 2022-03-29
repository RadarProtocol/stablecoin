import { expect } from "chai";
import { ethers } from "hardhat";
import { signERC2612Permit } from 'eth-permit';

const snapshot = async () => {
    const [deployer, otherAddress1, otherAddress2] = await ethers.getSigners();
    

    const stableFactory = await ethers.getContractFactory("RadarUSD");
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
        expect(name).to.eq("Radar USD");

        const symbol = await stablecoin.symbol();
        expect(symbol).to.eq("USDR");

        const decimals = await stablecoin.decimals();
        expect(decimals).to.eq(18);

        const totalSupply = await stablecoin.totalSupply();
        expect(totalSupply).to.eq(0);

        const PERMIT_TYPEHASH = await stablecoin.PERMIT_TYPEHASH();
        expect(PERMIT_TYPEHASH).to.eq("0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9");
    });
    it("DOMAIN_SEPARATOR construction", async () => {
        const {
            stablecoin
        } = await snapshot();

        const actualDS = await stablecoin.DOMAIN_SEPARATOR();

        const coder = new ethers.utils.AbiCoder();
        const expectedDS = ethers.utils.keccak256(coder.encode(
            ["bytes32", "bytes32", "bytes32", "uint", "address"],
            [
                ethers.utils.keccak256("0x454950373132446f6d61696e28737472696e67206e616d652c737472696e672076657273696f6e2c75696e7432353620636861696e49642c6164647265737320766572696679696e67436f6e747261637429"),
                ethers.utils.keccak256("0x526164617220555344"),
                ethers.utils.keccak256("0x31"),
                31337,
                stablecoin.address
            ]
        ));

        expect(actualDS).to.eq(expectedDS);
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
        expect(event.args!.minter).to.eq(otherAddress1.address);

        const isAfter = await stablecoin.minter(otherAddress1.address);
        expect(isAfter).to.eq(true);

        const tx2 = await stablecoin.removeMinter(otherAddress1.address);
        const receipt2 = await tx2.wait();
        const event2 = receipt2.events![0];

        expect(event2.event).to.eq("MinterRemoved");
        expect(event2.args!.minter).to.eq(otherAddress1.address);

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
        expect(event.args!.oldOwner).to.eq(deployer.address);
        expect(event.args!.newOwner).to.eq(otherAddress1.address);

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
    it("EIP-2612 permit() Implementation", async () => {
        const {
            stablecoin,
            otherAddress1,
            otherAddress2
        } = await snapshot();

        // Deposit for otherAddress1
        const amount = ethers.utils.parseEther("10");
        await stablecoin.mint(otherAddress1.address, amount);

        // Construct permit() message from otherAddress1
        const sig1 = await signERC2612Permit(
            otherAddress1,
            stablecoin.address,
            otherAddress1.address,
            otherAddress2.address,
            amount.toString()
        );
        await stablecoin.connect(otherAddress2).permit(
            otherAddress1.address,
            otherAddress2.address,
            amount,
            sig1.deadline,
            sig1.v,
            sig1.r,
            sig1.s
        );

        // Check allowance
        const a1 = await stablecoin.allowance(otherAddress1.address, otherAddress2.address);
        expect(a1).to.eq(amount);

        // tranferFrom()
        await stablecoin.connect(otherAddress2).transferFrom(otherAddress1.address, otherAddress2.address, amount);

        // Check allowance
        const a2 = await stablecoin.allowance(otherAddress1.address, otherAddress2.address);
        expect(a2).to.eq(0);

        // Construct permit() from otherAddress2 (small deadline)
        var lblock = await (otherAddress1.provider as any).getBlock('latest');
        var ddl = lblock.timestamp + 100;
        await (otherAddress1.provider as any).send("evm_increaseTime", [500]);

        const sig2 = await signERC2612Permit(
            otherAddress2,
            stablecoin.address,
            otherAddress2.address,
            otherAddress1.address,
            amount.toString(),
            ddl
        );
        await expect(
            stablecoin.connect(otherAddress2).permit(
                otherAddress2.address,
                otherAddress1.address,
                amount,
                sig2.deadline,
                sig2.v,
                sig2.r,
                sig2.s
            )
        )
        .to.be.revertedWith(
            "Permit: EXPIRED"
        );

        // Forged signature (reuse nonce)
        await expect(
            stablecoin.connect(otherAddress2).permit(
                otherAddress1.address,
                otherAddress2.address,
                amount,
                sig1.deadline,
                sig1.v,
                sig1.r,
                sig1.s
            )
        )
        .to.be.revertedWith(
            "Permit: INVALID_SIGNATURE"
        );

        // Signature investor 2
        const sig3 = await signERC2612Permit(
            otherAddress2,
            stablecoin.address,
            otherAddress2.address,
            otherAddress1.address,
            amount.toString()
        );
        await stablecoin.permit(
            otherAddress2.address,
            otherAddress1.address,
            amount,
            sig3.deadline,
            sig3.v,
            sig3.r,
            sig3.s
        );
        await stablecoin.connect(otherAddress1).transferFrom(otherAddress2.address, otherAddress1.address, amount);

        // Second signature investor 1
        const sig4 = await signERC2612Permit(
            otherAddress1,
            stablecoin.address,
            otherAddress1.address,
            otherAddress2.address,
            amount.toString()
        );
        await stablecoin.connect(otherAddress2).permit(
            otherAddress1.address,
            otherAddress2.address,
            amount,
            sig4.deadline,
            sig4.v,
            sig4.r,
            sig4.s
        );

        await stablecoin.connect(otherAddress2).transferFrom(otherAddress1.address, otherAddress2.address, amount);
    });
});
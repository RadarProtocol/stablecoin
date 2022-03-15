import { expect } from "chai";
import { toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";

const snapshot = async () => {
    const [deployer, otherAddress1, investor1, investor2, pokeMe] = await ethers.getSigners();

    const lickHitterFactory = await ethers.getContractFactory("LickHitter");
    const lickHitter = await lickHitterFactory.deploy(pokeMe.address);

    const mockTokenFactory = await ethers.getContractFactory("TheStableMoney");
    const mockToken = await mockTokenFactory.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther('1000000'));

    return {
        lickHitter,
        deployer,
        otherAddress1,
        investor1,
        investor2,
        pokeMe,
        mockToken
    }
}

describe('LickHitter', () => {
    it("Initial State", async () => {
        const {
            lickHitter,
            investor1,
            deployer
        } = await snapshot();

        const actualDS = await lickHitter.DOMAIN_SEPARATOR();

        const coder = new ethers.utils.AbiCoder();
        const expectedDS = ethers.utils.keccak256(coder.encode(
            ["bytes32", "bytes32", "bytes32", "uint", "address"],
            [
                ethers.utils.keccak256("0x454950373132446f6d61696e28737472696e67206e616d652c737472696e672076657273696f6e2c75696e7432353620636861696e49642c6164647265737320766572696679696e67436f6e747261637429"),
                ethers.utils.keccak256("0x4c69636b486974746572"),
                ethers.utils.keccak256("0x31"),
                31337,
                lickHitter.address
            ]
        ));

        expect(actualDS).to.eq(expectedDS);

        const DEPOSTI_TYPEHASH = await lickHitter.DEPOSIT_TYPEHASH();
        const WITHDRAW_TYPEHASH = await lickHitter.WITHDRAW_TYPEHASH();
        expect(DEPOSTI_TYPEHASH).to.eq(ethers.utils.keccak256(toUtf8Bytes("depositWithSignature(address _token,address _payer,address _destination,uint256 _amount,uint256 _nonce,uint256 _deadline)")));
        expect(WITHDRAW_TYPEHASH).to.eq(ethers.utils.keccak256(toUtf8Bytes("withdrawWithSignature(address _token,address _payer,address _destination,uint256 _shares,uint256 _nonce,uint256 _deadline)")));

        const getOwner = await lickHitter.getOwner();
        expect(getOwner).to.eq(deployer.address);

        const getPendingOwner = await lickHitter.getPendingOwner();
        expect(getPendingOwner).to.eq(ethers.constants.AddressZero);
    });
    it("Access Control", async () => {
        const {
            lickHitter,
            deployer,
            otherAddress1
        } = await snapshot();

        await expect(lickHitter.connect(otherAddress1).executeStrategy(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).changePokeMe(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).changeBufferAmount(ethers.constants.AddressZero, 0)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).addStrategy(ethers.constants.AddressZero, ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).removeStrategy(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).emptyStrategy(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).addSupportedToken(ethers.constants.AddressZero, 0)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(lickHitter.connect(otherAddress1).removeSupportedToken(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );
    });
    it("Transfer Ownership", async () => {
        const {
            lickHitter,
            deployer,
            otherAddress1
        } = await snapshot();

        await expect(lickHitter.connect(otherAddress1).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await lickHitter.connect(deployer).transferOwnership(otherAddress1.address);

        const getPendingOwnerCall = await lickHitter.getPendingOwner();
        expect(getPendingOwnerCall).to.equal(otherAddress1.address);

        await expect(lickHitter.connect(deployer).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        const tx = await lickHitter.connect(otherAddress1).claimOwnership();
        const receipt = await tx.wait();

        const event = receipt.events![0];

        expect(event.event).to.eq('OwnershipTransferred');
        expect(event.args.oldOwner).to.eq(deployer.address);
        expect(event.args.newOwner).to.eq(otherAddress1.address);

        const getPendingOwnerCall2 = await lickHitter.getPendingOwner();
        const getOwnerCall = await lickHitter.getOwner();
        expect(getPendingOwnerCall2).to.equal(ethers.constants.AddressZero);
        expect(getOwnerCall).to.equal(otherAddress1.address);

        await expect(lickHitter.connect(deployer).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await lickHitter.connect(otherAddress1).transferOwnership(deployer.address);
    });
    it("Add/Remove supported tokens", async () => {
        const {
            lickHitter,
            mockToken
        } = await snapshot();

        const addReceipt = await lickHitter.addSupportedToken(mockToken.address, ethers.utils.parseEther("10"));
        const addTx = await addReceipt.wait();

        const addEvent = addTx.events![0];

        await expect(lickHitter.addSupportedToken(mockToken.address, ethers.utils.parseEther("10"))).to.be.revertedWith(
            "Token already added"
        );

        const getIsSup1 = await lickHitter.getIsSupportedToken(mockToken.address);
        expect(getIsSup1).to.eq(true);

        expect(addEvent.event).to.eq("TokenAdded");
        expect(addEvent.args.token).to.eq(mockToken.address);
        expect(addEvent.args.bufferSize).to.eq(ethers.utils.parseEther("10"));

        const removeReceipt = await lickHitter.removeSupportedToken(mockToken.address);
        const removeTx = await removeReceipt.wait();

        const removeEvent = removeTx.events![0];

        await expect(lickHitter.removeSupportedToken(mockToken.address)).to.be.revertedWith(
            "Token not supported"
        );

        const getIsSup2 = await lickHitter.getIsSupportedToken(mockToken.address);
        expect(getIsSup2).to.eq(false);

        expect(removeEvent.event).to.eq("TokenRemoved");
        expect(removeEvent.args.token).to.eq(mockToken.address);
    });
    it.skip("Add/Remove strategy");
    it.skip("Empty strategy");
    it.skip("Deposit");
    it.skip("Withdraw");
    it.skip("convertShares");
    it.skip("Deposit (signature)");
    it.skip("Withdraw (signature)");
    it.skip("Share transfer");
    it.skip("Strategy Execution");
});
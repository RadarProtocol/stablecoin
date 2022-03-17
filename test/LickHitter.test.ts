import { expect } from "chai";
import { toUtf8Bytes } from "ethers/lib/utils";
import { ethers } from "hardhat";

const deposit = async (
    depositor: any,
    lickHitter: any,
    amount: any,
    mockToken: any
) => {
    await mockToken.transfer(depositor.address, amount);
    await mockToken.connect(depositor).approve(lickHitter.address, amount);

    const d1tx = await lickHitter.connect(depositor).deposit(
        mockToken.address,
        depositor.address,
        amount
    );
    const d1rc = await d1tx.wait();
    return d1rc;
}

const snapshot = async () => {
    const [deployer, otherAddress1, investor1, investor2, pokeMe, otherStrategyToken] = await ethers.getSigners();

    const lickHitterFactory = await ethers.getContractFactory("LickHitter");
    const lickHitter = await lickHitterFactory.deploy(pokeMe.address);

    const mockTokenFactory = await ethers.getContractFactory("TheStableMoney");
    const mockToken = await mockTokenFactory.deploy();
    await mockToken.mint(deployer.address, ethers.utils.parseEther('1000000'));

    const mockStrategyFactory = await ethers.getContractFactory("MockStrategy");
    const mockStrategy = await mockStrategyFactory.deploy(
        lickHitter.address,
        [mockToken.address, otherStrategyToken.address]
    );

    return {
        lickHitter,
        deployer,
        otherAddress1,
        investor1,
        investor2,
        pokeMe,
        mockToken,
        mockStrategy,
        otherStrategyToken
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
    it("Add/Remove strategy", async () => {
        const {
            lickHitter,
            mockToken,
            mockStrategy,
            otherAddress1
        } = await snapshot();

        await expect(lickHitter.addStrategy(mockToken.address, mockStrategy.address)).to.be.revertedWith(
            "Token not supported"
        );

        await lickHitter.addSupportedToken(otherAddress1.address, 0);

        await expect(lickHitter.addStrategy(otherAddress1.address, mockStrategy.address)).to.be.revertedWith(
            "Token not supported"
        );

        await lickHitter.addSupportedToken(mockToken.address, 0);

        const addSTx = await lickHitter.addStrategy(mockToken.address, mockStrategy.address);
        const addSReceipt = await addSTx.wait();

        const event = addSReceipt.events![0];
        expect(event.event).to.eq("StrategyAdded");
        expect(event.args.token).to.eq(mockToken.address);
        expect(event.args.strategy).to.eq(mockStrategy.address);

        const tokenStrategy = await lickHitter.getTokenStrategy(mockToken.address);
        expect(tokenStrategy).to.eq(mockStrategy.address);

        const removeSTx = await lickHitter.removeStrategy(mockToken.address);
        const removeSReceipt = await removeSTx.wait();

        const removeEvent = removeSReceipt.events![0];
        expect(removeEvent.event).to.eq("StrategyRemoved");
        expect(removeEvent.args.token).to.eq(mockToken.address);

        const tokenStrategy2 = await lickHitter.getTokenStrategy(mockToken.address);
        expect(tokenStrategy2).to.eq(ethers.constants.AddressZero);
    });
    it("Empty strategy", async () => {
        const {
            lickHitter,
            mockToken,
            mockStrategy
        } = await snapshot();

        const amount = ethers.utils.parseEther('1');
        await mockToken.transfer(mockStrategy.address, amount);

        await lickHitter.addSupportedToken(mockToken.address, 0);

        await expect(lickHitter.emptyStrategy(mockToken.address)).to.be.revertedWith("Strategy doesn't exist");

        await lickHitter.addStrategy(mockToken.address, mockStrategy.address);

        await lickHitter.emptyStrategy(mockToken.address);

        const bal = await mockToken.balanceOf(lickHitter.address);
        expect(bal).to.eq(amount);
    });
    it("Deposit", async () => {
        const {
            lickHitter,
            mockToken,
            investor1,
            investor2
        } = await snapshot();

        await lickHitter.addSupportedToken(mockToken.address, 0);
        const amount1 = ethers.utils.parseEther('10');
        const amount2 = ethers.utils.parseEther('20');

        const d1rc = await deposit(investor1, lickHitter, amount1, mockToken);
        const d1event = d1rc.events![2]; // events 0 and 1 are ERC20

        expect(d1event.event).to.eq("Deposit");
        expect(d1event.args.token).to.eq(mockToken.address);
        expect(d1event.args.payer).to.eq(investor1.address);
        expect(d1event.args.receiver).to.eq(investor1.address);
        expect(d1event.args.amount).to.eq(amount1);
        expect(d1event.args.sharesMinted).to.eq(amount1);

        const b1 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b1).to.eq(amount1);
        const ts1 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts1).to.eq(amount1);

        const d2rc = await deposit(investor2, lickHitter, amount2, mockToken);
        const d2event = d2rc.events![2]; // events 0 and 1 are ERC20

        expect(d2event.event).to.eq("Deposit");
        expect(d2event.args.token).to.eq(mockToken.address);
        expect(d2event.args.payer).to.eq(investor2.address);
        expect(d2event.args.receiver).to.eq(investor2.address);
        expect(d2event.args.amount).to.eq(amount2);
        expect(d2event.args.sharesMinted).to.eq(amount2);

        const b2 = await lickHitter.balanceOf(mockToken.address, investor2.address);
        expect(b2).to.eq(amount2);
        const ts2 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts2).to.eq(amount1.add(amount2));

        // Simulate profit (share price should now be 0.5 instead of 1)
        await mockToken.transfer(lickHitter.address, amount1.add(amount2));

        const sharePrice = await lickHitter.convertShares(mockToken.address, 0, ethers.utils.parseEther('1'));
        expect(sharePrice).to.eq(ethers.utils.parseEther('0.5'));

        await deposit(investor1, lickHitter, amount1, mockToken);
        const b3 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b3).to.eq(amount1.add(amount1.div(2)));
        const ts3= await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts3).to.eq(amount1.add(amount2).add(amount1.div(2)));
        
    });
    it.skip("Withdraw");
    it.skip("convertShares");
    it.skip("Deposit (signature)");
    it.skip("Withdraw (signature)");
    it.skip("Share transfer");
    it.skip("Strategy Execution");
    it("Other Admin Functions", async () => {
        const {
            lickHitter,
            mockToken,
            otherAddress1,
            pokeMe,
            mockStrategy
        } = await snapshot();


        await lickHitter.addSupportedToken(mockToken.address, 0);
        await lickHitter.addStrategy(mockToken.address, mockStrategy.address);

        await lickHitter.connect(pokeMe).executeStrategy(mockToken.address);
        await expect(lickHitter.connect(otherAddress1).executeStrategy(mockToken.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await lickHitter.changePokeMe(otherAddress1.address);

        await lickHitter.connect(otherAddress1).executeStrategy(mockToken.address);
        await expect(lickHitter.connect(pokeMe).executeStrategy(mockToken.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await lickHitter.changeBufferAmount(mockToken.address, ethers.utils.parseEther("1000"));
    });
});
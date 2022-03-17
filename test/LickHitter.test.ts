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

const withdraw = async (
    withdrawer: any,
    lickHitter: any,
    amount: any,
    mockToken: any
) => {
    const d1tx = await lickHitter.connect(withdrawer).withdraw(
        mockToken.address,
        withdrawer.address,
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

        // TODO: Might not need this if tokens go through lending pair first
        // const actualDS = await lickHitter.DOMAIN_SEPARATOR();

        // const coder = new ethers.utils.AbiCoder();
        // const expectedDS = ethers.utils.keccak256(coder.encode(
        //     ["bytes32", "bytes32", "bytes32", "uint", "address"],
        //     [
        //         ethers.utils.keccak256("0x454950373132446f6d61696e28737472696e67206e616d652c737472696e672076657273696f6e2c75696e7432353620636861696e49642c6164647265737320766572696679696e67436f6e747261637429"),
        //         ethers.utils.keccak256("0x4c69636b486974746572"),
        //         ethers.utils.keccak256("0x31"),
        //         31337,
        //         lickHitter.address
        //     ]
        // ));

        // expect(actualDS).to.eq(expectedDS);

        // TODO: Might not need this if tokens go through lending pair first
        // const DEPOSTI_TYPEHASH = await lickHitter.DEPOSIT_TYPEHASH();
        // const WITHDRAW_TYPEHASH = await lickHitter.WITHDRAW_TYPEHASH();
        // expect(DEPOSTI_TYPEHASH).to.eq(ethers.utils.keccak256(toUtf8Bytes("depositWithSignature(address _token,address _payer,address _destination,uint256 _amount,uint256 _nonce,uint256 _deadline)")));
        // expect(WITHDRAW_TYPEHASH).to.eq(ethers.utils.keccak256(toUtf8Bytes("withdrawWithSignature(address _token,address _payer,address _destination,uint256 _shares,uint256 _nonce,uint256 _deadline)")));

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
        const tb1 = await mockToken.balanceOf(investor1.address);
        expect(tb1).to.eq(0);
        const ltb1 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb1).to.eq(amount1);

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
        const tb2 = await mockToken.balanceOf(investor2.address);
        expect(tb2).to.eq(0);
        const ltb2 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb2).to.eq(amount1.add(amount2));

        // Simulate profit (share price should now be 0.5 instead of 1)
        await mockToken.transfer(lickHitter.address, amount1.add(amount2));

        const sharePrice = await lickHitter.convertShares(mockToken.address, 0, ethers.utils.parseEther('1'));
        expect(sharePrice).to.eq(ethers.utils.parseEther('0.5'));

        const d3rc = await deposit(investor1, lickHitter, amount1, mockToken);
        const d3event = d3rc.events![2];
        expect(d3event.event).to.eq("Deposit");
        expect(d3event.args.token).to.eq(mockToken.address);
        expect(d3event.args.payer).to.eq(investor1.address);
        expect(d3event.args.receiver).to.eq(investor1.address);
        expect(d3event.args.amount).to.eq(amount1);
        expect(d3event.args.sharesMinted).to.eq(amount1.div(2));
        const b3 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b3).to.eq(amount1.add(amount1.div(2)));
        const ts3 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts3).to.eq(amount1.add(amount2).add(amount1.div(2)));
        const tb3 = await mockToken.balanceOf(investor1.address);
        expect(tb3).to.eq(0);
        const ltb3 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb3).to.eq(amount1.mul(3).add(amount2.mul(2)));
        
    });
    it("Withdraw", async () => {
        const {
            lickHitter,
            mockToken,
            investor1,
            investor2
        } = await snapshot();

        await lickHitter.addSupportedToken(mockToken.address, 0);
        const amount1 = ethers.utils.parseEther('10');
        const amount2 = ethers.utils.parseEther('20');

        // Deposit
        await deposit(investor1, lickHitter, amount1, mockToken);
        await deposit(investor2, lickHitter, amount2, mockToken);

        await expect(lickHitter.connect(investor1).withdraw(mockToken.address, investor1.address, amount2)).to.be.revertedWith(
            "Not enough funds"
        );

        const w1 = await withdraw(investor1, lickHitter, amount1, mockToken);
        const w1event = w1.events![1];
        expect(w1event.event).to.eq("Withdraw");
        expect(w1event.args.token).to.eq(mockToken.address);
        expect(w1event.args.payer).to.eq(investor1.address);
        expect(w1event.args.receiver).to.eq(investor1.address);
        expect(w1event.args.amount).to.eq(amount1);
        expect(w1event.args.sharesBurned).to.eq(amount1);
        const b1 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b1).to.eq(0);
        const ts1 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts1).to.eq(amount2);
        const tb1 = await mockToken.balanceOf(investor1.address);
        expect(tb1).to.eq(amount1);
        const ltb1 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb1).to.eq(amount2);

        const w2 = await withdraw(investor2, lickHitter, amount2, mockToken);
        const w2event = w2.events![1];
        expect(w2event.event).to.eq("Withdraw");
        expect(w2event.args.token).to.eq(mockToken.address);
        expect(w2event.args.payer).to.eq(investor2.address);
        expect(w2event.args.receiver).to.eq(investor2.address);
        expect(w2event.args.amount).to.eq(amount2);
        expect(w2event.args.sharesBurned).to.eq(amount2);
        const b2 = await lickHitter.balanceOf(mockToken.address, investor2.address);
        expect(b2).to.eq(0);
        const ts2 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts2).to.eq(0);
        const tb2 = await mockToken.balanceOf(investor2.address);
        expect(tb2).to.eq(amount2);
        const ltb2 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb2).to.eq(0);

        // Deposit again (and profit)
        await deposit(investor1, lickHitter, amount1, mockToken);
        await deposit(investor2, lickHitter, amount2, mockToken);
        await mockToken.transfer(lickHitter.address, amount1.add(amount2));

        const w3 = await withdraw(investor1, lickHitter, amount1, mockToken);
        const w3event = w3.events![1];
        expect(w3event.event).to.eq("Withdraw");
        expect(w3event.args.token).to.eq(mockToken.address);
        expect(w3event.args.payer).to.eq(investor1.address);
        expect(w3event.args.receiver).to.eq(investor1.address);
        expect(w3event.args.amount).to.eq(amount1.mul(2));
        expect(w3event.args.sharesBurned).to.eq(amount1);
        const b3 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b3).to.eq(0);
        const ts3 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts3).to.eq(amount2);
        const tb3 = await mockToken.balanceOf(investor1.address);
        expect(tb3).to.eq(amount1.mul(3));
        const ltb3 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb3).to.eq((amount1.add(amount2)).mul(4).div(3));

        const w4 = await withdraw(investor2, lickHitter, amount2, mockToken);
        const w4event = w4.events![1];
        expect(w4event.event).to.eq("Withdraw");
        expect(w4event.args.token).to.eq(mockToken.address);
        expect(w4event.args.payer).to.eq(investor2.address);
        expect(w4event.args.receiver).to.eq(investor2.address);
        expect(w4event.args.amount).to.eq(amount2.mul(2));
        expect(w4event.args.sharesBurned).to.eq(amount2);
        const b4 = await lickHitter.balanceOf(mockToken.address, investor2.address);
        expect(b4).to.eq(0);
        const ts4 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts4).to.eq(0);
        const tb4 = await mockToken.balanceOf(investor2.address);
        expect(tb4).to.eq(amount2.mul(3));
        const ltb4 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb4).to.eq(0);
    });
    it("Withdraw + strategy withdraw", async () => {
        const {
            lickHitter,
            mockToken,
            investor1,
            mockStrategy
        } = await snapshot();

        await lickHitter.addSupportedToken(mockToken.address, ethers.utils.parseEther('5'));
        await lickHitter.addStrategy(mockToken.address, mockStrategy.address);
        const amount = ethers.utils.parseEther('10');

        // Deposit
        await deposit(investor1, lickHitter, amount, mockToken);

        // Deposit to strategy
        await lickHitter.executeStrategy(mockToken.address);
        const sbalb = await mockToken.balanceOf(mockStrategy.address);
        expect(sbalb).to.eq(amount.div(2));

        // Now we should have 5 tokens in lickHitter and 5 tokens in strategy
        // Withdraw 5 tokens from lickHitter
        const wr1 = await withdraw(investor1, lickHitter, amount.div(2), mockToken);
        const w1event = wr1.events![1];
        expect(wr1.events!.length).to.eq(2);
        expect(w1event.event).to.eq("Withdraw");
        expect(w1event.args.token).to.eq(mockToken.address);
        expect(w1event.args.payer).to.eq(investor1.address);
        expect(w1event.args.receiver).to.eq(investor1.address);
        expect(w1event.args.amount).to.eq(amount.div(2));
        expect(w1event.args.sharesBurned).to.eq(amount.div(2));
        const b1 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b1).to.eq(amount.div(2));
        const ts1 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts1).to.eq(amount.div(2));
        const tb1 = await mockToken.balanceOf(investor1.address);
        expect(tb1).to.eq(amount.div(2));
        const ltb1 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb1).to.eq(0);
        const sb1 = await mockToken.balanceOf(mockStrategy.address);
        expect(sb1).to.eq(amount.div(2));

        // Withdraw 5 tokens from strategy
        const wr2 = await withdraw(investor1, lickHitter, amount.div(2), mockToken);
        const w2event = wr2.events![2];
        expect(wr2.events!.length).to.eq(3);
        expect(w2event.event).to.eq("Withdraw");
        expect(w2event.args.token).to.eq(mockToken.address);
        expect(w2event.args.payer).to.eq(investor1.address);
        expect(w2event.args.receiver).to.eq(investor1.address);
        expect(w2event.args.amount).to.eq(amount.div(2));
        expect(w2event.args.sharesBurned).to.eq(amount.div(2));
        const b2 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        expect(b2).to.eq(0);
        const ts2 = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(ts2).to.eq(0);
        const tb2 = await mockToken.balanceOf(investor1.address);
        expect(tb2).to.eq(amount);
        const ltb2 = await mockToken.balanceOf(lickHitter.address);
        expect(ltb2).to.eq(0);
        const sb2 = await mockToken.balanceOf(mockStrategy.address);
        expect(sb2).to.eq(0);
    })
    it("convertShares", async () => {
        const {
            lickHitter,
            mockToken,
            investor1
        } = await snapshot();

        await lickHitter.addSupportedToken(mockToken.address, 0);

        // Calculate shares
        // Expected: _share = _amount
        var result = await lickHitter.convertShares(mockToken.address, 0, 1);
        expect(result).to.eq(1);

        // Calculate amount
        // Expected: _share = _amount
        result = await lickHitter.convertShares(mockToken.address, 1, 0);
        expect(result).to.eq(1);

        // What happens if token is transferred (aka profit) before deposit
        // Expected: _share = _amount
        // but after deposit, it should be profit
        await mockToken.transfer(lickHitter.address, 5);
        result = await lickHitter.convertShares(mockToken.address, 1, 0);
        expect(result).to.eq(1);
        result = await lickHitter.convertShares(mockToken.address, 0, 1);
        expect(result).to.eq(1);
        await deposit(investor1, lickHitter, 5, mockToken);
        result = await lickHitter.convertShares(mockToken.address, 1, 0);
        expect(result).to.eq(2);
        result = await lickHitter.convertShares(mockToken.address, 0, 2);
        expect(result).to.eq(1);
        await withdraw(investor1, lickHitter, 5, mockToken);
        
        // Deposit and calculate
        // Expected: _share = _amount
        await deposit(investor1, lickHitter, 5, mockToken);
        result = await lickHitter.convertShares(mockToken.address, 1, 0);
        expect(result).to.eq(1);
        result = await lickHitter.convertShares(mockToken.address, 0, 1);
        expect(result).to.eq(1);
        await withdraw(investor1, lickHitter, 5, mockToken);

        // Deposit and profit and calculate
        await deposit(investor1, lickHitter, 5, mockToken);
        await mockToken.transfer(lickHitter.address, 1);
        result = await lickHitter.convertShares(mockToken.address, 100, 0);
        expect(result).to.eq(120);
        result = await lickHitter.convertShares(mockToken.address, 0, 120);
        expect(result).to.eq(100);
    });
    it.skip("Deposit (signature)");
    it.skip("Withdraw (signature)");
    it("Share transfer", async () => {
        const {
            lickHitter,
            mockToken,
            investor1,
            investor2
        } = await snapshot();

        await lickHitter.addSupportedToken(mockToken.address, 0);
        const amount = ethers.utils.parseEther('10');

        await deposit(investor1, lickHitter, amount, mockToken);
        const bi1 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        const bii1 = await lickHitter.balanceOf(mockToken.address, investor2.address);
        expect(bi1).to.eq(amount);
        expect(bii1).to.eq(0);

        await lickHitter.connect(investor1).transferShares(mockToken.address, investor2.address, amount);
        
        const bi2 = await lickHitter.balanceOf(mockToken.address, investor1.address);
        const bii2 = await lickHitter.balanceOf(mockToken.address, investor2.address);
        expect(bi2).to.eq(0);
        expect(bii2).to.eq(amount);

        await withdraw(investor2, lickHitter, amount, mockToken);
    });
    it("Strategy Execution", async () => {
        const {
            lickHitter,
            mockToken,
            investor1,
            mockStrategy,
            pokeMe
        } = await snapshot();

        await expect(lickHitter.connect(pokeMe).executeStrategy(mockToken.address)).to.be.revertedWith(
            "Strategy doesn't exist"
        );

        await lickHitter.addSupportedToken(mockToken.address, ethers.utils.parseEther('5'));

        await expect(lickHitter.connect(pokeMe).executeStrategy(mockToken.address)).to.be.revertedWith(
            "Strategy doesn't exist"
        );

        await lickHitter.addStrategy(mockToken.address, mockStrategy.address);
        const amount = ethers.utils.parseEther('10');

        // Deposit
        await deposit(investor1, lickHitter, amount, mockToken);

        // Deposit to strategy
        await lickHitter.connect(pokeMe).executeStrategy(mockToken.address);
        const sbalb = await mockToken.balanceOf(mockStrategy.address);
        expect(sbalb).to.eq(amount.div(2));
        const lhbalb = await mockToken.balanceOf(lickHitter.address);
        expect(lhbalb).to.eq(amount.div(2));
        const totalInvested = await lickHitter.getTotalInvested(mockToken.address);
        expect(totalInvested).to.eq(amount);

        const tsb = await lickHitter.getTotalShareSupply(mockToken.address);
        expect(tsb).to.eq(amount);
    });
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
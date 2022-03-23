import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";
import { LendingPair, LickHitter, TheStableMoney } from "../typechain";

const DUST = ethers.utils.parseEther('0.0001');

const snapshot = async () => {
    const [deployer, otherAddress1, investor1, investor2, feeReceiver] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("TheStableMoney");
    const stablecoin = await tokenFactory.deploy();
    const collateral = await tokenFactory.deploy();

    const lickHitterFactory = await ethers.getContractFactory("LickHitter");
    const yieldVault = await lickHitterFactory.deploy(otherAddress1.address);

    await yieldVault.addSupportedToken(collateral.address, 0);
    await yieldVault.addSupportedToken(stablecoin.address, 0);

    const mockOracleFactory = await ethers.getContractFactory("MockOracle");
    const mockOracle = await mockOracleFactory.deploy(collateral.address, 2); // collateral is worth $2

    const masterFactory = await ethers.getContractFactory("LendingPair");
    const proxyFactory = await ethers.getContractFactory("LendingNUP");

    const masterContract = await masterFactory.deploy();

    const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle)"]);
    const initData = initInterface.encodeFunctionData("init", [
        collateral.address,
        stablecoin.address,
        100, // 1%
        100, // 1%
        500, // 5%
        1000, // 10%
        yieldVault.address,
        feeReceiver.address,
        9200, // 92%
        mockOracle.address
    ]);

    const lendingPairProxy = await proxyFactory.deploy(initData, masterContract.address);
    const lendingPair = masterFactory.attach(lendingPairProxy.address)

    return {
        deployer,
        otherAddress1,
        investor1,
        investor2,
        feeReceiver,
        stablecoin,
        collateral,
        yieldVault,
        mockOracle,
        masterContract,
        lendingPair
    }
}

const addStablecoinToLending = async (
    stablecoin: TheStableMoney,
    yieldVault: LickHitter,
    lendingPair: LendingPair,
    amount: BigNumber,
    deployer: SignerWithAddress
) => {
    await stablecoin.mint(deployer.address, amount);
    await stablecoin.approve(yieldVault.address, amount);
    await yieldVault.deposit(stablecoin.address, lendingPair.address, amount);
}

const deposit = async (
    investor: SignerWithAddress,
    lendingPair: LendingPair,
    collateral: TheStableMoney,
    amount: BigNumberish
) => {
    await collateral.mint(investor.address, amount);
    await collateral.connect(investor).approve(lendingPair.address, amount);

    const tx = await lendingPair.connect(investor).deposit(amount);
    const receipt = await tx.wait();

    return receipt;
}

const depositAndBorrow = async (
    investor: SignerWithAddress,
    lendingPair: LendingPair,
    collateral: TheStableMoney,
    depositAmount: BigNumberish,
    borrowAmount: BigNumberish,
    receivingAddress: SignerWithAddress
) => {
    await collateral.mint(investor.address, depositAmount);
    await collateral.connect(investor).approve(lendingPair.address, depositAmount);

    const tx = await lendingPair.connect(investor).depositAndBorrow(
        depositAmount,
        borrowAmount,
        receivingAddress.address
    );
    const receipt = await tx.wait();

    return receipt;
}

const repayAndWithdraw = async (
    investor: SignerWithAddress,
    lendingPair: LendingPair,
    repayAmount: BigNumberish,
    repayReceiver: SignerWithAddress,
    withdrawAmount: BigNumberish,
    withdrawReceiver: SignerWithAddress
) => {
    const tx = await lendingPair.connect(investor).repayAndWithdraw(
        repayAmount,
        repayReceiver.address,
        withdrawAmount,
        withdrawReceiver.address
    );
    const rc = await tx.wait();
    return rc;
}

describe("Lending Pair", () => {
    it("Initialization security", async () => {
        const {
            masterContract,
            lendingPair
        } = await snapshot();

        await expect(lendingPair.init(
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            0,
            0,
            0,
            0,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            0,
            ethers.constants.AddressZero
        )).to.be.revertedWith("Already initialized");

        await expect(masterContract.init(
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            0,
            0,
            0,
            0,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            0,
            ethers.constants.AddressZero
        )).to.be.revertedWith("Initializing master contract");
    });
    it("Initial State", async () => {
        const {
            lendingPair,
            collateral,
            stablecoin,
            mockOracle,
            otherAddress1,
            feeReceiver
        } = await snapshot();

        const ENTRY_FEE = await lendingPair.ENTRY_FEE();
        expect(ENTRY_FEE).to.eq(100);
        const EXIT_FEE = await lendingPair.EXIT_FEE();
        expect(EXIT_FEE).to.eq(100);
        const LIQ_INC = await lendingPair.LIQUIDATION_INCENTIVE();
        expect(LIQ_INC).to.eq(500);
        const RADAR_LIQ_FEE = await lendingPair.RADAR_LIQUIDATION_FEE();
        expect(RADAR_LIQ_FEE).to.eq(1000);
        const DIVISOR = await lendingPair.GENERAL_DIVISOR();
        expect(DIVISOR).to.eq(10000);
        const FEE_RECEIVER = await lendingPair.FEE_RECEIVER();
        expect(FEE_RECEIVER).to.eq(feeReceiver.address);
        const MAX_LTV = await lendingPair.MAX_LTV();
        expect(MAX_LTV).to.eq(9200);

        const getCollateral = await lendingPair.getCollateral();
        expect(getCollateral).to.eq(collateral.address);
        const getLendAsset = await lendingPair.getLendAsset();
        expect(getLendAsset).to.eq(stablecoin.address);
        const getOracle = await lendingPair.getOracle();
        expect(getOracle).to.eq(mockOracle.address);
        const getColBal = await lendingPair.getCollateralBalance(otherAddress1.address);
        expect(getColBal).to.eq(0);
        const getUserBorrow = await lendingPair.getUserBorrow(otherAddress1.address);
        expect(getUserBorrow).to.eq(0);
        const totalCol = await lendingPair.getTotalCollateralDeposited();
        expect(totalCol).to.eq(0);
        const totalBorr = await lendingPair.getTotalBorrowed();
        expect(totalBorr).to.eq(0);
        const uF = await lendingPair.unclaimedFees();
        expect(uF).to.eq(0);
        const atb = await lendingPair.availableToBorrow();
        expect(atb).to.eq(0);
    });
    it("Owner - master/proxy", async () => {
        const {
            deployer,
            lendingPair,
            masterContract
        } = await snapshot();

        const fakeOwner = await lendingPair.getOwner();
        const fakePendingOwner = await lendingPair.getPendingOwner();
        expect(fakeOwner).to.eq(fakePendingOwner).to.eq(ethers.constants.AddressZero);

        const owner = await masterContract.getOwner();
        const pendingOwner = await masterContract.getPendingOwner();
        expect(owner).to.eq(deployer.address);
        expect(pendingOwner).to.eq(ethers.constants.AddressZero);
    });
    it("Transfer Ownership + extra", async () => {
        const {
            deployer,
            otherAddress1,
            masterContract,
            lendingPair
        } = await snapshot();

        await expect(lendingPair.transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith("Cannot call this on proxy");
        await expect(lendingPair.claimOwnership()).to.be.revertedWith("Cannot call this on proxy");

        await expect(lendingPair.connect(otherAddress1).changeFeeReceiver(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(masterContract.connect(otherAddress1).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await masterContract.connect(deployer).transferOwnership(otherAddress1.address);

        const getPendingOwnerCall = await masterContract.getPendingOwner();
        expect(getPendingOwnerCall).to.equal(otherAddress1.address);
        const getFakePendingOwnerCall = await lendingPair.getPendingOwner();
        expect(getFakePendingOwnerCall).to.eq(ethers.constants.AddressZero);

        await expect(masterContract.connect(deployer).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        await masterContract.connect(otherAddress1).claimOwnership();

        const getPendingOwnerCall2 = await masterContract.getPendingOwner();
        const getOwnerCall = await masterContract.getOwner();
        const getFakeOwnerCall = await lendingPair.getOwner();
        expect(getPendingOwnerCall2).to.equal(ethers.constants.AddressZero);
        expect(getOwnerCall).to.equal(otherAddress1.address);
        expect(getFakeOwnerCall).to.eq(ethers.constants.AddressZero);

        await expect(masterContract.connect(deployer).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(deployer).changeFeeReceiver(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await lendingPair.connect(otherAddress1).changeFeeReceiver(otherAddress1.address);
        await masterContract.connect(otherAddress1).transferOwnership(deployer.address);
    });
    it("Access Control", async () => {
        const {
            lendingPair,
            masterContract,
            otherAddress1
        } = await snapshot();

        await expect(masterContract.connect(otherAddress1).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).changeFeeReceiver(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(otherAddress1).changeFeeReceiver(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).changeOracle(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(otherAddress1).changeOracle(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).burnStablecoin(1)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(otherAddress1).burnStablecoin(1)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).changeMaxLtv(1)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(otherAddress1).changeMaxLtv(1)).to.be.revertedWith(
            "Unauthorized"
        );

        await expect(masterContract.connect(otherAddress1).changeFees(0, 0, 0, 0)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(lendingPair.connect(otherAddress1).changeFees(0, 0, 0, 0)).to.be.revertedWith(
            "Unauthorized"
        );
    });
    it("Owner Change Functions", async () => {
        const {
            lendingPair,
            otherAddress1
        } = await snapshot();

        await lendingPair.changeFeeReceiver(otherAddress1.address);
        const fr = await lendingPair.FEE_RECEIVER();
        expect(fr).to.eq(otherAddress1.address);

        await lendingPair.changeOracle(otherAddress1.address);
        const o = await lendingPair.getOracle();
        expect(o).to.eq(otherAddress1.address);

        await lendingPair.changeMaxLtv(69);
        const mltv = await lendingPair.MAX_LTV();
        expect(mltv).to.eq(69);

        await lendingPair.changeFees(1, 2, 3, 4);
        const enf = await lendingPair.ENTRY_FEE();
        const exf = await lendingPair.EXIT_FEE();
        const l = await lendingPair.LIQUIDATION_INCENTIVE();
        const r = await lendingPair.RADAR_LIQUIDATION_FEE();
        expect(enf).to.eq(1);
        expect(exf).to.eq(2);
        expect(l).to.eq(3);
        expect(r).to.eq(4);
    });
    it("burn stablecoin", async () => {
        const {
            lendingPair,
            stablecoin,
            yieldVault,
            deployer
        } = await snapshot();

        const amount = ethers.utils.parseEther('1000000');
        await stablecoin.mint(deployer.address, amount);
        await stablecoin.approve(yieldVault.address, amount);
        await yieldVault.deposit(stablecoin.address, lendingPair.address, amount);

        const ts1 = await stablecoin.totalSupply();
        const atb1 = await lendingPair.availableToBorrow();
        const ysbal1 = await yieldVault.balanceOf(stablecoin.address, lendingPair.address);
        expect(ts1).to.eq(atb1).to.eq(ysbal1).to.eq(amount);

        await lendingPair.burnStablecoin(amount);

        const ts2 = await stablecoin.totalSupply();
        const atb2 = await lendingPair.availableToBorrow();
        const ysbal2 = await yieldVault.balanceOf(stablecoin.address, lendingPair.address);
        expect(ts2).to.eq(atb2).to.eq(ysbal2).to.eq(0);
    });
    it("Deposit", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            yieldVault
        } = await snapshot();

        const amount1 = ethers.utils.parseEther('50');
        const amount2 = ethers.utils.parseEther('100');

        const userBal1 = await lendingPair.getCollateralBalance(investor1.address);
        const totalCol1 = await lendingPair.getTotalCollateralDeposited();
        expect(userBal1).to.eq(0);
        expect(totalCol1).to.eq(0);

        const rc1 = await deposit(investor1, lendingPair, collateral, amount1);
        const e1 = rc1.events![rc1.events!.length-1];
        expect(e1.event).to.eq("CollateralAdded");
        expect(e1.args!.owner).to.eq(investor1.address);
        expect(e1.args!.amount).to.eq(amount1);
        expect(e1.args!.shares).to.eq(amount1); // No yield farming, so shares = amount

        const userBal2 = await lendingPair.getCollateralBalance(investor1.address);
        const totalCol2 = await lendingPair.getTotalCollateralDeposited();
        expect(userBal2).to.eq(amount1);
        expect(totalCol2).to.eq(amount1);

        const rc2 = await deposit(investor2, lendingPair, collateral, amount2);
        const e2 = rc2.events![rc2.events!.length-1];
        expect(e2.event).to.eq("CollateralAdded");
        expect(e2.args!.owner).to.eq(investor2.address);
        expect(e2.args!.amount).to.eq(amount2);
        expect(e2.args!.shares).to.eq(amount2); // No yield farming, so shares = amount

        const userBal3 = await lendingPair.getCollateralBalance(investor2.address);
        const totalCol3 = await lendingPair.getTotalCollateralDeposited();
        expect(userBal3).to.eq(amount2);
        expect(totalCol3).to.eq(amount1.add(amount2));

        const contractMoney = await collateral.balanceOf(lendingPair.address);
        expect(contractMoney).to.eq(0);
        const contractShare = await yieldVault.balanceOf(collateral.address, lendingPair.address);
        expect(contractShare).to.eq(amount1.add(amount2));

        const af1 = await collateral.balanceOf(investor1.address);
        const af2 = await collateral.balanceOf(investor2.address);
        const af3 = await collateral.balanceOf(yieldVault.address);
        expect(af1).to.eq(af2).to.eq(0);
        expect(af3).to.eq(amount1.add(amount2));
    });
    it("Withdraw", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            yieldVault
        } = await snapshot();

        const withdrawChecks = async (
            e: any,
            i1: SignerWithAddress,
            i2: SignerWithAddress,
            lp: LendingPair,
            cl: TheStableMoney,
            yv: LickHitter,
            vc: Array<any>
        ) => {
            var i = 0;
            if (e != null) {
                expect(e.event).to.eq(vc[i++]);
                expect(e.args!.owner).to.eq(vc[i++]);
                expect(e.args!.amount).to.eq(vc[i++]);
                expect(e.args!.shares).to.eq(vc[i++]);
            }

            const u1cb = await cl.balanceOf(i1.address);
            const u2cb = await cl.balanceOf(i2.address);
            expect(u1cb).to.eq(vc[i++]);
            expect(u2cb).to.eq(vc[i++]);

            const u1sb = await lp.getCollateralBalance(i1.address);
            const u2sb = await lp.getCollateralBalance(i2.address);
            expect(u1sb).to.eq(vc[i++]);
            expect(u2sb).to.eq(vc[i++]);

            const tcd = await lp.getTotalCollateralDeposited();
            expect(tcd).to.eq(vc[i++]);

            const pairBal = await yv.balanceOf(cl.address, lp.address);
            expect(pairBal).to.eq(vc[i++]);
        };
        
        const amount1 = ethers.utils.parseEther('50');
        const amount2 = ethers.utils.parseEther('100');

        await deposit(investor1, lendingPair, collateral, amount1);
        await deposit(investor2, lendingPair, collateral, amount2);

        const wtx1 = await lendingPair.connect(investor1).withdraw(amount1, investor1.address);
        const wrc1 = await wtx1.wait();
        const wevent1 = wrc1.events![wrc1.events!.length-1];
        await withdrawChecks(
            wevent1,
            investor1,
            investor2,
            lendingPair,
            collateral,
            yieldVault,
            [
                "CollateralRemoved", // Event name
                investor1.address, // Withdraw owner
                amount1, // Amount to withdraw
                amount1, // Shares burned from yieldVault, no profit => same as amount
                amount1, // Wallet collateral balance of inv1
                0, // Wallet collateral balance of i2
                0, // Collateral in lending inv1
                amount2, // Collateral in lending inv2
                amount2, // Total collateral in lending
                amount2 // Shares of collateral in yieldVault owned by lendingPair
            ]
        );

        // Withdraw half of inv2 into his address
        const wtx2 = await lendingPair.connect(investor2).withdraw(amount2.div(2), investor2.address);
        const wrc2 = await wtx2.wait();
        const wevent2 = wrc2.events![wrc2.events!.length-1];
        await withdrawChecks(
            wevent2,
            investor1,
            investor2,
            lendingPair,
            collateral,
            yieldVault,
            [
                "CollateralRemoved", // Event name
                investor2.address, // Withdraw owner
                amount2.div(2), // Amount to withdraw
                amount2.div(2), // Shares burned from yieldVault, no profit => same as amount
                amount1, // Wallet collateral balance of inv1
                amount2.div(2), // Wallet collateral balance of i2
                0, // Collateral in lending inv1
                amount2.div(2), // Collateral in lending inv2
                amount2.div(2), // Total collateral in lending
                amount2.div(2) // Shares of collateral in yieldVault owned by lendingPair
            ]
        );

        // Withdraw rest of inv2 into inv1 address
        // Withdraw half of inv2 into his address
        const wtx3 = await lendingPair.connect(investor2).withdraw(amount2.div(2), investor1.address);
        const wrc3 = await wtx3.wait();
        const wevent3 = wrc3.events![wrc3.events!.length-1];
        await withdrawChecks(
            wevent3,
            investor1,
            investor2,
            lendingPair,
            collateral,
            yieldVault,
            [
                "CollateralRemoved", // Event name
                investor2.address, // Withdraw owner
                amount2.div(2), // Amount to withdraw
                amount2.div(2), // Shares burned from yieldVault, no profit => same as amount
                amount1.add(amount2.div(2)), // Wallet collateral balance of inv1
                amount2.div(2), // Wallet collateral balance of i2
                0, // Collateral in lending inv1
                0, // Collateral in lending inv2
                0, // Total collateral in lending
                0 // Shares of collateral in yieldVault owned by lendingPair
            ]
        );
    });
    it("Borrow", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            stablecoin,
            yieldVault,
            deployer,
            mockOracle
        } = await snapshot();

        const borrowChecks = async (
            e1: any,
            e2: any,
            i1: SignerWithAddress,
            i2: SignerWithAddress,
            lp: LendingPair,
            vc: Array<any>
        ) => {
            var i = 0;
            if (e1 != null) {
                expect(e1.event).to.eq(vc[i++]);
                expect(e1.args!.owner).to.eq(vc[i++]);
                expect(e1.args!.borrowAmount).to.eq(vc[i++]);
                expect(e1.args!.receiver).to.eq(vc[i++]);
            }
            if (e2 != null) {
                expect(e2.event).to.eq(vc[i++]);
                expect(e2.args!.owner).to.eq(vc[i++]);
                expect(e2.args!.borrowAmount).to.eq(vc[i++]);
                expect(e2.args!.receiver).to.eq(vc[i++]);
            }

            const u1sb = await stablecoin.balanceOf(i1.address);
            const u2sb = await stablecoin.balanceOf(i2.address);
            expect(u1sb).to.eq(vc[i++]);
            expect(u2sb).to.eq(vc[i++]);

            const tb = await lendingPair.getTotalBorrowed();
            expect(tb).to.eq(vc[i++]);

            const gub1 = await lendingPair.getUserBorrow(i1.address);
            const gub2 = await lendingPair.getUserBorrow(i2.address);
            expect(gub1).to.eq(vc[i++]);
            expect(gub2).to.eq(vc[i++]);

            const a2b = await lendingPair.availableToBorrow();
            expect(a2b).to.eq(vc[i++]);
        }

        const collateralAmount1 = ethers.utils.parseEther('50');
        const collateralAmount2 = ethers.utils.parseEther('100');
        var borrowAmount1 = collateralAmount1.mul(2).mul(9200).div(10000);
        var borrowAmount2 = collateralAmount2.mul(2).mul(9200).div(10000);

        const totalAdded = ethers.utils.parseEther('100000');

        await addStablecoinToLending(
            stablecoin,
            yieldVault,
            lendingPair,
            totalAdded,
            deployer
        );

        await expect(lendingPair.connect(investor1).borrow(investor1.address, borrowAmount1)).to.be.revertedWith("User not safe");
        await expect(lendingPair.connect(investor2).borrow(investor2.address, borrowAmount2)).to.be.revertedWith("User not safe");

        await deposit(investor1, lendingPair, collateral, collateralAmount1);
        await deposit(investor2, lendingPair, collateral, collateralAmount2);

        await expect(lendingPair.connect(investor1).borrow(investor1.address, borrowAmount1)).to.be.revertedWith("User not safe");
        await expect(lendingPair.connect(investor2).borrow(investor2.address, borrowAmount2)).to.be.revertedWith("User not safe");

        // We should be right at LTV here (including fee)
        borrowAmount1 = borrowAmount1.mul(100).div(101).sub(2);
        borrowAmount2 = borrowAmount2.mul(100).div(101).sub(2);
        var borrowAmount1Fee = borrowAmount1.div(100);
        var borrowAmount2Fee = borrowAmount2.div(100);

        const btx1 = await lendingPair.connect(investor1).borrow(investor1.address, borrowAmount1);
        const brc1 = await btx1.wait();
        const be1 = brc1.events![brc1.events!.length-1];

        await borrowChecks(
            be1,
            null,
            investor1,
            investor2,
            lendingPair,
            [
                "AssetBorrowed", // Event name
                investor1.address, // Loan owner
                borrowAmount1.add(borrowAmount1Fee), // Total Borrowed
                investor1.address, // Loan receiver
                borrowAmount1, // Stablecoin got from loan (i1)
                0,  // Stablecoin got from loan (i2)
                borrowAmount1.add(borrowAmount1Fee), // Total Borrowed
                borrowAmount1.add(borrowAmount1Fee), // User borrowed (i1)
                0, // User borrowed (i2)
                totalAdded.sub(borrowAmount1).sub(borrowAmount1Fee) // Left available to borrow
            ]
        );
        
        const btx2 = await lendingPair.connect(investor2).borrow(investor2.address, borrowAmount2);
        const brc2 = await btx2.wait();
        const be2 = brc2.events![brc2.events!.length-1];
        
        await borrowChecks(
            be2,
            null,
            investor1,
            investor2,
            lendingPair,
            [
                "AssetBorrowed", // Event name
                investor2.address, // Loan owner
                borrowAmount2.add(borrowAmount2Fee), // Total Borrowed
                investor2.address, // Loan receiver
                borrowAmount1, // Stablecoin got from loan (i1)
                borrowAmount2,  // Stablecoin got from loan (i2)
                borrowAmount1.add(borrowAmount1Fee).add(borrowAmount2).add(borrowAmount2Fee), // Total Borrowed
                borrowAmount1.add(borrowAmount1Fee), // User borrowed (i1)
                borrowAmount2.add(borrowAmount2Fee), // User borrowed (i2)
                totalAdded.sub(borrowAmount1).sub(borrowAmount1Fee).sub(borrowAmount2).sub(borrowAmount2Fee) // Left available to borrow
            ]
        );

        await expect(lendingPair.connect(investor1).borrow(investor1.address, DUST)).to.be.revertedWith("User not safe");
        await expect(lendingPair.connect(investor2).borrow(investor2.address, DUST)).to.be.revertedWith("User not safe");

        await expect(lendingPair.connect(investor1).withdraw(DUST, investor1.address)).to.be.revertedWith("User not safe");
        await expect(lendingPair.connect(investor2).withdraw(DUST, investor1.address)).to.be.revertedWith("User not safe");
    });
    it("Repay", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            stablecoin,
            yieldVault,
            deployer
        } = await snapshot();

        const repayChecks = async (
            e: any,
            i1: SignerWithAddress,
            i2: SignerWithAddress,
            lp: LendingPair,
            sb: TheStableMoney,
            vc: Array<any>
        ) => {
            var i = 0;
            if (e != null) {
                expect(e.event).to.eq(vc[i++]);
                expect(e.args!.owner).to.eq(vc[i++]);
                expect(e.args!.repayAmount).to.eq(vc[i++]);
                expect(e.args!.receiver).to.eq(vc[i++]);
            }

            if (vc[i++]) {
                await lp.connect(i1).withdraw(DUST, i1.address);
            } else {
                await expect(lp.connect(i1).withdraw(DUST, i1.address)).to.be.revertedWith("User not safe");
            }

            if (vc[i++]) {
                await lp.connect(i2).withdraw(DUST, i2.address);
            } else {
                await expect(lp.connect(i2).withdraw(DUST, i2.address)).to.be.revertedWith("User not safe");
            }

            const ub1 = await lp.getUserBorrow(i1.address);
            const ub2 = await lp.getUserBorrow(i2.address);
            expect(ub1).to.eq(vc[i++]);
            expect(ub2).to.eq(vc[i++]);

            const tb = await lp.getTotalBorrowed();
            expect(tb).to.eq(vc[i++]);
            const atb = await lp.availableToBorrow();
            expect(atb).to.eq(vc[i++]);

            const sbb1 = await sb.balanceOf(i1.address);
            const sbb2 = await sb.balanceOf(i2.address);
            expect(sbb1).to.eq(vc[i++]);
            expect(sbb2).to.eq(vc[i++])
        }

        const totalAdded = ethers.utils.parseEther('100000');

        await addStablecoinToLending(
            stablecoin,
            yieldVault,
            lendingPair,
            totalAdded,
            deployer
        );

        // Cannot repay an empty loan
        await stablecoin.mint(investor1.address, ethers.utils.parseEther('1'));
        await stablecoin.connect(investor1).approve(lendingPair.address, ethers.utils.parseEther('1'));
        await expect(lendingPair.connect(investor1).repay(investor1.address, ethers.utils.parseEther('0.5'))).to.be.revertedWith(
            "reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
        );
        await stablecoin.connect(investor1).burn(ethers.utils.parseEther('1'));

        const collateralAmount1 = ethers.utils.parseEther('50');
        const collateralAmount2 = ethers.utils.parseEther('100');
        var borrowAmount1 = collateralAmount1.mul(2).mul(9200).div(10000);
        var borrowAmount2 = collateralAmount2.mul(2).mul(9200).div(10000);
        await deposit(investor1, lendingPair, collateral, collateralAmount1);
        await deposit(investor2, lendingPair, collateral, collateralAmount2);
        // We should be right at LTV here (including fee)
        borrowAmount1 = borrowAmount1.mul(100).div(101).sub(2);
        borrowAmount2 = borrowAmount2.mul(100).div(101).sub(2);
        var borrowAmount1Fee = borrowAmount1.div(100);
        var borrowAmount2Fee = borrowAmount2.div(100);
        await lendingPair.connect(investor1).borrow(investor1.address, borrowAmount1);
        await lendingPair.connect(investor2).borrow(investor2.address, borrowAmount2);

        // Have for exit fees
        const tmpAmount = ethers.utils.parseEther('1000');
        await stablecoin.mint(investor1.address, tmpAmount);
        await stablecoin.mint(investor2.address, tmpAmount);
        await stablecoin.connect(investor1).approve(lendingPair.address, tmpAmount);
        await stablecoin.connect(investor2).approve(lendingPair.address, tmpAmount);

        // Repay all inv1
        const rptx1 = await lendingPair.connect(investor1).repay(investor1.address, borrowAmount1.add(borrowAmount1Fee));
        const rprc1 = await rptx1.wait();
        const e1 = rprc1.events![rprc1.events!.length-1];
        var repayFee1 = borrowAmount1.add(borrowAmount1Fee).div(100);

        await repayChecks(
            e1,
            investor1,
            investor2,
            lendingPair,
            stablecoin,
            [
                "LoanRepaid", // Event name
                investor1.address, // Loan repayer
                borrowAmount1.add(borrowAmount1Fee), // Amount repaid (without fee)
                investor1.address, // Repay receiver
                true, // Can inv1 withdraw DUST?
                false, // Can inv2 withdraw DUST?
                0, // User borrow 1
                borrowAmount2.add(borrowAmount2Fee), // User borrow 2
                borrowAmount2.add(borrowAmount2Fee), // Total borrowed
                totalAdded.sub(borrowAmount2.add(borrowAmount2Fee)), // Left to borrow
                tmpAmount.sub(repayFee1).sub(borrowAmount1Fee), // Stablecoin balance inv1
                tmpAmount.add(borrowAmount2) // Stablecoin balance inv2
            ]
        );

        await collateral.connect(investor1).approve(lendingPair.address, tmpAmount);
        await collateral.mint(investor1.address, tmpAmount);
        await lendingPair.connect(investor1).deposit(tmpAmount);
        await lendingPair.connect(investor1).borrow(investor1.address, borrowAmount2);

        // Repay all inv2 for inv1
        const rptx2 = await lendingPair.connect(investor2).repay(investor1.address, borrowAmount2.add(borrowAmount2Fee));
        const rprc2 = await rptx2.wait();
        const e2 = rprc2.events![rprc2.events!.length-1];
        var repayFee2 = borrowAmount2.add(borrowAmount2Fee).div(100);

        await repayChecks(
            e2,
            investor1,
            investor2,
            lendingPair,
            stablecoin,
            [
                "LoanRepaid", // Event name
                investor2.address, // Loan repayer
                borrowAmount2.add(borrowAmount2Fee), // Amount repaid (without fee)
                investor1.address, // Repay receiver
                true, // Can inv1 withdraw DUST?
                false, // Can inv2 withdraw DUST?
                0, // User borrow 1
                borrowAmount2.add(borrowAmount2Fee), // User borrow 2
                borrowAmount2.add(borrowAmount2Fee), // Total borrowed
                totalAdded.sub(borrowAmount2.add(borrowAmount2Fee)), // Left to borrow
                tmpAmount.sub(repayFee1).sub(borrowAmount1Fee).add(borrowAmount2), // Stablecoin balance inv1
                tmpAmount.sub(borrowAmount2Fee).sub(repayFee2) // Stablecoin balance inv2
            ]
        );

        // inv2 repays his own loan
        await stablecoin.mint(investor2.address, tmpAmount);
        await stablecoin.connect(investor2).approve(lendingPair.address, tmpAmount);
        
        const rptx3 = await lendingPair.connect(investor2).repay(investor2.address, borrowAmount2.add(borrowAmount2Fee));
        const rprc3 = await rptx3.wait();
        const e3 = rprc3.events![rprc3.events!.length-1];
        var repayFee3 = borrowAmount2.add(borrowAmount2Fee).div(100);

        await repayChecks(
            e3,
            investor1,
            investor2,
            lendingPair,
            stablecoin,
            [
                "LoanRepaid", // Event name
                investor2.address, // Loan repayer
                borrowAmount2.add(borrowAmount2Fee), // Amount repaid (without fee)
                investor2.address, // Repay receiver
                true, // Can inv1 withdraw DUST?
                true, // Can inv2 withdraw DUST?
                0, // User borrow 1
                0, // User borrow 2
                0, // Total borrowed
                totalAdded, // Left to borrow
                tmpAmount.sub(repayFee1).sub(borrowAmount1Fee).add(borrowAmount2), // Stablecoin balance inv1
                tmpAmount.mul(2).sub(borrowAmount2Fee.mul(2)).sub(repayFee2).sub(borrowAmount2).sub(repayFee3) // Stablecoin balance inv2
            ]
        );
    });
    it("Deposit and Borrow", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            yieldVault,
            deployer,
            stablecoin
        } = await snapshot();

        const depositAndBorrowChecks = async (
            e1: any,
            e2: any,
            i1: SignerWithAddress,
            i2: SignerWithAddress,
            lp: LendingPair,
            cl: TheStableMoney,
            st: TheStableMoney,
            vc: Array<any>
        ) => {
            var i = 0;
            expect(e1.event).to.eq(vc[i++]);
            expect(e1.args!.owner).to.eq(vc[i++]);
            expect(e1.args!.amount).to.eq(vc[i++]);
            expect(e1.args!.shares).to.eq(vc[i++]);

            expect(e2.event).to.eq(vc[i++]);
            expect(e2.args!.owner).to.eq(vc[i++]);
            expect(e2.args!.borrowAmount).to.eq(vc[i++]);
            expect(e2.args!.receiver).to.eq(vc[i++]);
    
            const i1cbal = await lp.getCollateralBalance(i1.address);
            expect(i1cbal).to.eq(vc[i++]);
            const i2cbal = await lp.getCollateralBalance(i2.address);
            expect(i2cbal).to.eq(vc[i++]);

            const i1tcbal = await cl.balanceOf(i1.address);
            expect(i1tcbal).to.eq(vc[i++]);
            const i2tcbal = await cl.balanceOf(i2.address);
            expect(i2tcbal).to.eq(vc[i++]);

            const i1borr = await lp.getUserBorrow(i1.address);
            expect(i1borr).to.eq(vc[i++]);
            const i2borr = await lp.getUserBorrow(i2.address);
            expect(i2borr).to.eq(vc[i++]);

            const i1sbal = await st.balanceOf(i1.address);
            expect(i1sbal).to.eq(vc[i++]);
            const i2sbal = await st.balanceOf(i2.address);
            expect(i2sbal).to.eq(vc[i++]);

            const totalCol = await lp.getTotalCollateralDeposited();
            expect(totalCol).to.eq(vc[i++]);
            const totalBorr = await lp.getTotalBorrowed();
            expect(totalBorr).to.eq(vc[i++]);
            const leftToBorr = await lp.availableToBorrow();
            expect(leftToBorr).to.eq(vc[i++]);
        };

        const totalAdded = ethers.utils.parseEther('100000');

        await addStablecoinToLending(
            stablecoin,
            yieldVault,
            lendingPair,
            totalAdded,
            deployer
        );
        
        const collateralAmount1 = ethers.utils.parseEther('50');
        const collateralAmount2 = ethers.utils.parseEther('100');
        var borrowAmount1 = collateralAmount1.mul(2).mul(9200).div(10000);
        var borrowAmount2 = collateralAmount2.mul(2).mul(9200).div(10000);
        // We should be right at LTV here (including fee)
        borrowAmount1 = borrowAmount1.mul(100).div(101).sub(2);
        borrowAmount2 = borrowAmount2.mul(100).div(101).sub(2);
        var borrowAmount1Fee = borrowAmount1.div(100);
        var borrowAmount2Fee = borrowAmount2.div(100);

        await collateral.mint(investor1.address, 1000);
        await collateral.connect(investor1).approve(lendingPair.address, 1000);
        await expect(lendingPair.connect(investor1).depositAndBorrow(10, 20, investor1.address)).to.be.revertedWith("User not safe");
        await collateral.connect(investor1).burn(1000);


        // Deposit and borrow inv1 for inv1
        const rc1 = await depositAndBorrow(
            investor1,
            lendingPair,
            collateral,
            collateralAmount1,
            borrowAmount1,
            investor1
        );
        const depositEvent = rc1.events![6];
        const borrowEvent = rc1.events![9];
        await depositAndBorrowChecks(
            depositEvent,
            borrowEvent,
            investor1,
            investor2,
            lendingPair,
            collateral,
            stablecoin,
            [
                "CollateralAdded", // deposit event name
                investor1.address, // deposit event owner
                collateralAmount1, // deposit event amount
                collateralAmount1, // deposit event shares
                "AssetBorrowed", // borrow event name
                investor1.address, // borrow event owner
                borrowAmount1.add(borrowAmount1Fee), // borrow event borrowAmount
                investor1.address, // borrow event receiver
                collateralAmount1, // Collateral contract balance of inv1
                0, // Collateral contract balance of inv2
                0, // Actual collateral balance of inv1
                0, // Actual collateral balance of inv2
                borrowAmount1.add(borrowAmount1Fee), // Borrow amount inv1
                0, // Borrow amount inv2
                borrowAmount1, // stablecoin balance inv1
                0, // Stablecoin balance inv2
                collateralAmount1, // Total collateral deposited
                borrowAmount1.add(borrowAmount1Fee), // Total borrowed
                totalAdded.sub(borrowAmount1).sub(borrowAmount1Fee) // Left to borrow
            ]
        );

        // Deposit and borrow inv2 for inv2
        const rc2 = await depositAndBorrow(
            investor2,
            lendingPair,
            collateral,
            collateralAmount2,
            borrowAmount2,
            investor2
        );
        const depositEvent2 = rc2.events![6];
        const borrowEvent2 = rc2.events![9];
        await depositAndBorrowChecks(
            depositEvent2,
            borrowEvent2,
            investor1,
            investor2,
            lendingPair,
            collateral,
            stablecoin,
            [
                "CollateralAdded", // deposit event name
                investor2.address, // deposit event owner
                collateralAmount2, // deposit event amount
                collateralAmount2, // deposit event shares
                "AssetBorrowed", // borrow event name
                investor2.address, // borrow event owner
                borrowAmount2.add(borrowAmount2Fee), // borrow event borrowAmount
                investor2.address, // borrow event receiver
                collateralAmount1, // Collateral contract balance of inv1
                collateralAmount2, // Collateral contract balance of inv2
                0, // Actual collateral balance of inv1
                0, // Actual collateral balance of inv2
                borrowAmount1.add(borrowAmount1Fee), // Borrow amount inv1
                borrowAmount2.add(borrowAmount2Fee), // Borrow amount inv2
                borrowAmount1, // stablecoin balance inv1
                borrowAmount2, // Stablecoin balance inv2
                collateralAmount1.add(collateralAmount2), // Total collateral deposited
                borrowAmount1.add(borrowAmount1Fee).add(borrowAmount2).add(borrowAmount2Fee), // Total borrowed
                totalAdded.sub(borrowAmount1).sub(borrowAmount1Fee).sub(borrowAmount2).sub(borrowAmount2Fee) // Left to borrow
            ]
        );

        // Deposit and borrow inv2 for inv1
        const rc3 = await depositAndBorrow(
            investor2,
            lendingPair,
            collateral,
            collateralAmount2,
            borrowAmount2,
            investor1
        );
        const depositEvent3 = rc3.events![6];
        const borrowEvent3 = rc3.events![9];
        await depositAndBorrowChecks(
            depositEvent3,
            borrowEvent3,
            investor1,
            investor2,
            lendingPair,
            collateral,
            stablecoin,
            [
                "CollateralAdded", // deposit event name
                investor2.address, // deposit event owner
                collateralAmount2, // deposit event amount
                collateralAmount2, // deposit event shares
                "AssetBorrowed", // borrow event name
                investor2.address, // borrow event owner
                borrowAmount2.add(borrowAmount2Fee), // borrow event borrowAmount
                investor1.address, // borrow event receiver
                collateralAmount1, // Collateral contract balance of inv1
                collateralAmount2.mul(2), // Collateral contract balance of inv2
                0, // Actual collateral balance of inv1
                0, // Actual collateral balance of inv2
                borrowAmount1.add(borrowAmount1Fee), // Borrow amount inv1
                borrowAmount2.add(borrowAmount2Fee).mul(2), // Borrow amount inv2
                borrowAmount1.add(borrowAmount2), // stablecoin balance inv1
                borrowAmount2, // Stablecoin balance inv2
                collateralAmount1.add(collateralAmount2.mul(2)), // Total collateral deposited
                borrowAmount1.add(borrowAmount1Fee).add((borrowAmount2).add(borrowAmount2Fee).mul(2)), // Total borrowed
                totalAdded.sub(borrowAmount1).sub(borrowAmount1Fee).sub((borrowAmount2).add(borrowAmount2Fee).mul(2)) // Left to borrow
            ]
        );
    });
    it("Repay and Withdraw", async () => {
        const {
            lendingPair,
            investor1,
            investor2,
            collateral,
            stablecoin,
            yieldVault,
            deployer
        } = await snapshot();

        const repayAndWithdrawChecks = async (
            e1: any,
            e2: any,
            i1: SignerWithAddress,
            i2: SignerWithAddress,
            cl: TheStableMoney,
            st: TheStableMoney,
            lp: LendingPair,
            yv: LickHitter,
            vc: Array<any>
        ) => {
            var i = 0;
            expect(e1.event).to.eq(vc[i++]);
            expect(e1.args!.owner).to.eq(vc[i++]);
            expect(e1.args!.repayAmount).to.eq(vc[i++]);
            expect(e1.args!.receiver).to.eq(vc[i++]);

            expect(e2.event).to.eq(vc[i++]);
            expect(e2.args!.owner).to.eq(vc[i++]);
            expect(e2.args!.amount).to.eq(vc[i++]);
            expect(e2.args!.shares).to.eq(vc[i++]);

            const i1cbal = await lp.getCollateralBalance(i1.address);
            expect(i1cbal).to.eq(vc[i++]);
            const i2cbal = await lp.getCollateralBalance(i2.address);
            expect(i2cbal).to.eq(vc[i++]);

            const i1tcbal = await cl.balanceOf(i1.address);
            expect(i1tcbal).to.eq(vc[i++]);
            const i2tcbal = await cl.balanceOf(i2.address);
            expect(i2tcbal).to.eq(vc[i++]);

            const i1borr = await lp.getUserBorrow(i1.address);
            expect(i1borr).to.eq(vc[i++]);
            const i2borr = await lp.getUserBorrow(i2.address);
            expect(i2borr).to.eq(vc[i++]);

            const i1sbal = await st.balanceOf(i1.address);
            expect(i1sbal).to.eq(vc[i++]);
            const i2sbal = await st.balanceOf(i2.address);
            expect(i2sbal).to.eq(vc[i++]);

            const totalCol = await lp.getTotalCollateralDeposited();
            expect(totalCol).to.eq(vc[i++]);
            const totalBorr = await lp.getTotalBorrowed();
            expect(totalBorr).to.eq(vc[i++]);
            const leftToBorr = await lp.availableToBorrow();
            expect(leftToBorr).to.eq(vc[i++]);
            const moneyz = await yv.balanceOf(st.address, lp.address);
            expect(moneyz).to.eq(vc[i++]);
        };

        const totalAdded = ethers.utils.parseEther('100000');

        await addStablecoinToLending(
            stablecoin,
            yieldVault,
            lendingPair,
            totalAdded,
            deployer
        );
        
        const collateralAmount1 = ethers.utils.parseEther('50');
        const collateralAmount2 = ethers.utils.parseEther('100');
        var borrowAmount1 = collateralAmount1.mul(2).mul(9200).div(10000);
        var borrowAmount2 = collateralAmount2.mul(2).mul(9200).div(10000);
        // We should be right at LTV here (including fee)
        borrowAmount1 = borrowAmount1.mul(100).div(101).sub(2);
        borrowAmount2 = borrowAmount2.mul(100).div(101).sub(2);
        var borrowAmount1Fee = borrowAmount1.div(100);
        var borrowAmount2Fee = borrowAmount2.div(100);
        var repayFee1 = borrowAmount1.add(borrowAmount1Fee).div(100);
        var repayFee2 = borrowAmount2.add(borrowAmount2Fee).div(100);

        await depositAndBorrow(
            investor1,
            lendingPair,
            collateral,
            collateralAmount1,
            borrowAmount1,
            investor1
        );
        await depositAndBorrow(
            investor2,
            lendingPair,
            collateral,
            collateralAmount2,
            borrowAmount2,
            investor2
        );

        // Have for exit fees
        const tmpAmount = ethers.utils.parseEther('1000');
        await stablecoin.mint(investor1.address, tmpAmount);
        await stablecoin.mint(investor2.address, tmpAmount);
        await stablecoin.connect(investor1).approve(lendingPair.address, tmpAmount);
        await stablecoin.connect(investor2).approve(lendingPair.address, tmpAmount);

        // Repay inv1 for inv1
        const rc1 = await repayAndWithdraw(
            investor1,
            lendingPair,
            borrowAmount1.add(borrowAmount1Fee),
            investor1,
            collateralAmount1,
            investor1
        );
        const repayEvent1 = rc1.events![6];
        const withdrawEvent1 = rc1.events![9];
        await repayAndWithdrawChecks(
            repayEvent1,
            withdrawEvent1,
            investor1,
            investor2,
            collateral,
            stablecoin,
            lendingPair,
            yieldVault,
            [
                "LoanRepaid", // Repay event name
                investor1.address, // Repay event owner
                borrowAmount1.add(borrowAmount1Fee), // Repay event amount
                investor1.address, // Repay event receiver
                "CollateralRemoved", // Remove collateral event name
                investor1.address, // Remove collateral event owner
                collateralAmount1, // Remove collateral event amount
                collateralAmount1, // Remove collateral event shares
                0, // Collateral contract balance of inv1
                collateralAmount2, // Collateral contract balance of inv2
                collateralAmount1, // Actual collateral balance of inv1
                0, // Actual collateral balance of inv2
                0, // Borrow amount inv1
                borrowAmount2.add(borrowAmount2Fee), // Borrow amount inv2
                tmpAmount.sub(repayFee1).sub(borrowAmount1Fee), // stablecoin balance inv1
                tmpAmount.add(borrowAmount2), // Stablecoin balance inv2
                collateralAmount2, // Total collateral deposited
                borrowAmount2.add(borrowAmount2Fee), // Total borrowed
                totalAdded.sub(borrowAmount2).sub(borrowAmount2Fee), // Left to borrow
                totalAdded.add(borrowAmount1Fee).add(repayFee1).sub(borrowAmount2) // Stablecoins in YV
            ]
        );

        // Repay inv2 for inv2
        const rc2 = await repayAndWithdraw(
            investor2,
            lendingPair,
            borrowAmount2.add(borrowAmount2Fee),
            investor2,
            collateralAmount2,
            investor2
        );
        const repayEvent2 = rc2.events![6];
        const withdrawEvent2 = rc2.events![9];
        await repayAndWithdrawChecks(
            repayEvent2,
            withdrawEvent2,
            investor1,
            investor2,
            collateral,
            stablecoin,
            lendingPair,
            yieldVault,
            [
                "LoanRepaid", // Repay event name
                investor2.address, // Repay event owner
                borrowAmount2.add(borrowAmount2Fee), // Repay event amount
                investor2.address, // Repay event receiver
                "CollateralRemoved", // Remove collateral event name
                investor2.address, // Remove collateral event owner
                collateralAmount2, // Remove collateral event amount
                collateralAmount2, // Remove collateral event shares
                0, // Collateral contract balance of inv1
                0, // Collateral contract balance of inv2
                collateralAmount1, // Actual collateral balance of inv1
                collateralAmount2, // Actual collateral balance of inv2
                0, // Borrow amount inv1
                0, // Borrow amount inv2
                tmpAmount.sub(repayFee1).sub(borrowAmount1Fee), // stablecoin balance inv1
                tmpAmount.sub(repayFee2).sub(borrowAmount2Fee), // Stablecoin balance inv2
                0, // Total collateral deposited
                0, // Total borrowed
                totalAdded, // Left to borrow
                totalAdded.add(borrowAmount1Fee).add(repayFee1).add(borrowAmount2Fee).add(repayFee2) // Stablecoins in YV
            ]
        );

        // Loan again inv2, shouldn't be able to repay for inv1 and withdraw
        await depositAndBorrow(
            investor2,
            lendingPair,
            collateral,
            collateralAmount2,
            borrowAmount2,
            investor2
        );
        await depositAndBorrow(
            investor1,
            lendingPair,
            collateral,
            collateralAmount1,
            borrowAmount1,
            investor1
        );
        await expect(
            lendingPair.connect(investor2).repayAndWithdraw(
                borrowAmount1,
                investor1.address,
                collateralAmount2,
                investor1.address
            )
        ).to.be.revertedWith("User not safe");
    });
    it.skip("Liquidate");
    it.skip("Fees");
    it.skip("Collateral increasing in value: oracle price + yield profit");
});
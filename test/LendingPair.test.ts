import { expect } from "chai";
import { ethers } from "hardhat";

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
    it.skip("burn stablecoin");
});
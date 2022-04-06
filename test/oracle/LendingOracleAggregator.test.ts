import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

const YearnSharePriceInterface = new ethers.utils.Interface([
    "function pricePerShare() external view returns (uint256)"
]);

const CurveVirtualPriceInterface = new ethers.utils.Interface([
    "function get_virtual_price() external view returns (uint256)"
]);

const snapshot = async () => {
    const [deployer, otherAddress1] = await ethers.getSigners();

    const oracleFactory = await ethers.getContractFactory("LendingOracleAggregator");

    const oracleFeeds = [
        {
            token: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
            feedType: 0,
            feed: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
            decimals: 8,
            metadata: "0x00"
        }, {
            token: "0x4e15361fd6b4bb609fa63c81a2be19d873717870", // FTM
            feedType: 1,
            feed: "0x2DE7E4a9488488e0058B95854CC2f7955B35dC9b",
            decimals: 18,
            metadata: "0x00"
        }, {
            token: "0xB8c77482e45F1F44dE1745F52C74426C631bDD52", // BNB
            feedType: 1,
            feed: "0xc546d2d06144F9DD42815b8bA46Ee7B8FcAFa4a2",
            decimals: 18,
            metadata: "0x00"
        }, {
            token: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
            feedType: 0,
            feed: "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c",
            decimals: 8,
            metadata: "0x00"
        }, {
            token: "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
            feedType: 0,
            feed: "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9",
            decimals: 8,
            metadata: "0x00"
        }
    ];
    const chainlinkETHFeed = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

    const tokens = oracleFeeds.map(x => x.token);
    const feedTypes = oracleFeeds.map(x => x.feedType);
    const feeds = oracleFeeds.map(x => x.feed);
    const decimals = oracleFeeds.map(x => x.decimals);
    const metadata = oracleFeeds.map(x => x.metadata);

    const oracle = await oracleFactory.deploy(
        tokens,
        feedTypes,
        feeds,
        decimals,
        metadata,
        chainlinkETHFeed,
    );

    return {
        oracle,
        deployer,
        otherAddress1,
        oracleFeeds
    }
}

describe('LendingOracleAggregator', () => {
    it("Initial State", async () => {
        const {
            oracle,
            deployer,
            oracleFeeds
        } = await snapshot();

        const feedChecks = async (
            o: any,
            of: any
        ) => {
            const r = await o.getFeed(of.token);
            expect(r[0]).to.eq(of.feed);
            expect(r[1]).to.eq(of.feedType);
            expect(r[2]).to.eq(of.decimals);
        }

        const getOwner = await oracle.getOwner();
        expect(getOwner).to.eq(deployer.address);
        const getPendingOwner = await oracle.getPendingOwner();
        expect(getPendingOwner).to.eq(ethers.constants.AddressZero);

        for(var i = 0; i < oracleFeeds.length; i++) {
            await feedChecks(oracle, oracleFeeds[i]);
        }
    });
    it("Access Control", async () => {
        const {
            oracle,
            otherAddress1
        } = await snapshot();

        await expect(oracle.connect(otherAddress1).transferOwnership(ethers.constants.AddressZero)).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(oracle.claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );
        await expect(oracle.connect(otherAddress1).editFeed(ethers.constants.AddressZero, ethers.constants.AddressZero, 0, 0, "0x00")).to.be.revertedWith(
            "Unauthorized"
        );
    });
    it("Transfer Ownership", async () => {
        const {
            oracle,
            deployer,
            otherAddress1
        } = await snapshot();

        await expect(oracle.connect(otherAddress1).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await oracle.connect(deployer).transferOwnership(otherAddress1.address);

        const getPendingOwnerCall = await oracle.getPendingOwner();
        expect(getPendingOwnerCall).to.equal(otherAddress1.address);

        await expect(oracle.connect(deployer).claimOwnership()).to.be.revertedWith(
            "Unauthorized"
        );

        await oracle.connect(otherAddress1).claimOwnership();

        const getPendingOwnerCall2 = await oracle.getPendingOwner();
        const getOwnerCall = await oracle.getOwner();
        expect(getPendingOwnerCall2).to.equal(ethers.constants.AddressZero);
        expect(getOwnerCall).to.equal(otherAddress1.address);

        await expect(oracle.connect(deployer).transferOwnership(otherAddress1.address)).to.be.revertedWith(
            "Unauthorized"
        );

        await oracle.connect(otherAddress1).transferOwnership(deployer.address);
    });
    it("Modify Feed", async () => {
        const {
            oracle
        } = await snapshot();

        const newFeed = {
            token: "0xc00e94Cb662C3520282E6f5717214004A7f26888", // COMP
            feed: "0xdbd020CAeF83eFd542f4De03e3cF0C28A4428bd5",
            feedType: 0,
            decimals: 8
        }

        // Add new feed
        const getFeedBefore = await oracle.getFeed(newFeed.token);
        expect(getFeedBefore[0]).to.eq(ethers.constants.AddressZero);
        expect(getFeedBefore[1]).to.eq(0);
        expect(getFeedBefore[2]).to.eq(0);

        const tx1 = await oracle.editFeed(
            newFeed.token,
            newFeed.feed,
            newFeed.feedType,
            newFeed.decimals,
            "0x00"
        );
        const rc1 = await tx1.wait();
        const e1 = rc1.events![0];
        expect(e1.event).to.eq("FeedModified");
        expect(e1.args!.token).to.eq(newFeed.token);
        expect(e1.args!.feed).to.eq(newFeed.feed);
        expect(e1.args!.feedType).to.eq(newFeed.feedType);
        expect(e1.args!.decimals).to.eq(newFeed.decimals);

        const getFeedAfter = await oracle.getFeed(newFeed.token);
        expect(getFeedAfter[0]).to.eq(newFeed.feed);
        expect(getFeedAfter[1]).to.eq(newFeed.feedType);
        expect(getFeedAfter[2]).to.eq(newFeed.decimals);

        // Modify existing feed
        const existingFeed = {
            token: "0x4e15361fd6b4bb609fa63c81a2be19d873717870", // FTM
            feedType: 1,
            feed: "0x2DE7E4a9488488e0058B95854CC2f7955B35dC9b",
            decimals: 18
        }
        const modifyTo = {
            token: "0x4E15361FD6b4BB609Fa63C81A2be19d873717870", // FTM
            feedType: 0,
            feed: "0x4E15361FD6b4BB609Fa63C81A2be19d873717870",
            decimals: 8
        }

        const getEFeedBefore = await oracle.getFeed(existingFeed.token);
        expect(getEFeedBefore[0]).to.eq(existingFeed.feed);
        expect(getEFeedBefore[1]).to.eq(existingFeed.feedType);
        expect(getEFeedBefore[2]).to.eq(existingFeed.decimals);

        const tx2 = await oracle.editFeed(
            modifyTo.token,
            modifyTo.feed,
            modifyTo.feedType,
            modifyTo.decimals,
            "0x00"
        );
        const rc2 = await tx2.wait();
        const e2 = rc2.events![0];
        expect(e2.event).to.eq("FeedModified");
        expect(e2.args!.token).to.eq(modifyTo.token);
        expect(e2.args!.feed).to.eq(modifyTo.feed);
        expect(e2.args!.feedType).to.eq(modifyTo.feedType);
        expect(e2.args!.decimals).to.eq(modifyTo.decimals);

        const getEFeedAfter = await oracle.getFeed(existingFeed.token);
        expect(getEFeedAfter[0]).to.eq(modifyTo.feed);
        expect(getEFeedAfter[1]).to.eq(modifyTo.feedType);
        expect(getEFeedAfter[2]).to.eq(modifyTo.decimals);
    });
    it("Safe call on invalid feed", async () => {
        const {
            oracle,
            oracleFeeds
        } = await snapshot();
        await expect(oracle.getUSDPrice(ethers.constants.AddressZero)).to.be.revertedWith("Invalid Feed");
    });
    it("FeedType: ChainlinkDirect", async () => {
        const {
            oracle,
            oracleFeeds
        } = await snapshot();

        // Oracle price 29th of March, 2022, 9 PM UTC
        const wethOraclePrice = await oracle.getUSDPrice(oracleFeeds[0].token);
        const wbtcOraclePrice = await oracle.getUSDPrice(oracleFeeds[3].token);
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const approxWbtcPrice = ethers.utils.parseEther("43849.43");

        // Max 1% difference
        expect(wethOraclePrice).to.be.closeTo(approxWethPrice, wethOraclePrice.div(100));
        expect(wbtcOraclePrice).to.be.closeTo(approxWbtcPrice, wbtcOraclePrice.div(100));
    });
    it("FeedType: ChainlinkETH", async () => {
        const {
            oracle,
            oracleFeeds
        } = await snapshot();

        // Oracle price 29th of March, 2022, 9 PM UTC
        const ftmOraclePrice = await oracle.getUSDPrice(oracleFeeds[1].token);
        const bnbOraclePrice = await oracle.getUSDPrice(oracleFeeds[2].token);
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxFtmPrice = ethers.utils.parseEther("1.85");
        const approxBnbPrice = ethers.utils.parseEther("408.09");

        // Max 1% difference
        expect(ftmOraclePrice).to.be.closeTo(approxFtmPrice, ftmOraclePrice.div(100));
        expect(bnbOraclePrice).to.be.closeTo(approxBnbPrice, bnbOraclePrice.div(100));
    });
    it("ChainlinkYearnUnderlying: yvWETH V2", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const yvWETHV2 = "0xa258C4606Ca8206D8aA700cE2143D7db854D168c";
        const chainlinkETHOracle = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";
        const feedDecimals = 8;

        await oracle.editFeed(
            yvWETHV2,
            chainlinkETHOracle,
            2,
            feedDecimals,
            "0x00"
        );

        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("2956.98");
        const yVault = new ethers.Contract(
            yvWETHV2,
            YearnSharePriceInterface,
            deployer
        );
        const sharePrice = await yVault.pricePerShare();
        const approxTokenPrice = approxWethPrice.mul(sharePrice).div(ethers.utils.parseEther('1'));

        const oraclePrice = await oracle.getUSDPrice(yvWETHV2);

        expect(oraclePrice).to.be.closeTo(approxTokenPrice, oraclePrice.div(100));
    });
    it("ChainlinkYearnUnderlying: yvUSDT V2", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const yvUSDT = "0x7Da96a3891Add058AdA2E826306D812C638D87a7";
        const chainlinkUSDTOracle = "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D";
        const feedDecimals = 8;

        await oracle.editFeed(
            yvUSDT,
            chainlinkUSDTOracle,
            2,
            feedDecimals,
            "0x00"
        );

        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxUsdtPrice = ethers.utils.parseEther("1");
        const yVault = new ethers.Contract(
            yvUSDT,
            YearnSharePriceInterface,
            deployer
        );
        const sharePrice = await yVault.pricePerShare();
        const approxTokenPrice = approxUsdtPrice.mul(sharePrice).div(BigNumber.from(10**6));

        const oraclePrice = await oracle.getUSDPrice(yvUSDT);

        expect(oraclePrice).to.be.closeTo(approxTokenPrice, oraclePrice.div(100));
    });
    it("ChainlinkYearnUnderlying: yvDAI V2", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const yvDAI = "0xdA816459F1AB5631232FE5e97a05BBBb94970c95";
        const chainlinkDAIOracle = "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9";
        const feedDecimals = 8;

        await oracle.editFeed(
            yvDAI,
            chainlinkDAIOracle,
            2,
            feedDecimals,
            "0x00"
        );

        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const approxWethPrice = ethers.utils.parseEther("1");
        const yVault = new ethers.Contract(
            yvDAI,
            YearnSharePriceInterface,
            deployer
        );
        const sharePrice = await yVault.pricePerShare();
        const approxTokenPrice = approxWethPrice.mul(sharePrice).div(ethers.utils.parseEther('1'));

        const oraclePrice = await oracle.getUSDPrice(yvDAI);

        expect(oraclePrice).to.be.closeTo(approxTokenPrice, oraclePrice.div(100));
    });
    it("CurveLPVirtualPricePeggedAssets: 3Pool", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const token = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"; // 3Pool token
        const pool = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"; // 3Pool pool
        const underlying = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI
        const underlyingPrice = ethers.utils.parseEther('1'); // DAI

        const abiCoder = new ethers.utils.AbiCoder;
        const metadata = abiCoder.encode(
            ["address"],
            [underlying]
        );

        await oracle.editFeed(
            token,
            pool,
            3,
            18,
            metadata
        );

        const oraclePrice = await oracle.getUSDPrice(token);
        const cp = new ethers.Contract(
            pool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await cp.get_virtual_price();
        const actualPrice = underlyingPrice.mul(vp).div(ethers.utils.parseEther('1'));

        expect(oraclePrice).to.be.closeTo(actualPrice, oraclePrice.div(100));
    });
    it("CurveLPVirtualPricePeggedAssets: Wormhole UST", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const token = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269"; // UST Wormhole Pool
        const pool = "0xCEAF7747579696A2F0bb206a14210e3c9e6fB269"; // UST Wormhole Pool
        const underlying = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI
        const underlyingPrice = ethers.utils.parseEther('1'); // DAI

        const abiCoder = new ethers.utils.AbiCoder;
        const metadata = abiCoder.encode(
            ["address"],
            [underlying]
        );

        await oracle.editFeed(
            token,
            pool,
            3,
            18,
            metadata
        );

        const oraclePrice = await oracle.getUSDPrice(token);
        const cp = new ethers.Contract(
            pool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await cp.get_virtual_price();
        const actualPrice = underlyingPrice.mul(vp).div(ethers.utils.parseEther('1'));

        expect(oraclePrice).to.be.closeTo(actualPrice, oraclePrice.div(100));
    });
    it("CurveLPVirtualPricePeggedAssets: stETH", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const token = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"; // UST Wormhole Pool
        const pool = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"; // UST Wormhole Pool
        const underlying = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"; // WETH
        // CoinGecko price 29th of March, 2022, 9 PM UTC
        const underlyingPrice = ethers.utils.parseEther('2956.98'); // WETH

        const abiCoder = new ethers.utils.AbiCoder;
        const metadata = abiCoder.encode(
            ["address"],
            [underlying]
        );

        await oracle.editFeed(
            token,
            pool,
            3,
            18,
            metadata
        );

        const oraclePrice = await oracle.getUSDPrice(token);
        const cp = new ethers.Contract(
            pool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await cp.get_virtual_price();
        const actualPrice = underlyingPrice.mul(vp).div(ethers.utils.parseEther('1'));

        expect(oraclePrice).to.be.closeTo(actualPrice, oraclePrice.div(100));
    });
    it("CurveLPVirtualPricePeggedAssets: FRAX", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const token = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"; // UST Wormhole Pool
        const pool = "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B"; // UST Wormhole Pool
        const underlying = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI
        const underlyingPrice = ethers.utils.parseEther('1'); // DAI

        const abiCoder = new ethers.utils.AbiCoder;
        const metadata = abiCoder.encode(
            ["address"],
            [underlying]
        );

        await oracle.editFeed(
            token,
            pool,
            3,
            18,
            metadata
        );

        const oraclePrice = await oracle.getUSDPrice(token);
        const cp = new ethers.Contract(
            pool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await cp.get_virtual_price();
        const actualPrice = underlyingPrice.mul(vp).div(ethers.utils.parseEther('1'));

        expect(oraclePrice).to.be.closeTo(actualPrice, oraclePrice.div(100));
    });
    it("CurveLPVirtualPricePeggedAssets: IB", async () => {
        const {
            oracle,
            deployer
        } = await snapshot();

        const token = "0x5282a4eF67D9C33135340fB3289cc1711c13638C"; // UST Wormhole Pool
        const pool = "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF"; // UST Wormhole Pool
        const underlying = "0x6b175474e89094c44da98b954eedeac495271d0f"; // DAI
        const underlyingPrice = ethers.utils.parseEther('1'); // DAI

        const abiCoder = new ethers.utils.AbiCoder;
        const metadata = abiCoder.encode(
            ["address"],
            [underlying]
        );

        await oracle.editFeed(
            token,
            pool,
            3,
            18,
            metadata
        );

        const oraclePrice = await oracle.getUSDPrice(token);
        const cp = new ethers.Contract(
            pool,
            CurveVirtualPriceInterface,
            deployer
        );
        const vp = await cp.get_virtual_price();
        const actualPrice = underlyingPrice.mul(vp).div(ethers.utils.parseEther('1'));

        expect(oraclePrice).to.be.closeTo(actualPrice, oraclePrice.div(100));
    });
});
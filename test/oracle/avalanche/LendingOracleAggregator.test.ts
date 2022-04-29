import { ethers } from "hardhat";
import { expect } from "chai";

const snapshot = async () => {
    const [deployer] = await ethers.getSigners();

    const oracleFactory = await ethers.getContractFactory("LendingOracleAggregator");

    const abiCoder = new ethers.utils.AbiCoder;
    const data = abiCoder.encode(["address"], ["0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"]);
    const oracle = await oracleFactory.deploy(
        ["0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"],
        [4, 0],
        ["0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE", "0x0A77230d17318075983913bC2145DB16C7366156"],
        [8, 8],
        [data, []],
        ethers.constants.AddressZero
    );

    return {
        oracle,
        deployer
    }
}

describe('Avalanche: LendingOracleAggregator', () => {
    it("sAVAX Price", async () => {
        const {
            oracle
        } = await snapshot();

        const avaxPrice = 79;
        const sAvaxPrice = 10116337886;
        const expectedPrice = ethers.utils.parseEther('1').mul(avaxPrice).mul(sAvaxPrice).div(10**10);

        const oraclePrice = await oracle.getUSDPrice("0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE");

        expect(expectedPrice).to.be.closeTo(oraclePrice, expectedPrice.div(100));
    });
    it("Benqi Asset: USDC", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
            "0xF096872672F44d6EBA71458D74fe67F9a77a23B9",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",6]
        );
        await oracle.editFeed(
            "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F");
        const benqiExchangeRate = ethers.utils.parseEther('0.02058731523');

        expect(oraclePrice).to.be.closeTo(benqiExchangeRate, oraclePrice.div(100));
    });
    it("Benqi Asset: USDT", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0xc7198437980c041c805a1edcba50c1ce5db95118",
            "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0xc7198437980c041c805a1edcba50c1ce5db95118",6]
        );
        await oracle.editFeed(
            "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C");
        const qiUSDTPrice = ethers.utils.parseEther('0.02077208443');

        expect(oraclePrice).to.be.closeTo(qiUSDTPrice, oraclePrice.div(100));
    });
    it("Benqi Asset: DAI", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",
            "0x51D7180edA2260cc4F6e4EebB82FEF5c3c2B8300",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",18]
        );
        await oracle.editFeed(
            "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D");
        const qiDAIPrice = ethers.utils.parseEther('0.0207828453');

        expect(oraclePrice).to.be.closeTo(qiDAIPrice, oraclePrice.div(100));
    });
    it("Benqi Asset: wBTC", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0x50b7545627a5162F82A992c33b87aDc75187B218",
            "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0x50b7545627a5162F82A992c33b87aDc75187B218",8]
        );
        await oracle.editFeed(
            "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568");
        const qiBTCPrice = ethers.utils.parseEther('835.5737183322');

        expect(oraclePrice).to.be.closeTo(qiBTCPrice, oraclePrice.div(100));
    });
    it("Benqi Asset: wETH", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",
            "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",18]
        );
        await oracle.editFeed(
            "0x334ad834cd4481bb02d09615e7c11a00579a7909",
            "0x334ad834cd4481bb02d09615e7c11a00579a7909",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0x334ad834cd4481bb02d09615e7c11a00579a7909");
        const qiETHPrice = ethers.utils.parseEther('62.3488006422');

        expect(oraclePrice).to.be.closeTo(qiETHPrice, oraclePrice.div(100));
    });
    it("Benqi Asset: AVAX", async () => {
        const {
            oracle
        } = await snapshot();

        const abiCoder = new ethers.utils.AbiCoder;

        await oracle.editFeed(
            "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
            "0x0A77230d17318075983913bC2145DB16C7366156",
            0,
            8,
            []
        );
        
        const metaData = abiCoder.encode(
            ["address","uint256"],
            ["0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",18]
        );
        await oracle.editFeed(
            "0xaf2c034c764d53005cc6cbc092518112cbd652bb",
            "0xaf2c034c764d53005cc6cbc092518112cbd652bb",
            5,
            8,
            metaData
        );

        const oraclePrice = await oracle.getUSDPrice("0xaf2c034c764d53005cc6cbc092518112cbd652bb");
        const qiAVAXPrice = ethers.utils.parseEther('1.6576335296');

        expect(oraclePrice).to.be.closeTo(qiAVAXPrice, oraclePrice.div(20));
    });
});
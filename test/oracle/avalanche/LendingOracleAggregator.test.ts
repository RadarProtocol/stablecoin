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
    })
});
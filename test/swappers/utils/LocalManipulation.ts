import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";

const toBytes32 = (bn: any) => {
    return ethers.utils.hexlify(ethers.utils.zeroPad(bn.toHexString(), 32));
};

const setStorageAt = async (address: any, index: any, value: any, prov: any) => {
    await prov.send("hardhat_setStorageAt", [address, index, value]);
    await prov.send("evm_mine", []); // Just mines to the next block
};

export const manipulateLocalERC20Balance = async (
    deployer: SignerWithAddress,
    erc_address: any,
    erc_balanceof_slot: any,
    user: any,
    manipulated_balance: any,
    isVyper: Boolean
) => {
    // Get storage slot index
    const index = ethers.utils.solidityKeccak256(
        ["uint256", "uint256"],
        [user, erc_balanceof_slot] // key, slot
    );

    const vyperIndex = ethers.utils.solidityKeccak256(
        ["uint256", "uint256"],
        [erc_balanceof_slot, user] // slot, key
    );

    // Manipulate local balance (needs to be bytes32 string)
    const provider = await deployer.provider;
    await setStorageAt(
        erc_address,
        isVyper ? vyperIndex.toString() : index.toString(),
        toBytes32(manipulated_balance).toString(),
        provider
    );
}
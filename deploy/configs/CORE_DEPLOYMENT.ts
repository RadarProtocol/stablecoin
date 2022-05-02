import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = true; // If this config is enabled or not
const isDevDeploy = true; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "CORE"; // Deployment type: CORE

// CORE CONFIG
const GELATO_POKE_ME = "0x8aB6aDbC1fec4F18617C9B889F5cE7F28401B8dB";
const STABILIZER_CONFIG = {
    tokens: [
        "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", // DAI.e
        "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", // USDC.e
        "0xc7198437980c041c805A1EDcbA50c1Ce5db95118" // USDT.e
    ],
    mint_fee: 100,
    burn_fee: 20,
    fee_receiver: "0x6d9abd331698D721fc54F5188bdeb3B500EC1182"
};

const configuration: DeploymentConfig = {
    ENABLED,
    NETWORK,
    DEPLOYMENT_TYPE,
    GELATO_POKE_ME,
    STABILIZER_CONFIG
}

const fn: DeployFunction = async (hre) => {
    await saveConfig(hre, configuration);
};
  
fn.tags = ['Config'];
fn.skip = async (hre) => {
    // Run this only for mainnet & mainnet forks.
    const chain = parseInt(await hre.getChainId());
    return (chain !== NETWORK && !isDevDeploy) || !ENABLED
};
  
export default fn;
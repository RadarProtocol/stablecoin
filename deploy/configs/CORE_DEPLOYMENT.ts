import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = true; // If this config is enabled or not
const isDevDeploy = true; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "CORE"; // Deployment type: CORE

const configuration: DeploymentConfig = {
    ENABLED,
    NETWORK,
    DEPLOYMENT_TYPE
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
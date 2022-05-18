import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = false; // If this config is enabled or not
const isDevDeploy = false; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "Farms"; // Deployment type: CORE, LPs, Swappers

const FARMS_DEPLOYMENT = {
    RADAR: "0x44d2B67187d539E83328aDe72A1b5f9512a74444",
    USDRCurveLPFarm: {
        USDRCurvePoolLP: "",
        RewardDuration: 60*60*24*28 // 28 days
    }
}

const configuration: DeploymentConfig = {
    ENABLED,
    NETWORK,
    isDevDeploy,
    DEPLOYMENT_TYPE,
    GELATO_POKE_ME: null,
    STABILIZER_CONFIG: null,
    ORACLE_CONFIG: null,
    STRATEGIES_CONFIG: null,
    LENDING_POOLS: null,
    SUPPORTED_ASSETS: null,
    SWAPPERS: null,
    FARMS_DEPLOYMENT
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
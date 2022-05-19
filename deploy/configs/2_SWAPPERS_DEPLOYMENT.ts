import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = false; // If this config is enabled or not
const isDevDeploy = false; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "Swappers"; // Deployment type: CORE, LPs, Swappers

// Swappers config

const SWAPPERS = {
    USDRCurvePool: "0x6856860ce8913e98A2baC1A922F309D9a16651fA",
    swappersToDeploy: [
        "BenqiAvaxSwapper",
        "CurveAaveLPSwapper",
        "BenqiStakedAvaxSwapper",
        "BenqiCurveAaveUnderlyingSwapper",
        "BenqiCurveTricryptoUnderlyingSwapper"
    ],
    USDR: "0x9456e074A1e6Eb3B6952a47Da2859dd1Ad6C2B25",
    LickHitter: "0xed71c373d5f119796014a405Ddd1e6DfCb27b821"
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
    SWAPPERS,
    FARMS_DEPLOYMENT: null
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
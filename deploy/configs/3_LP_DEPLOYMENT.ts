import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = false; // If this config is enabled or not
const isDevDeploy = false; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "LPs"; // Deployment type: CORE, LPs, Swappers

// LPs CONFIG
const LENDING_POOLS = {
    MASTER: "0xAf445d2efad68bbB24fDF798ab34B2E90F5acae0",
    USDR: "0x9456e074A1e6Eb3B6952a47Da2859dd1Ad6C2B25",
    LICK_HITTER: "0xed71c373d5f119796014a405Ddd1e6DfCb27b821",
    ORACLE: "0xD62776f1BFCB05532e3d115CaD70aDCB2e431754",
    FEE_RECEIVER: "0x6d9abd331698D721fc54F5188bdeb3B500EC1182",
    POOLS: [
        {
            collateral: "0x1337BedC9D22ecbe766dF105c9623922A27963EC",
            name: "av3Crv",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0xE987a4c50B496Ff3E54Ab7CA7626ed02Fb5A4dD1"
        },
        {
            collateral: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            name: "qiUSDC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0x606E62dF648AAaE473ff235B892E82024bAc6c21"
        },
        {
            collateral: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            name: "qiUSDT",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0x606E62dF648AAaE473ff235B892E82024bAc6c21"
        },
        {
            collateral: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            name: "qiDAI",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0x606E62dF648AAaE473ff235B892E82024bAc6c21"
        },
        {
            collateral: "0x5C0401e81Bc07Ca70fAD469b451682c0d747Ef1c",
            name: "qiAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0xEcD0f9F76A4Ff4b0Fb71A5BEe7B30bf1e4b3F680"
        }
        {
            collateral: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            name: "qiBTC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0xbb2762865356924E08e641D3c4590E0597D0f634"
        },
        {
            collateral: "0x334AD834Cd4481BB02d09615E7c11a00579A7909",
            name: "qiETH",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0xbb2762865356924E08e641D3c4590E0597D0f634"
        },
        {
            collateral: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
            name: "sAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0x96AF46824FecAAd3b8295AaF89f8c08154443475"
        }
    ]
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
    LENDING_POOLS,
    SUPPORTED_ASSETS: null,
    SWAPPERS: null,
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
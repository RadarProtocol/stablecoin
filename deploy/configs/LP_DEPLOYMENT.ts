import { ethers, utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { DeploymentConfig, saveConfig } from '../utils/config';

// General Configuration
const ENABLED = false; // If this config is enabled or not
const isDevDeploy = false; // Should always be false, only true when deploying to hardhat forks
const NETWORK = 43114; // Network ID of deployment
const DEPLOYMENT_TYPE = "LPs"; // Deployment type: CORE, LPs

// LPs CONFIG
const LENDING_POOLS = {
    MASTER: "",
    USDR: "",
    LICK_HITTER: "",
    ORACLE: "",
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
            swapper_address: ""
        },
        {
            collateral: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            name: "qiUSDC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: ""
        },
        {
            collateral: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            name: "qiUSDT",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: ""
        },
        {
            collateral: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            name: "qiDAI",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: ""
        },
        {
            collateral: "0xaf2c034C764d53005cC6cbc092518112cBD652bb",
            name: "qiAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: ""
        },
        {
            collateral: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            name: "qiBTC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: ""
        },
        {
            collateral: "0x334AD834Cd4481BB02d09615E7c11a00579A7909",
            name: "qiETH",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: ""
        },
        {
            collateral: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
            name: "sAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: ""
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
    CURVE_USDR_POOL: null,
    LENDING_POOLS,
    SUPPORTED_ASSETS: null
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
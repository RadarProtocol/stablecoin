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
    MASTER: "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575",
    USDR: "0xCD8a1C3ba11CF5ECfa6267617243239504a98d90",
    LICK_HITTER: "0x82e01223d51Eb87e16A03E24687EDF0F294da6f1",
    ORACLE: "0x1429859428C0aBc9C2C47C8Ee9FBaf82cFA0F20f",
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
            swapper_address: "0x4C4a2f8c81640e47606d3fd77B353E87Ba015584"
        },
        {
            collateral: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            name: "qiUSDC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6"
        },
        {
            collateral: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            name: "qiUSDT",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6"
        },
        {
            collateral: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            name: "qiDAI",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 500,
            liq_dao_fee: 1000,
            max_ltv: 9200,
            swapper_address: "0xdbC43Ba45381e02825b14322cDdd15eC4B3164E6"
        },
        {
            collateral: "0xaf2c034C764d53005cC6cbc092518112cBD652bb",
            name: "qiAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0x1fA02b2d6A771842690194Cf62D91bdd92BfE28d"
        },
        {
            collateral: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            name: "qiBTC",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0x21dF544947ba3E8b3c32561399E88B52Dc8b2823"
        },
        {
            collateral: "0x334AD834Cd4481BB02d09615E7c11a00579A7909",
            name: "qiETH",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0x21dF544947ba3E8b3c32561399E88B52Dc8b2823"
        },
        {
            collateral: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
            name: "sAVAX",
            entry_fee: 100,
            exit_fee: 50,
            liq_incentive: 1000,
            liq_dao_fee: 1000,
            max_ltv: 8500,
            swapper_address: "0x04C89607413713Ec9775E14b954286519d836FEf"
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
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
const abiCoder = new ethers.utils.AbiCoder;
const ORACLE_CONFIG = {
    BLOCKCHAIN_TOKEN_ORACLE: "0x0A77230d17318075983913bC2145DB16C7366156",
    TOKENS: [
        {
            address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", // DAI.e
            feedType: 0,
            feed: "0x51D7180edA2260cc4F6e4EebB82FEF5c3c2B8300",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // AVAX
            feedType: 0,
            feed: "0x0A77230d17318075983913bC2145DB16C7366156",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0x50b7545627a5162F82A992c33b87aDc75187B218", // BTC
            feedType: 0,
            feed: "0x2779D32d5166BAaa2B2b658333bA7e6Ec0C65743",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // ETH
            feedType: 0,
            feed: "0x976B3D034E162d8bD72D6b9C989d545b839003b0",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118", // USDT.e
            feedType: 0,
            feed: "0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", // USDC.e
            feedType: 0,
            feed: "0xF096872672F44d6EBA71458D74fe67F9a77a23B9",
            feedDecimals: 8,
            metadata: []
        },
        {
            address: "0x1337BedC9D22ecbe766dF105c9623922A27963EC", // av3Crv
            feedType: 3,
            feed: "0x7f90122BF0700F9E7e1F688fe926940E8839F353",
            feedDecimals: 8,
            metadata: abiCoder.encode(["address"], ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70"]) // DAI.e underlying
        },
        {
            address: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D", // qiDAI
            feedType: 5,
            feed: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70",18]
            ) // DAI.e underlying, 18 decimals
        },
        {
            address: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F", // qiUSDC
            feedType: 5,
            feed: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",6]
            ) // USDC.e underlying, 6 decimals
        },
        {
            address: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C", // qiUSDT
            feedType: 5,
            feed: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0xc7198437980c041c805a1edcba50c1ce5db95118",6]
            ) // USDT.e underlying, 6 decimals
        },
        {
            address: "0xaf2c034c764d53005cc6cbc092518112cbd652bb", // qiAVAX
            feedType: 5,
            feed: "0xaf2c034c764d53005cc6cbc092518112cbd652bb",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",18]
            ) // AVAX underlying, 18 decimals
        },
        {
            address: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568", // qiBTC
            feedType: 5,
            feed: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0x50b7545627a5162F82A992c33b87aDc75187B218",8]
            ) // BTC underlying, 8 decimals
        },
        {
            address: "0x334ad834cd4481bb02d09615e7c11a00579a7909", // qiETH
            feedType: 5,
            feed: "0x334ad834cd4481bb02d09615e7c11a00579a7909",
            feedDecimals: 8,
            metadata: abiCoder.encode(
                ["address","uint256"],
                ["0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab",18]
            ) // ETH underlying, 18 decimals
        },
        {
            address: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE", // sAVAX
            feedType: 4,
            feed: "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
            feedDecimals: 8,
            metadata: abiCoder.encode(["address"], ["0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"]) // AVAX underlying
        }
    ]
};
const STRATEGIES_CONFIG = {
    AVALANCHE: {
        BENQIStrategy: [
            {
                token: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", // DAI.e
                qiToken: "0x835866d37AFB8CB8F8334dCCdaf66cf01832Ff5D" // qDAI
            },
            {
                token: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664", // USDC.e
                qiToken: "0xBEb5d47A3f720Ec0a390d04b4d41ED7d9688bC7F" // qiUSDC
            },
            {
                token: "0xc7198437980c041c805A1EDcbA50c1Ce5db95118", // USDT.e
                qiToken: "0xc9e5999b8e75C3fEB117F6f73E664b9f3C8ca65C" // qiUSDT
            },
            {
                token: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // wAVAX
                qiToken: "0xaf2c034c764d53005cc6cbc092518112cbd652bb" // qiAVAX
            },
            {
                token: "0x50b7545627a5162F82A992c33b87aDc75187B218", // wBTC
                qiToken: "0xe194c4c5aC32a3C9ffDb358d9Bfd523a0B6d1568" // qiBTC
            },
            {
                token: "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // wETH
                qiToken: "0x334ad834cd4481bb02d09615e7c11a00579a7909" // qiETH
            }
        ],
        CurveLPAvalancheStrategy: {
            harvest_reward_token_av3Crv: "0x47536F17F4fF30e64A96a7555826b8f9e66ec468", // CRV
            harvest_reward_token_crvUSDBTCETH: "0x47536F17F4fF30e64A96a7555826b8f9e66ec468", // CRV
            harvest_min_reward_amount_av3Crv: ethers.utils.parseEther('250'), // 250 CRV
            harvest_min_reward_amount_crvUSDBTCETH: ethers.utils.parseEther('250') // 250 CRV
        }
    }
}

const configuration: DeploymentConfig = {
    ENABLED,
    NETWORK,
    isDevDeploy,
    DEPLOYMENT_TYPE,
    GELATO_POKE_ME,
    STABILIZER_CONFIG,
    ORACLE_CONFIG,
    STRATEGIES_CONFIG
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
import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/types";
import 'hardhat-deploy';
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import { utils } from 'ethers';

dotenv.config();

function node(networkName: string) {
  const fallback = 'http://localhost:8545';
  const uppercase = networkName.toUpperCase();
  const uri = process.env[`${uppercase}_NODE`] || process.env.ETHEREUM_NODE || fallback;
  return uri.replace('{{NETWORK}}', networkName);
}

function accounts(networkName: string) {
  const uppercase = networkName.toUpperCase();
  const accounts = process.env[`${uppercase}_ACCOUNTS`] || process.env.ETHEREUM_ACCOUNTS || '';
  return accounts
    .split(',')
    .map((account) => account.trim())
    .filter(Boolean);
}

const mnemonic = 'test test test test test test test test test test test junk';

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    settings: {
      optimizer: {
        details: {
          yul: false,
        },
        enabled: true,
        runs: 200,
      },
    },
    version: '0.8.0',
  },
  namedAccounts: {
    deployer: 0
  },
  networks: {
    hardhat: {
      hardfork: 'london',
      accounts: {
        accountsBalance: utils.parseUnits('1', 36).toString(),
        count: 5,
        mnemonic,
      },
      forking: {
        // blockNumber: 13430490,
        // blockNumber: 13603419,
        blockNumber: 14095344,
        url: node('ethereum'), // Oct 16, 2021
      },
      gas: 9500000,
      gasMultiplier: 1.1,
      ...(process.env.COVERAGE && {
        allowUnlimitedContractSize: false,
      }),
    },
    ethereum: {
      hardfork: 'london',
      accounts: accounts('ethereum'),
      url: node('ethereum'),
      timeout: 259200000,
      gasPrice: 100000000000,
      gasMultiplier: 1.1
    },
    bsc: {
      accounts: accounts('bsc'),
      url: node('bsc'),
      timeout: 259200000,
      gasPrice: 10000000000,
      gasMultiplier: 1.1
    },
    polygon: {
      accounts: accounts('polygon'),
      url: node('polygon'),
      timeout: 259200000,
      gasPrice: 200000000000,
      gasMultiplier: 1.1
    },
    fantom: {
      accounts: accounts('fantom'),
      url: node('fantom'),
      timeout: 259200000,
      gasPrice: 1000000000000,
      gasMultiplier: 1.1
    },
    avaxc: {
      accounts: accounts('avaxc'),
      url: node('avaxc'),
      timeout: 259200000,
      gasPrice: 25000000000,
      gasMultiplier: 1.1
    },
    moonbeam: {
      accounts: accounts('moonbeam'),
      url: node('moonbeam'),
      timeout: 259200000,
      gasPrice: 100000000000,
      gasMultiplier: 1.1
    },
    moonriver: {
      accounts: accounts('moonriver'),
      url: node('moonriver'),
      timeout: 259200000,
      gasPrice: 1000000000,
      gasMultiplier: 1.1
    },
    dev: {
      accounts: {
        mnemonic,
        count: 5
      },
      url: "http://localhost:8545"
    },
    dev_bsc: {
      accounts: {
        mnemonic,
        count: 5
      },
      url: "http://localhost:8546"
    }
  },
};

export default config;

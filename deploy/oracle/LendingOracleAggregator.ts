import { ethers } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  const tokens = config.ORACLE_CONFIG!.TOKENS.map(x => x.address);
  const feedTypes = config.ORACLE_CONFIG!.TOKENS.map(x => x.feedType);
  const feeds = config.ORACLE_CONFIG!.TOKENS.map(x => x.feed);
  const feedDecimals = config.ORACLE_CONFIG!.TOKENS.map(x => x.feedDecimals);
  const metadata = config.ORACLE_CONFIG!.TOKENS.map(x => x.metadata);
  
  await deploy('LendingOracleAggregator', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          tokens,
          feedTypes,
          feeds,
          feedDecimals,
          metadata,
          config.ORACLE_CONFIG!.BLOCKCHAIN_TOKEN_ORACLE
      ]
  });
};

fn.tags = ['Core', 'LendingOracleAggregator'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE"
};

export default fn;
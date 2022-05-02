import { ethers } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  
  await deploy('BenqiDepositor', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true
  });
};

fn.tags = ['Core', 'Depositor', 'BenqiDepositor'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments or when network isn't avalanche
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE" || (config.NETWORK !== 43114 && !config.isDevDeploy );
};

export default fn;
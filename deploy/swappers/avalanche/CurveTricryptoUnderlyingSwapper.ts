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
  
  await deploy('CurveTricryptoUnderlyingSwapper', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
        config.SWAPPERS!.LickHitter,
        config.SWAPPERS!.USDR,
        config.SWAPPERS!.USDRCurvePool
    ]
  });
};

fn.tags = ['Core', 'Swapper', 'CurveTricryptoUnderlyingSwapper'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments or when network isn't avalanche
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "Swappers" || (config.NETWORK !== 43114 && !config.isDevDeploy ) || !config.SWAPPERS!.swappersToDeploy.includes("CurveTricryptoUnderlyingSwapper");
};

export default fn;
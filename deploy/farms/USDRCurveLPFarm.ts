import { ethers } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get, log },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  
  await deploy('DurationFixedRewardsFarmPool', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          config.FARMS_DEPLOYMENT!.RADAR,
          config.FARMS_DEPLOYMENT!.USDRCurveLPFarm.USDRCurvePoolLP,
          config.FARMS_DEPLOYMENT!.USDRCurveLPFarm.RewardDuration
      ]
  });

  log("^^ Deployed USDR Curve LP Rewards Pool (RADAR Rewards)");
};

fn.tags = ['Farm', 'USDRCurveLPFarm'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments or when network isn't avalanche
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "Farms" || (config.NETWORK !== 43114 && !config.isDevDeploy );
};

export default fn;
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

  const LickHitter = await get('LickHitter');
  const USDR = await get('RadarUSD');
  
  await deploy('BenqiCurveTricryptoUnderlyingSwapper', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          LickHitter.address,
          USDR.address,
          config.SWAPPERS!.USDRCurvePool
      ]
  });
};

fn.tags = ['Core', 'Swapper', 'BenqiCurveTricryptoUnderlyingSwapper'];
fn.dependencies = ['Config', 'LickHitter', 'USDR'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments or when network isn't avalanche
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "Swappers" || (config.NETWORK !== 43114 && !config.isDevDeploy ) || !config.SWAPPERS!.swappersToDeploy.includes("BenqiCurveTricryptoUnderlyingSwapper");
};

export default fn;
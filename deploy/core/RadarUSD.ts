import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);
  
  await deploy('RadarUSD', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true
  });
};

fn.tags = ['Core', 'USDR'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE"
};

export default fn;
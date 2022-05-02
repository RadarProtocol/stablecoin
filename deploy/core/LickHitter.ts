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
  
  await deploy('LickHitter', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          config.GELATO_POKE_ME
      ]
  });

  const LHFactory = await hre.ethers.getContractFactory("LickHitter");
  const LickHitter = await get('LickHitter');
  const lhContract = new ethers.Contract(
      LickHitter.address,
      LHFactory.interface,
      deployer
  );

  const tx = await lhContract.addSupportedTokens(
      config.SUPPORTED_ASSETS!.map(x => x.asset),
      config.SUPPORTED_ASSETS!.map(x => x.buffer)
  );
  const rc = await tx.wait();

  log(`Added supported assets in tx ${rc.transactionHash}`);
};

fn.tags = ['Core', 'LickHitter'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE"
};

export default fn;
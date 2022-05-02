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

  const USDR = await get("RadarUSD");
  const USDRFactory = await hre.ethers.getContractFactory("RadarUSD");
  const LickHitter = await get("LickHitter");
  
  await deploy('Stabilizer', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          USDR.address,
          config.GELATO_POKE_ME,
          config.STABILIZER_CONFIG.tokens,
          config.STABILIZER_CONFIG.mint_fee,
          config.STABILIZER_CONFIG.burn_fee,
          config.STABILIZER_CONFIG.fee_receiver,
          LickHitter.address
      ]
  });

  const Stabilizer = await get('Stabilizer');
  const USDRContract = new ethers.Contract(
      USDR.address,
      USDRFactory.interface,
      deployer
  );
  await USDRContract.addMinter(Stabilizer.address);
};

fn.tags = ['Core', 'Stabilizer'];
fn.dependencies = ['Config', 'USDR', 'LickHitter'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE"
};

export default fn;
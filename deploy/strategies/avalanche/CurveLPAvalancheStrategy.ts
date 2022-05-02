import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from '../../utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get, log },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  const LickHitter = await get('LickHitter');
  const strategyConfig = config.STRATEGIES_CONFIG!.AVALANCHE.CurveLPAvalancheStrategy;
  
  await deploy('CurveLPAvalancheStrategy', {
      from: deployer.address,
      log: true,
      skipIfAlreadyDeployed: true,
      args: [
          LickHitter.address,
          [strategyConfig.harvest_reward_token_av3Crv, strategyConfig.harvest_reward_token_crvUSDBTCETH],
          [strategyConfig.harvest_min_reward_amount_av3Crv, strategyConfig.harvest_min_reward_amount_crvUSDBTCETH]
      ]
  });

  log("Strategy must be added manually to LickHitter");
};

fn.tags = ['Core', 'Strategy', 'CurveLPAvalancheStrategy'];
fn.dependencies = ['Config', 'LickHitter'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments or when network isn't avalanche
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "CORE" || (config.NETWORK !== 43114 && !config.isDevDeploy );
};

export default fn;
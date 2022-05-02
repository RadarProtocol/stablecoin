import { BigNumberish, BytesLike, constants, ethers } from 'ethers';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

export async function saveConfig(hre: HardhatRuntimeEnvironment, data: DeploymentConfig) {
  await hre.deployments.save('Config', {
    abi: [],
    address: constants.AddressZero,
    linkedData: data,
  });
}

export async function loadConfig(hre: HardhatRuntimeEnvironment) {
  const deployment = await hre.deployments.get('Config');
  return deployment.linkedData as DeploymentConfig;
}

export async function hasConfig(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return !!(await hre.deployments.getOrNull('Config'));
}

export interface DeploymentConfig {
  ENABLED: boolean,
  DEPLOYMENT_TYPE: string,
  NETWORK: Number,
  isDevDeploy: boolean,
  GELATO_POKE_ME: string,
  STABILIZER_CONFIG: {
    tokens: Array<string>,
    mint_fee: Number,
    burn_fee: Number,
    fee_receiver: string
  },
  ORACLE_CONFIG: {
    BLOCKCHAIN_TOKEN_ORACLE: string,
    TOKENS: Array<{
      address: string,
      feedType: number,
      feed: string,
      feedDecimals: number,
      metadata: BytesLike
    }>
  },
  STRATEGIES_CONFIG: {
    AVALANCHE: {
      BENQIStrategy: Array<{token: string, qiToken: string}>,
      CurveLPAvalancheStrategy: {
        harvest_reward_token_av3Crv: string,
        harvest_reward_token_crvUSDBTCETH: string,
        harvest_min_reward_amount_av3Crv: BigNumberish,
        harvest_min_reward_amount_crvUSDBTCETH: BigNumberish
      }
    }
  }
}

const fn: DeployFunction = async () => {
  // Nothing to do here.
};

fn.tags = ['Config'];

export default fn;
import { ethers } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';

import { loadConfig } from './utils/config';

const fn: DeployFunction = async function (hre) {

    const {
        deployments: { deploy, get, log },
        ethers: { getSigners },
    } = hre;

  const deployer = (await getSigners())[0];
  const config = await loadConfig(hre);

  const abiCoder = new ethers.utils.AbiCoder;
  const pools = config.LENDING_POOLS!.POOLS;

  var usdrAddress = config.LENDING_POOLS!.USDR;
  if (usdrAddress == null) {
      const USDR = await get('RadarUSD');
      usdrAddress = USDR.address;
  }

  var masterAddress = config.LENDING_POOLS!.MASTER;
  if(masterAddress == null) {
      const master = await get('LendingPair');
      masterAddress = master.address;
  }

  var lickHitterAddress = config.LENDING_POOLS!.LICK_HITTER;
  if(lickHitterAddress == null) {
      const LickHitter = await get('LickHitter');
      lickHitterAddress = LickHitter.address;
  }

  var oracleAddress = config.LENDING_POOLS!.ORACLE;
  if(oracleAddress == null) {
      const Oracle = await get('LendingOracleAggregator');
      oracleAddress = Oracle.address;
  }

  const feeReceiver = config.LENDING_POOLS!.FEE_RECEIVER;
  const initInterface = new ethers.utils.Interface(["function init(address _collateral,address _lendAsset,uint256 _entryFee,uint256 _exitFee,uint256 _liquidationIncentive,uint256 _radarLiqFee,address _yieldVault,address _feeReceiver,uint256 _maxLTV,address _oracle,address _swapper)"]);

  for(var i = 0; i < pools!.length; i++) {
    const pool = pools![i];

    const initData = initInterface.encodeFunctionData("init", [
        pool.collateral,
        usdrAddress,
        pool.entry_fee, 
        pool.exit_fee, 
        pool.liq_incentive, 
        pool.liq_dao_fee, 
        lickHitterAddress,
        feeReceiver,
        pool.max_ltv, 
        oracleAddress,
        pool.swapper_address
    ]);

    await deploy('LendingNUP', {
        from: deployer.address,
        log: true,
        skipIfAlreadyDeployed: false,
        args: [
            initData,
            masterAddress
        ]
    });

    const dplp = await get("LendingNUP");
    log(`Deployed ${pool.name} LendingPool at ${dplp.address}`);
  }
};

fn.tags = ['LPs', 'LendingPairNUP'];
fn.dependencies = ['Config'];
fn.skip = async (hre) => {
  // Skip this on non-core deployments
  const config = await loadConfig(hre);
  return config.DEPLOYMENT_TYPE != "LPs"
};

export default fn;
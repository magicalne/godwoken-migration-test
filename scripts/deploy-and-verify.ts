import { ethers, network, config} from "hardhat";
import fetch from "cross-fetch"
import { expect } from "chai";


async function getGwHashByEthTxHash(txHash: string) {
  const request = {
    method: "poly_getGwTxHashByEthTxHash",
    params: [txHash],
    jsonrpc: "2.0",
    id: 1
  };
  const requestBody = JSON.stringify(request);
  const res = await fetch(`http://localhost:8024/instant-finality-hack`, {
    method: 'POST',
  headers: {
    "Content-Type": "application/json"
  },
  body: requestBody
  })
  const resBody: any = await res.json()
  if (resBody.error) {
    throw new Error(resBody.error.message)
  }
  return resBody.result
}

async function debugReplayTx(gwHash: string) {
  const request = {
    method: "gw_debug_replay_transaction",
    params: [gwHash],
    jsonrpc: "2.0",
    id: 1
  };
  const requestBody = JSON.stringify(request);
  const res = await fetch(`http://localhost:8024/instant-finality-hack`, {
    method: 'POST',
  headers: {
    "Content-Type": "application/json"
  },
  body: requestBody
  })
  const resBody: any = await res.json()
  console.log(`resBody: ${JSON.stringify(resBody)}`)
  if (resBody.error) {
    throw new Error(resBody.error.message)
  }
  return resBody.result
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function assertState(gwProvider, axonProvider, rawTx) {
  let resOnGodwoken = await gwProvider.call(rawTx)
  let resOnAxon = await axonProvider.call(rawTx)
  expect(resOnGodwoken, "Test bool.").to.equal(resOnAxon)
}

async function main() {
  console.log(network.name)

  const axon = config.networks.axon_local_devnet
  console.log(`networks: ${JSON.stringify(axon)}`)

  const [deployer] = await ethers.getSigners();
  console.log(`deployer: ${deployer.address}`)

  // Deploy the target contract we test against.
  const ChainCompatibilityTest = await ethers.getContractFactory("ChainCompatibilityTest");
  const chainCompatibilityTest = await ChainCompatibilityTest.deploy()
  await chainCompatibilityTest.deployed()
  const tx = await chainCompatibilityTest.mutate()
  console.log(`eth tx hash: ${JSON.stringify(tx.hash)}`)

  const receipt = await tx.wait()

  const axonProvider = new ethers.providers.JsonRpcProvider(axon)
  // Wait on migration. Make sure the contract and mutate tx are on axon.
  while (true) {
    if (await axonProvider.getBlockNumber() > receipt.blockNumber + 1) {
      let tip = await ethers.provider.getBlockNumber()
      console.log(`tip on godwoken: ${tip}`)

      tip = await axonProvider.getBlockNumber()
      console.log(`tip on axon: ${tip}`)
      break
    }
    await sleep(1000)
  }
    
  const receiptOnAxon = await axonProvider.getTransactionReceipt(tx.hash)
  expect(receiptOnAxon, "Lookup tx receipt.").not.undefined
  const code = await axonProvider.getCode(chainCompatibilityTest.address)
  expect(code, "Lookup code on axon.").not.undefined

  const balanceOnGodwoken = await deployer.getBalance()
  const balanceOnAxon = await axonProvider.getBalance(deployer.address)
  expect(balanceOnGodwoken, "The balance should be migrated to axon.").to.equal(balanceOnAxon)

  let rawTx = await chainCompatibilityTest.populateTransaction.getBool()
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getInt()
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getUint()
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getArray(1)
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getMapping(1)
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getString()
  await assertState(ethers.provider, axonProvider, rawTx)
  rawTx = await chainCompatibilityTest.populateTransaction.getBytes32()
  await assertState(ethers.provider, axonProvider, rawTx)

  // It dones't work.
  //const contractOnAxon = await ethers.getContractAt("ChainCompatibilityTest", chainCompatibilityTest.address, axonProvider.getSigner())
}

main().catch(console.error);

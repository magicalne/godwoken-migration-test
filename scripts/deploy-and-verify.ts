import { ethers, network, config} from "hardhat";
import fetch from "cross-fetch"
import { expect } from "chai";
import { NetworkConfig } from "hardhat/types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { PopulatedTransaction } from "@ethersproject/contracts";
import { ConnectionInfo } from "ethers/lib/utils";


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

interface SMTStat { 
  update_kvs: number;
  update_milliseconds: number; 
}

interface Event {
  address: string | null;
  id: number;
  key: string;
  type: "account_state" | "account_nonce" | "log" | "create" | "destroy";
  value: string;
}

enum TransactionType {
  Meta = 'meta',
  Sudt = 'sudt', 
  AddressRegistry = 'addressRegistry',
  Eth = 'eth',
  Deposit = 'deposit',
  Withdrawal = 'withdrawal'
}
interface Transaction {
  events: Event[];
  tx_hash: string;
  type: TransactionType;
}

interface StateChange {
  smt_stat: SMTStat;
  transactions: Transaction[]; 
}

async function getStateChange(gwHash: string) : Promise<null | StateChange> {
  const request = {
    method: "gw_state_changes_by_block",
    params: [gwHash],
    jsonrpc: "2.0",
    id: 1
  };
  const requestBody = JSON.stringify(request);
  const res = await fetch(`http://localhost:8119/instant-finality-hack`, {
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
  if (resBody.result == null) {
    return null
  }
  return resBody.result as StateChange
}

async function compareStateChange(stateChange: StateChange, axonProvider: JsonRpcProvider) {
  console.log(`state change: ${JSON.stringify(stateChange.smt_stat)}`)
  for (let tx of stateChange.transactions) {
    console.log(`tx: ${tx.type}`)
    if (tx.type != TransactionType.Eth) {
      continue
    }
    for (let event of tx.events) {
      if (event.type == "account_state") {
        if (event.address == null) {
          // TODO: How to comapre state change without address for eth tx?
          //throw new Error("address is null")
          continue
        }
        let v = await axonProvider.getStorageAt(event.address, event.key, "latest")
        console.log(`type: ${event.type} key: ${event.key}, key: ${event.value}, actual value: ${v}`)
        expect(v, "Compare state K-V").to.equal(event.value)
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function assertState(gwProvider: JsonRpcProvider, axonProvider: JsonRpcProvider, rawTx: PopulatedTransaction) {
  let resOnGodwoken = await gwProvider.call(rawTx)
  let resOnAxon = await axonProvider.call(rawTx)
  expect(resOnGodwoken, "Test bool.").to.equal(resOnAxon)
}

async function main() {
  console.log(network.name)

  const axon: NetworkConfig = config.networks.axon_local_devnet

  const [deployer] = await ethers.getSigners();
  console.log(`deployer: ${deployer.address}`)

  // Deploy the target contract we test against.
  const ChainCompatibilityTest = await ethers.getContractFactory("ChainCompatibilityTest");
  const chainCompatibilityTest = await ChainCompatibilityTest.deploy()
  await chainCompatibilityTest.deployed()
  console.log(`contract address: ${chainCompatibilityTest.address}`)
  const tx = await chainCompatibilityTest.mutate()
  console.log(`eth tx hash: ${JSON.stringify(tx.hash)}`)

  const receipt = await tx.wait()
  const blockHash = receipt.blockHash
  console.log(`blockHash: ${JSON.stringify(blockHash)}`)

  const gwHash = await getGwHashByEthTxHash(tx.hash)
  console.log(`gw tx hash: ${JSON.stringify(gwHash)}`)

  const axonProvider = new ethers.providers.JsonRpcProvider(axon as ConnectionInfo)
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
  const stateChange = await getStateChange(blockHash)

  if (stateChange == null) {
    throw new Error("state change is null")
  }
  await compareStateChange(stateChange, axonProvider)
  const receiptOnAxon = await axonProvider.getTransactionReceipt(tx.hash)
  expect(receiptOnAxon, "Lookup tx receipt.").not.undefined
  const code = await axonProvider.getCode(chainCompatibilityTest.address)
  expect(code, "Lookup code on axon.").not.undefined

  const balanceOnGodwoken = await deployer.getBalance()
  const balanceOnAxon = await axonProvider.getBalance(deployer.address)
  expect(balanceOnGodwoken, `The balance of ${deployer.address} should be migrated to axon.`).to.equal(balanceOnAxon)

  let rawTx: PopulatedTransaction = await chainCompatibilityTest.populateTransaction.getBool()
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

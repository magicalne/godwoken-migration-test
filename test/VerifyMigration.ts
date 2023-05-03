import { ethers, config} from "hardhat";
import fetch from "cross-fetch"
import { expect } from "chai";
import { NetworkConfig } from "hardhat/types";
import { JsonRpcProvider } from "@ethersproject/providers";
import { PopulatedTransaction } from "@ethersproject/contracts";
import { ConnectionInfo } from "ethers/lib/utils";
import { ChainCompatibilityTest } from "../typechain-types/ChainCompatibilityTest";
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

interface GodwokenBlockStateChange {
  smt_stat: SMTStat;
  transactions: Transaction[]; 
}

async function getStateChangeFromGw(gwHash: string) : Promise<null | GodwokenBlockStateChange> {
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
  return resBody.result as GodwokenBlockStateChange
}

// Send json rpc request, the request params ie the same as eth_call.
async function getStateChangeFromAxon(ethCall: PopulatedTransaction, blockNumber: string) : Promise<null | any> {
  const request = {
    method: "debug_call",
    params: [ethCall, blockNumber],
    jsonrpc: "2.0",
    id: 1
  };
  console.log(`request: ${JSON.stringify(request), null, 2}`)
  const requestBody = JSON.stringify(request);
  const res = await fetch(`http://localhost:8000`, {
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
  return resBody.result
}

// Compare kv with eth_getStorageAt.
async function compareStateChangeWithProvider(stateChange: GodwokenBlockStateChange, axonProvider: JsonRpcProvider) {
  console.log("compare state change with provider: eth_getStorageAt")
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

// Compare kv between godwoken and axon.
function compareKV(gwStateChange: Transaction, axonStateChange: any) {
  console.log("compare state change with custom RPC")
  console.log(`gw state change: ${JSON.stringify(gwStateChange)}`)
  console.log(`axon state change: ${JSON.stringify(axonStateChange)}`)
  for (let change of axonStateChange) {
    for (let [k, v] of Object.entries(change.modify.storage)) {
      console.log(`k: ${k}, v: ${v}`)
      const exp = gwStateChange.events.find(e => e.key == k && e.address == change.modify.address && e.value == v)
      expect(exp, "Compare state K-V").to.not.be.undefined
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

describe("VerifyMigration", async () => {
  const axon: NetworkConfig = config.networks.axon_local_devnet
  const [deployer] = await ethers.getSigners();
  const axonProvider: JsonRpcProvider = new ethers.providers.JsonRpcProvider(axon as ConnectionInfo)
  const gwProvider: JsonRpcProvider = ethers.provider 
  it("ChainCompatibilityTest", async () => {
    const factory = await ethers.getContractFactory("ChainCompatibilityTest");
    const chainCompatibilityTest: ChainCompatibilityTest  = await factory.deploy()
    await chainCompatibilityTest.deployed()
    console.log(`contract address: ${chainCompatibilityTest.address}`)
    const tx = await chainCompatibilityTest.mutate()
    console.log(`eth tx hash: ${JSON.stringify(tx.hash)}`)

    const receipt = await tx.wait()
    const blockHash = receipt.blockHash
    console.log(`blockHash: ${JSON.stringify(blockHash)}`)

    const gwHash = await getGwHashByEthTxHash(tx.hash)
    console.log(`gw tx hash: ${JSON.stringify(gwHash)}`)
    while (true) {
      if (await axonProvider.getBlockNumber() > receipt.blockNumber + 1) {
        let tip = await gwProvider.getBlockNumber()
        console.log(`tip on godwoken: ${tip}`)

        tip = await axonProvider.getBlockNumber()
        console.log(`tip on axon: ${tip}`)
        break
      }
      await sleep(1000)
    }

    let mutateTx = await chainCompatibilityTest.populateTransaction.mutate()
    const axonStateChange = await getStateChangeFromAxon(mutateTx, ethers.utils.hexlify(receipt.blockNumber-1))
    console.log(`axon state change: ${JSON.stringify(axonStateChange)}`)

    const gwStateChange = await getStateChangeFromGw(blockHash)
    if (gwStateChange == null) {
      throw new Error("state change is null")
    }
    const txStateChange = gwStateChange.transactions.find((tx) => tx.tx_hash == gwHash)
    if (txStateChange == null) {
      throw new Error("tx state change is null")
    }
    // compare txStateChange with axonStateChange
    compareKV(txStateChange, axonStateChange)
    await compareStateChangeWithProvider(gwStateChange, axonProvider)
    const receiptOnAxon = await axonProvider.getTransactionReceipt(tx.hash)
    expect(receiptOnAxon, "Lookup tx receipt.").not.undefined
    const code = await axonProvider.getCode(chainCompatibilityTest.address)
    expect(code, "Lookup code on axon.").not.undefined

    const balanceOnGodwoken = await deployer.getBalance()
    const balanceOnAxon = await axonProvider.getBalance(deployer.address)
    expect(balanceOnGodwoken, `The balance of ${deployer.address} should be migrated to axon.`).to.equal(balanceOnAxon)

    let rawTx: PopulatedTransaction = await chainCompatibilityTest.populateTransaction.getBool()
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getInt()
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getUint()
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getArray(1)
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getMapping(1)
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getString()
    await assertState(gwProvider, axonProvider, rawTx)
    rawTx = await chainCompatibilityTest.populateTransaction.getBytes32()
    await assertState(gwProvider, axonProvider, rawTx)
  })
  it("ERC20", async () => {
    const ERC20 = await ethers.getContractFactory("TestERC20");
    const contract = await ERC20.deploy();
    await contract.deployed()
    //const contractReceipt = await contract.deployTransaction.wait()
    let randomWallet = ethers.Wallet.createRandom()
    const tx = await contract.transfer(randomWallet.address, 100)
    const receipt = await tx.wait()
    const blockHash = receipt.blockHash
    console.log(`blockHash: ${JSON.stringify(blockHash)}`)

    const gwHash = await getGwHashByEthTxHash(tx.hash)
    console.log(`gw tx hash: ${JSON.stringify(gwHash)}`)
    while (true) {
      if (await axonProvider.getBlockNumber() > receipt.blockNumber + 1) {
        let tip = await gwProvider.getBlockNumber()
        console.log(`tip on godwoken: ${tip}`)

        tip = await axonProvider.getBlockNumber()
        console.log(`tip on axon: ${tip}`)
        break
      }
      await sleep(1000)
    }
    const transferTxx = await contract.populateTransaction.transfer(randomWallet.address, 100)
    const axonStateChange = await getStateChangeFromAxon(transferTxx, ethers.utils.hexlify(receipt.blockNumber-1))
    const gwStateChange = await getStateChangeFromGw(blockHash)
    if (gwStateChange == null) {
      throw new Error("state change is null")
    }
    const txStateChange = gwStateChange.transactions.find((tx) => tx.tx_hash == gwHash)
    if (txStateChange == null) {
      throw new Error("tx state change is null")
    }
    compareKV(txStateChange, axonStateChange)
    await compareStateChangeWithProvider(gwStateChange, axonProvider)

    const balanceOnGodwoken = await deployer.getBalance()
    const balanceOnAxon = await axonProvider.getBalance(deployer.address)
    expect(balanceOnGodwoken, `The balance of ${deployer.address} should be migrated to axon.`).to.equal(balanceOnAxon)

    let rawTx: PopulatedTransaction = await contract.populateTransaction.balanceOf(randomWallet.address)
    await assertState(gwProvider, axonProvider, rawTx)
  });
});


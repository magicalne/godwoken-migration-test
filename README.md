# Test consistency of the state after migration


## Prepare

Make sure kicker is running.
```sh
MANUAL_BUILD_GODWOKEN=true \
GODWOKEN_GIT_URL=https://github.com/sopium/godwoken.git \
GODWOKEN_GIT_CHECKOUT=trace-sys-store \
./kicker manual-build

sudo MANUAL_BUILD_GODWOKEN=true ./kicker start 

# Deposit
./kicker deposit 0xF386573563C3a75dBbd269FCe9782620826dDAc2 100000000

```

And `trace_generator_state = true` should be set in the config.toml of fullnode.

Start to migrate.

```sh
cargo run --bin migrator -- --config devtools/chain/devnet/migrator_axon_config.toml --genesis devtools/chain/devnet/genesis_single_node.json --migrator-config devtools/chain/devnet/migrator_config.toml
```


## Easist way to test.

- Deploy the target contract on godwoken devnet.
- Submit a tx to mutate state.
- Wait on godwoken producing blocks until a target height.
- When the migration is done, call the target contract on axon.

The contract should be found and the state of the target contrat should be equal with the state in the godowken.

```sh
npm install
npx hardhat run scripts/deploy-and-verify.ts --network gw_devnet
```

### Compare Key-Value between godwoken and axon directly

Get block state change with RPC from godwoken: `gw_state_changes_by_block`.
Get tx state change with RPC from axon: `debug_call`.

The `debug_call` is a modified version of `eth_call`.


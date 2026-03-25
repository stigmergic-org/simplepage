# SimplePage Smart Contracts

This repository contains the smart contracts for SimplePage, built using the Foundry development framework.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Make

## Getting Started

1. Install dependencies:
```bash
forge install
```

2. Build the contracts:
```bash
make build
```

## Development Commands

The following commands are available through the Makefile:

### Testing
Run the test suite:
```bash
make test
```

### Code Formatting
Format the Solidity code:
```bash
make format
```

### Gas Analysis
Generate gas snapshots:
```bash
make snapshot
```

## Deployment

### Local Development
Deploy to local network (requires running Anvil):
```bash
make deploy-dev <beneficiary_address> <price_feed_address>
```

### Sepolia Testnet
Deploy to Sepolia testnet:
```bash
make deploy-sepolia <beneficiary_address> <price_feed_address>
```
Where
- `beneficiary_address` is the address that recieves subscription fees
- `price_feed_address` is chainlink ETH/USD price feed (0x694AA1769357215DE4FAC081bf1f309aDC325306)
- `private_key` is the private key used for deployment

### Mainnet
Deploy to Ethereum mainnet:
```bash
make deploy <beneficiary_address> <price_feed_address>
```
Where
- `beneficiary_address` is the address that recieves subscription fees
- `price_feed_address` is chainlink ETH/USD price feed ()
- `private_key` is the private key used for deployment

### Deploy a New TokenRenderer
If `SimplePage` is already deployed and you only want to ship a new renderer version, deploy the renderer contract separately and then point `SimplePage` at it.

1. Build the contracts:
```bash
make build
```

2. Deploy the new renderer, passing the existing `SimplePage` address to the constructor:
```bash
forge create src/TokenRendererV3.sol:TokenRendererV3 \
  --rpc-url <your_rpc_url> \
  --account simplepage-deploy \
  --broadcast \
  --verify \
  --constructor-args <simple_page_address>
```

Replace `src/TokenRendererV3.sol:TokenRendererV3` with your renderer contract path and name if you are deploying a different version.

3. Update the live `SimplePage` contract to use the new renderer. If on mainnet, do it using the simplepage multisig.

4. Confirm the renderer was updated:
```bash
cast call <simple_page_address> "renderer()(address)" --rpc-url <your_rpc_url>
```


## Contract Verification

After deployment, verify your contracts on Etherscan:
```bash
forge verify-contract <deployed_address> <contract_name> --chain <chain_id> --api-key <etherscan_api_key> --watch
```

## Clean Build Files

Remove build artifacts:
```bash
make clean
```

## Additional Help

For a full list of available commands:
```bash
make help
```

## Documentation

For more detailed information about Foundry:
- [Foundry Book](https://book.getfoundry.sh/)
- [Foundry GitHub](https://github.com/foundry-rs/foundry)

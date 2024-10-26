# Makefile for Foundry project

# Default target
all: build

# Build the project
build:
	forge build

# Run tests
test:
	forge test -vvv

# Format check
format:
	forge fmt --check

# Format code
format-fix:
	forge fmt

# Generate gas snapshots
snapshot:
	forge snapshot

# Deploy to local hardhat node
# Usage: make deploy-dev <beneficiary> <priceFeed> <privateKey>
deploy-dev:
	@if [ "$(words $(MAKECMDGOALS))" -ne "4" ]; then \
		echo "Error: Three arguments required"; \
		echo "Usage: make deploy-dev <beneficiary> <priceFeed> <privateKey>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url http://localhost:8545 --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --private-key $(word 4,$(MAKECMDGOALS))
# node script/updateContracts.cjs 31337

# Deploy script and save deployments
# Usage: make deploy-sepolia <beneficiary> <priceFeed> <privateKey>
deploy-sepolia:
	@if [ "$(words $(MAKECMDGOALS))" -ne "4" ]; then \
		echo "Error: Three arguments required"; \
		echo "Usage: make deploy-sepolia <beneficiary> <priceFeed> <privateKey>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url https://sepolia.gateway.tenderly.co --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --private-key $(word 4,$(MAKECMDGOALS))
	node script/updateContracts.cjs 11155111

# Deploy to mainnet
# Usage: make deploy <beneficiary> <priceFeed> <privateKey>
deploy:
	@if [ "$(words $(MAKECMDGOALS))" -ne "4" ]; then \
		echo "Error: Three arguments required"; \
		echo "Usage: make deploy <beneficiary> <priceFeed> <privateKey>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url https://mainnet.gateway.tenderly.co --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --private-key $(word 4,$(MAKECMDGOALS))
	node script/updateContracts.cjs 1

# Clean build artifacts
clean:
	forge clean

# Help command
help:
	@echo "Available commands:"
	@echo "  make build     - Build the project"
	@echo "  make test      - Run tests"
	@echo "  make format    - Format code"
	@echo "  make snapshot  - Generate gas snapshots"
	@echo "  make run-dev   - Run local Ethereum node"
	@echo "  make fund-dev  - Fund a development address"
	@echo "  make deploy-dev - Deploy script and save deployments"
	@echo "  make clean     - Clean build artifacts"
	@echo "  make help      - Show this help message"

.PHONY: all build test format snapshot run-dev fund-dev deploy-dev clean help

%:
	@:

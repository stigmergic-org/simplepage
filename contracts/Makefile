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
# Usage: make deploy-dev <beneficiary> <priceFeed>
deploy-dev:
	@if [ "$(words $(MAKECMDGOALS))" -ne "3" ]; then \
		echo "Error: Two arguments required"; \
		echo "Usage: make deploy-dev <beneficiary> <priceFeed>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url http://localhost:8545 --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --account simplepage-deploy
# node script/updateContracts.cjs 31337

# Deploy script and save deployments
# Usage: make deploy-sepolia <beneficiary> <priceFeed>
deploy-sepolia:
	@if [ "$(words $(MAKECMDGOALS))" -ne "3" ]; then \
		echo "Error: Two arguments required"; \
		echo "Usage: make deploy-sepolia <beneficiary> <priceFeed>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url https://sepolia.gateway.tenderly.co --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --account simplepage-deploy
	node script/updateContracts.cjs 11155111

# Deploy to mainnet
# Usage: make deploy <beneficiary> <priceFeed>
deploy:
	@if [ "$(words $(MAKECMDGOALS))" -ne "3" ]; then \
		echo "Error: Two arguments required"; \
		echo "Usage: make deploy <beneficiary> <priceFeed>"; \
		exit 1; \
	fi
	forge script script/Setup.s.sol:SetupScript --rpc-url https://mainnet.gateway.tenderly.co --broadcast --sig "run(address,address)" $(word 2,$(MAKECMDGOALS)) $(word 3,$(MAKECMDGOALS)) --account simplepage-deploy
	node script/updateContracts.cjs 1

# Test token renderers and generate SVG outputs
# Usage: make test-renderers
test-renderers:
	@echo "🧹 Cleaning up previous test outputs..."
	@rm -rf test-render-outputs/*
	@mkdir -p test-render-outputs
	@echo "🔧 Running TokenRenderer demo script and extracting SVGs..."
	forge script script/DemoRenderers.s.sol:RenderersDemoScript --rpc-url http://localhost:8545 --broadcast | node script/extract-svgs.cjs
	@echo "✅ Test completed! Check the SVG files in the test-render-outputs/ directory"

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
	@echo "  make test-renderers - Test token renderers and generate SVGs"
	@echo "  make clean     - Clean build artifacts"
	@echo "  make help      - Show this help message"

.PHONY: all build test format snapshot run-dev fund-dev deploy-dev test-renderers clean help

%:
	@:

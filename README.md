# SimplePage

> **Decentralized Content Management for ENS Domains**

SimplePage is a decentralized content management platform that enables creators to write content using Markdown and publish it directly to their ENS (Ethereum Name Service) domains. Built on Ethereum smart contracts and IPFS, SimplePage provides a censorship-resistant, subscription-based publishing platform.

## 🌟 Key Features

- **ENS Integration**: Publish content directly to your ENS domain
- **Markdown Support**: Write content in familiar Markdown format
- **Decentralized Storage**: Content stored on IPFS for censorship resistance
- **Subscription Management**: Flexible subscription-based data storage

## 🏗️ How It Works

### High-Level Overview

SimplePage operates as a three-tier system:

1. **Smart Contracts** (Ethereum): Manage page subscriptions and indexing coordination
2. **Frontend Application** (Web): User interface for content creation and management
3. **Backend Services** (IPFS + API): Handle content storage and retrieval


### Subscription Model

- **Storage Units**: Each page requires storage units that expire over time
- **Subscription Management**: Users can purchase and manage storage units

## 🏛️ Architecture

### Smart Contracts

The platform is built on three core smart contracts:

- **`SimplePage.sol`**: Main NFT contract managing page creation and patronship
- **`SimplePageManager.sol`**: Handles subscription and storage unit management
- **`TokenRenderer.sol`**: Manages NFT metadata and page rendering

### Frontend Application

The main way to interact with SimplePage starts at [simplepage.eth](https://simplepage.eth.link).

- **React-based** web application with modern UI/UX
- **Web3 Integration** using Wagmi and Viem for Ethereum interaction
- **Markdown Editor** with live preview capabilities
- **Subscription Dashboard** for managing storage units and payments

### Backend Services

Anyone can spin up an instance of the SimplePage DService backend to pin all content, or only a subset.

- **IPFS Integration** for decentralized content storage
- **FastAPI-based** REST API for content retrieval
- **ENS Resolution** for domain-to-content mapping

### CLI Publishing

The SimplePage CLI provides a streamlined way to publish static web applications to ENS domains without requiring the full web interface.

- **Static Webapp Support**: Host any static web application on ENS domains
- **Command-Line Interface**: Simple CLI tool for quick deployment
- **Direct Publishing**: Deploy content directly from local directories
- **ENS Integration**: Seamless integration with ENS domain resolution

## 🚀 Getting Started

### For Content Creators

1. **Create Content**: Write your content using the Markdown editor
2. **Connect Wallet**: Use any Web3 wallet (MetaMask, WalletConnect, etc.)
3. **Purchase Storage**: Buy storage units for your content
4. **Publish**: Deploy your content to your ENS domain

### For Application Builder

Simply this command to get started:
```
npx @simplepg/cli publish my-name.eth ./my-static-webapp
```
Read more in the `@simplepg/cli` [README](./packages/cli/README.md).

### For Developers

#### Prerequisites
- Node.js (v18 or higher)
- Foundry (for smart contract development)
- Web3 wallet with testnet/mainnet ETH

#### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/stigmergic-org/simplepage.git
   cd simplepage
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up development environment**
   ```bash
   # Deploy contracts to local network
   cd contracts
   forge install
   make build
   make deploy-dev
   ```

4. **Start the frontend**
   ```bash
   cd frontend
   pnpm dev
   ```

## 📚 Documentation

- **Smart Contracts**: See `contracts/README.md` for detailed contract documentation
- **Frontend**: See `frontend/README.md` for frontend development guide
- **API Reference**: See `packages/dservice/README.md` for backend API documentation

## 🔧 Development

### Project Structure

```
simplepage/
├── contracts/          # Smart contracts (Solidity)
├── frontend/           # React web application
└── packages/
    ├── cli/            # Command-line interface
    ├── common/         # Shared utilities
    ├── dservice/       # Backend API services
    ├── repo/           # Repository management
    └── test-utils/     # Testing utilities
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the GPL-3.0-only License - see the [LICENSE](./LICENSE) file for details.

## 🤝 Support

- **Documentation**: Check the documentation in each component directory
- **Issues**: Report bugs and feature requests via GitHub Issues
- **Discussions**: Join community discussions on GitHub Discussions

---

**Built with ❤️ for the decentralized web**

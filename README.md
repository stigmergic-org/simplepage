# SimplePage Monorepo

> **Development & Contribution Guide**

Most user-facing documentation, guides, and FAQs are hosted at:

👉 [https://simplepage.eth.link](https://simplepage.eth.link)

This README is focused on development, contribution, and release workflows for the SimplePage monorepo.

---

## 🛠️ Monorepo Structure

```
simplepage/
├── contracts/          # Smart contracts (Solidity, Foundry)
├── frontend/           # React web application
└── packages/
    ├── cli/            # Command-line interface
    ├── common/         # Shared utilities
    ├── dservice/       # Backend API services
    ├── repo/           # Repository management
    └── test-utils/     # Testing utilities
```

- Each package has its own README with usage and development details.
- See [contracts/README.md](./contracts/README.md) for smart contract dev.
- See [frontend/README.md](./frontend/README.md) for frontend dev.
- See [packages/cli/README.md](./packages/cli/README.md) for CLI usage.

---

## 🚀 Getting Started (Development)

### Prerequisites
- Node.js v18+
- [pnpm](https://pnpm.io/) (monorepo/workspace manager)
- [Foundry](https://book.getfoundry.sh/) (for smart contract dev)

### Install dependencies
```bash
pnpm install
```

### Build all packages
```bash
pnpm build
```

### Run tests for all packages
```bash
pnpm test
```

### Start the frontend (dev mode)
```bash
cd frontend
pnpm dev
```

### Develop contracts
See [contracts/README.md](./contracts/README.md) for Foundry/Makefile usage.

---

## 🧑‍💻 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and commit (`git commit -m 'Describe your change'`)
4. Push to your fork (`git push origin feature/my-feature`)
5. Open a Pull Request

### Code Style & Workflow
- Use ES6+ features and follow existing code style
- Use workspace dependencies with `workspace:*` in package.json
- Use pnpm for all package management (see below)

---

## 📦 Package Management & Workspace Commands

- **Install dependencies:** `pnpm install`
- **Add a dependency to a package:**
  ```bash
  pnpm --filter <package-name> add <package>
  ```
- **Run a script in a package:**
  ```bash
  pnpm --filter <package-name> run <script>
  ```
- **Update dependencies:** `pnpm update`
- **Remove a dependency:**
  ```bash
  pnpm --filter <package-name> remove <package>
  ```

---

## 📝 Versioning & Release Workflow (Changesets)

We use [Changesets](https://github.com/changesets/changesets) for versioning and changelog management.

### Adding a Changeset
1. After making code changes, run:
   ```bash
   pnpm changeset
   ```
2. Follow the prompts to describe your changes and select affected packages.
3. Commit the generated `.md` file in `.changeset/` with your PR.

### Releasing New Versions
1. **Version packages and update changelogs:**
   ```bash
   pnpm changeset version
   pnpm install
   ```
2. **Build all packages:**
   First make sure `.env` is configured for mainnet, then:
   ```bash
   pnpm run build
   ```
3. **Build and publish to npm:**
   ```bash
   pnpm changeset publish
   ```
4. **Stage the frontend release:**
   ```bash
   pnpm run stage
   ```
   _This step prepares the release for publishing and may generate a content hash._
5. **Publish the resulting hash on ENS:**
   - After publishing, update your ENS domain's contenthash record with the new hash (e.g., via the ENS Manager or CLI).
   - https://app.ens.domains/new.simplepage.eth?tab=records

- See [Changesets documentation](https://github.com/changesets/changesets) for more details.

---

## 📄 License

This project is licensed under the GPL-3.0-only License - see the [LICENSE](./LICENSE) file for details.

## 🤝 Support

- **User Docs:** [https://simplepage.eth.link](https://simplepage.eth.link)
- **Issues:** Report bugs and feature requests via GitHub Issues
- **Discussions:** Join community discussions on GitHub Discussions

---

**Built with ❤️ for the decentralized web**

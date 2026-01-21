# Agent Rules for SimplePage Project

## Package Management
- Always use `pnpm` for installing, updating, and managing JavaScript packages
- Never use `npm` or `yarn` for package operations
- Use `pnpm install` instead of `npm install`
- Use `pnpm add <package>` instead of `npm install <package>`
- Use `pnpm remove <package>` instead of `npm uninstall <package>`
- Use `pnpm update` instead of `npm update`
- Use `pnpm run <script>` instead of `npm run <script>`

## Project Structure
- This is a monorepo using pnpm workspaces
- Main packages are in `/packages/` directory
- Frontend app is in `/frontend/` directory
- Contracts are in `/contracts/` directory
- Use workspace dependencies with `workspace:*` syntax

## Development Workflow
- When suggesting package installations, always use pnpm commands
- When running scripts, use `pnpm run <script>` format
- For workspace operations, use `pnpm --filter <package-name> <command>`
- For adding dependencies to specific workspaces, use `pnpm --filter <package-name> add <package>`

## Code Style
- Follow existing code style and patterns
- Use ES6+ features where appropriate
- Maintain consistent formatting
- Follow the project's existing naming conventions

## File Handling
- Always read the current state of files before making modifications
- Respect changes made by the user between conversations
- Never rely on cached or previously read file contents
- Use the Read tool to check file contents before any edit operations
- If a file modification fails due to "file has been modified since last read", always re-read the file before attempting the change again
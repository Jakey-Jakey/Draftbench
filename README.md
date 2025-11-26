# auto-draftify

An AI-powered essay generation, review, and revision pipeline using OpenRouter via the Vercel AI SDK.

## Setup

To install dependencies:

```bash
bun install
```

## Configuration

Set the `OPENROUTER_API_KEY` environment variable:

```bash
export OPENROUTER_API_KEY=your_api_key_here
```

Or create a `.env` file:

```
OPENROUTER_API_KEY=your_api_key_here
```

## Usage

To run:

```bash
bun run index.ts
```

The CLI will prompt you for an essay topic, then:

1. Generate an initial essay using model A
2. Review the essay using model B
3. Generate a revised essay using model A with the feedback

All outputs are saved as markdown files in the `runs/` directory.

This project was created using `bun init` in bun v1.3.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

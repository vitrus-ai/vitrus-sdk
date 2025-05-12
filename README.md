# Vitrus
![latest version](https://badgen.net/npm/v/vitrus?label=latest)](https://www.npmjs.com/package/vitrus)
[![license](https://badgen.net/github/vitrus-ai/vitrus-sdk?color=cyan)](https://github.com/vitrus-ai/vitrus-sdk/blob/main/LICENSE)
[![install size](https://badgen.net/packagephobia/install/vitrus?label=npm+install)](https://packagephobia.now.sh/result?p=vitrus)
[![NPM downloads weekly](https://badgen.net/npm/dw/vitrus?label=npm+downloads&color=purple)](https://www.npmjs.com/package/vitrus)

A TypeScript client for interfacing with the Vitrus WebSocket server. This library provides an Actor/Agent communication model with workflow orchestration.

## Installation

```bash
# Using npm
npm install vitrus

# Using yarn
yarn add vitrus

# Using bun
bun add vitrus
```

## Basic Workflow

```typescript
import Vitrus from "vitrus";

// Initialize the client with all options
const vitrus = new Vitrus({
  apiKey: "<your-api-key>",
  world: "<world-id>", //optional, needed only if using actors and scenes
  debug: true, //optional, default is false
  baseUrl: "ws://host:port", //optional
});

// perception encoders
const output = await vitrus.workflow("perception-encoder", {
  image: "image_url",
});
```

## Available Workflows

The current available workflows are:

| name                 | price (USD) | avg. time |
| -------------------- | ----------- | --------- |
| `perception-encoder` | $0.2        | 7s        |
| `generate-object`    | $0.4        | 120s      |

## Custom base URL

```typescript
import Vitrus from "vitrus";

// Initialize the client
const vitrus = new Vitrus({
  apiKey: "your-api-key",
  baseUrl: "ws://localhost:3001", //hosted Vitrus URL
});
```

# Basic World

```ts
import Vitrus from "vitrus";

//authenticate with API key
const vitrus = new Vitrus({
  world: "world-uuid",
  apiKey: "...",
});

//creates or finds an actor named <actor-name>; by default picks the last one
const actor = vitrus.actor("<actor-name>", { details: "it's a robot" });

/* This registers an action and
everytime any agent calls this actor's action, it will run the following*/
actor.on("<action-name>", () => {
  const output = "hellow world";
  return output;
});
```

## API Reference

### Vitrus Class

#### Constructor

```typescript
new Vitrus({
  apiKey: string,
  world: string, // Optional
  baseUrl: string, // Optional default is dao.vitrus.ai
  debug: true,
});
```
### Descentralized Actor Orchestration (DAO)
Vitrus workflows, worlds, actors and agents runs on top of DAO. A lightweight cloud system that enables the cross-communication of agents-world-actors. The best illustration of this system is: 木.

# Vitrus

[![latest version](https://badgen.net/npm/v/vitrus?label=latest)](https://www.npmjs.com/package/vitrus)
[![install size](https://badgen.net/packagephobia/install/vitrus?label=npm+install)](https://packagephobia.now.sh/result?p=vitrus)
[![NPM downloads weekly](https://badgen.net/npm/dw/vitrus?label=npm+downloads&color=purple)](https://www.npmjs.com/package/vitrus)

A TypeScript client for interfacing with the Vitrus server. This library provides a multi Actor/Agent communication model with workflow orchestration.

## Documentation

For detailed documentation go to [Vitrus Documentation](https://vitrus.gitbook.io/docs/concepts).

## Installation

```bash
# Using npm
npm install vitrus

# Using bun
bun add vitrus
```

## Authentication

[Get an API Key](https://app.vitrus.ai)

```typescript
import Vitrus from "vitrus";

// Initialize the client with all options
const vitrus = new Vitrus({
  apiKey: process.env["VITRUS_API_KEY"],
});
```

<br/>

# Workflows

**Workflows** have a similar schema as AI tools, so it connects perfectly with [OpenAI function Calling](https://platform.openai.com/docs/guides/function-calling?api-mode=chat). Making Workflows great to compose complex physical tasks with AI Agents. The following is a simple example of how to run a workflow:

```typescript
// running a basic workflow
const result = await vitrus.workflow("hello-world", {
  prompt: "hello world!",
});

console.log(result);
```

Workflows are executed in Cloud GPUs (e.g. `Nvidia A100`), and combine multiple AI models for complex tasks.

## Available Workflows

We are continously updating the available workflows, and keeping them up to date with state-of-the-art (SOTA) AI models. For the latest list of workflows, you can execute:

```ts
const workflows = vitrus.list_workflows();
console.log(workflows);
```

<details><summary>Example JSON Response</summary>

```json
[
  {
    "type": "function",
    "function": {
      "name": "perception-encoder",
      "description": "Encodes perception data based on specified parameters.",
      "parameters": {
        "type": "object",
        "properties": {
          "inputData": {
            "type": "object",
            "description": "The raw data to encode.",
            "additionalProperties": true
          },
          "encodingType": {
            "type": "string",
            "description": "The encoding method to use (e.g., 'base64', 'json')."
          }
        },
        "required": ["inputData"]
      }
    }
  }
]
```

</details>

<br/>

# Worlds and Actors

Create a world at [app.vitrus.ai](https://app.vitrus.ai).

```typescript
import Vitrus from "vitrus";

// Initialize the client
const vitrus = new Vitrus({
  apiKey: "your-api-key",
  baseUrl: "ws://localhost:3001", //hosted Vitrus URL
});
```

## Actors

```ts
import Vitrus from "vitrus";

const vitrus = new Vitrus({
  apiKey: "<your-api-key>",
  world: "<world-id>",
});

const actor = await vitrus.actor("forest", {
  human: "Tom Hanks",
  eyes: "green",
});

actor.on("walk", (args: any) => {
  console.log("received", args);
  return "run forest, run!";
});
```

## Agents

On the Agent side, once connected to, the actor can be treated as "functions".

```ts
import Vitrus from "vitrus";

const vitrus = new Vitrus({
  apiKey: "<your-api-key>",
  world: "<world-id>", //must match actor's world
});

const actor = await vitrus.actor("forest");

const resp = await actor.run("walk", {
  direction: "front",
});
```

---

# How Vitrus works internally

Vitrus workflows, worlds, actors and agents runs on top of Distributed Actor Orchestration (DAO). A lightweight cloud system that enables the cross-communication of agents-world-actors.

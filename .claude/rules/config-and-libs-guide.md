# Config & Lib Files Guide

Once the project is set up and dependencies are installed, create the config and lib files for each package/library that requires initialization or runtime usage.

## Config Files (`src/config/`)

Config files handle **only** the configuration and initialization of a library — nothing else. No business logic, no utility functions, no usage code.

Each library that needs initialization gets its own config file named `<library>.config.ts`.

**What goes in a config file:**
- Importing the library
- Reading any required env vars or credentials
- Initializing/configuring the library instance
- Exporting the initialized instance

**Examples:**

`env.config.ts` — reads env vars via dotenv, exports a single `ENV_CONFIG` object:

```ts
import { config } from "dotenv";
config();

const ENV_CONFIG = {
  PORT: Number(process.env.PORT) || 4000,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.toString().split(",") ?? [],
  DATABASE_URL: process.env.DATABASE_URL,
};

export default ENV_CONFIG;
```

`firebase.config.ts` — initializes Firebase Admin SDK, exports the instance:

```ts
import admin from "firebase-admin";

var serviceAccount = require("../../firebase-service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export const firebaseAdmin = admin;
```

`prisma.config.ts` — defines Prisma config (schema path, migrations, datasource):

```ts
import { defineConfig } from "prisma/config";
import ENV_CONFIG from "./env.config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: ENV_CONFIG.DATABASE_URL,
  },
});
```

## Lib Files (`src/lib/`)

Lib files define the **actual functions** used from the libraries throughout the codebase. They import from the config files and expose focused, domain-specific methods.

**Key rules:**

1. **Isolate by domain** — split lib files by the feature/domain area of the library, not one giant file per library. For example:
   - `firebase.auth.ts` — Firebase Auth methods (verify token, get user, etc.)
   - `firebase.storage.ts` — Firebase Storage methods (upload, download, etc.)
   - `prisma.ts` — Prisma client instance export

2. **Handle errors gracefully** — every method in a lib file must catch library-specific errors and convert them to `AppError` instances. Never let raw library errors leak out to services or controllers.

3. **Export as a named object** — group all methods into a single named export object (e.g. `FirebaseAuth`, `FirebaseStorage`).

**Example:**

`firebase.auth.ts` — wraps Firebase Auth methods, catches errors, converts to AppError:

```ts
import { DecodedIdToken } from "firebase-admin/lib/auth/token-verifier";
import { firebaseAdmin } from "../config/firebase.config";
import { Errors } from "../errors/app.errors";

const auth = firebaseAdmin.auth();

async function verifyToken(token: string): Promise<DecodedIdToken> {
  try {
    return await auth.verifyIdToken(token);
  } catch (e: any) {
    throw Errors.unauthorized("Invalid or expired token");
  }
}

const FirebaseAuth = {
  verifyToken,
};

export default FirebaseAuth;
```

`prisma.ts` — instantiates and exports the Prisma client:

```ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
```

## Checklist

After setup, go through every installed package and ask:

1. Does it need initialization? → create a `src/config/<library>.config.ts`
2. Does it expose methods the codebase will call? → create `src/lib/<library>.<domain>.ts` files

Do NOT proceed to building modules/features until all config and lib files are in place.

## Rules

1. Config files contain only initialization — no business logic, no utility functions.
2. Lib files must always catch library-specific errors and convert them to `AppError`. Never let raw library errors propagate.
3. Lib files are split by domain (e.g. `firebase.auth.ts`, `firebase.storage.ts`), not one file per library.
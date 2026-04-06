# CharacterForge JS

TypeScript SDK for [CharacterForge](https://characterforge.app)—AI-powered stylized 3D character image generation for browsers, Node.js, and React Native.

[![npm version](https://img.shields.io/npm/v/characterforge-js.svg)](https://www.npmjs.com/package/characterforge-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Character generation** — Configure appearance (gender, skin, hair, clothing, eyes, accessories) and receive a PNG image URL from the CharacterForge API.
- **No runtime dependencies** — The package itself ships without npm dependencies; it uses `fetch` and platform APIs.
- **Client-side caching** — IndexedDB on web; file system + metadata storage on React Native (optional peer-style installs).
- **Retries** — Exponential backoff with jitter for transient failures.
- **Typed** — Written in TypeScript with exported types for configuration and errors.

## Requirements

- **Node.js** — `>=16` per `package.json`. The client uses the global `fetch` API; use **Node 18+** (or provide a `fetch` polyfill) in Node environments.
- **Browser** — Modern browsers with `fetch` and IndexedDB for the default web cache.
- **React Native** — For native caching, install a file-system package and AsyncStorage (see below).

## Installation

```bash
npm install characterforge-js
```

### React Native (caching)

Caching on React Native uses `expo-file-system` *or* `react-native-fs`, plus AsyncStorage for metadata. Install what matches your app:

**Expo:**

```bash
npx expo install expo-file-system @react-native-async-storage/async-storage
```

**Bare React Native:**

```bash
npm install react-native-fs @react-native-async-storage/async-storage
```

If these are not installed, the SDK falls back to a no-op cache on unsupported environments.

## Quick start

### Web or Node

```typescript
import { createCharacterForgeClient } from 'characterforge-js';

const client = createCharacterForgeClient({
  apiKey: process.env.CHARACTERFORGE_API_KEY!,
});

const imageUrl = await client.generate({
  gender: 'female',
  skinTone: 'medium',
  hairStyle: 'bob',
  hairColor: 'brown',
  clothing: 'hoodie',
  clothingColor: 'blue',
  eyeColor: 'brown',
  accessories: ['glasses'],
  transparent: true,
});

console.log(imageUrl);
```

### React Native

```typescript
import { createCharacterForgeClient } from 'characterforge-js';
import { Image, Button } from 'react-native';
import React from 'react';

const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
});

function MyComponent() {
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  const generateCharacter = async () => {
    const url = await client.generate({
      gender: 'male',
      skinTone: 'light',
      hairStyle: 'quiff',
      hairColor: 'blonde',
      clothing: 'tshirt',
      clothingColor: 'red',
      eyeColor: 'blue',
      accessories: ['cap'],
      transparent: true,
    });
    setImageUrl(url);
  };

  return (
    <>
      <Button title="Generate Character" onPress={generateCharacter} />
      {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: 300, height: 300 }} /> : null}
    </>
  );
}
```

## API

### `createCharacterForgeClient(config)`

Returns a `CharacterForgeClient` instance.

**`CharacterForgeClientConfig`:**

| Option | Description |
| --- | --- |
| `apiKey` | **Required.** API key from CharacterForge. |
| `baseUrl` | Optional. API base URL (must expose `POST .../generate-character`). Defaults to the production CharacterForge backend. |
| `cache` | Enable client cache (default: `true`). |
| `cacheManager` | Optional custom `CacheManager` implementation. |
| `timeout` | Request timeout in ms (default: `60000`). |
| `retry` | `{ maxRetries, baseDelayMs, maxDelayMs }` — defaults: `3`, `1000`, `10000`. |

### `client.generate(config, onStatusUpdate?)`

- **`config`** — `CharacterConfig` (see types in the package or below).
- **`onStatusUpdate`** — Optional `(status: string) => void` for messages such as `"Calling AI Cloud..."`, `"Caching result..."`, `"Retrieved from Client Cache!"`.

Returns `Promise<string>` — URL of the generated image (often a blob URL when cached on web).

### `client.clearCache()`

Clears the client-side cache. Returns `Promise<void>`.

### `client.destroy()`

Releases resources (e.g. cache manager cleanup). Call when the client is no longer needed.

### `VERSION`

The package exports `VERSION` (string) matching the published SDK version.

## `CharacterConfig` (summary)

| Field | Notes |
| --- | --- |
| `gender` | `'male' \| 'female'` |
| `ageGroup` | Optional: `'kid' \| 'preteen' \| 'teen' \| 'young_adult' \| 'adult'` |
| `skinTone` | e.g. `'porcelain'` … `'deep'` (see `SkinToneId` in types) |
| `hairStyle` | e.g. `'bob'`, `'quiff'`, `'afro'`, … (`HairStyleId`) |
| `hairColor` | (`HairColorId`) |
| `clothing` | (`ClothingItemId`) |
| `clothingColor` | (`ClothingColorId`) |
| `eyeColor` | (`EyeColorId`) |
| `accessories` | `AccessoryId[]` — e.g. `'none'`, `'glasses'`, `'cap'` |
| `transparent` | Whether the image uses a transparent background |
| `cache` | Optional per-request override for caching |

Import the full unions from `characterforge-js`:

```typescript
import type {
  CharacterConfig,
  CharacterForgeClientConfig,
  Gender,
  SkinToneId,
  HairStyleId,
} from 'characterforge-js';
```

## Errors

The SDK throws typed errors. Common API-related classes (also re-exported from the main entry):

- `AuthenticationError` — Invalid or missing API key.
- `InsufficientCreditsError` — Not enough credits.
- `RateLimitError` — HTTP 429 / too many requests.
- `NetworkError` — Timeouts and network failures.
- `ApiError` — Other API HTTP errors that participate in retries.
- `GenerationError` — Generation or response parsing failures.

`CharacterForgeError` is an **alias** for `GenerationError` (exported from the client module for backward compatibility).

Additional utilities and types live under the same package:

```typescript
import {
  AppError,
  AuthorizationError,
  ImageProcessingError,
  ValidationError,
  ConfigValidationError,
  CacheError,
  PaymentError,
  isAppError,
  isAuthenticationError,
  isInsufficientCreditsError,
  isNetworkError,
  isRateLimitError,
  parseError,
  getUserFriendlyMessage,
} from 'characterforge-js';
```

## Caching

- **Web** — `WebCacheManager` uses IndexedDB, caps entries (e.g. 100), and expires old data (e.g. 7 days). Object URLs are managed to reduce leaks.
- **React Native** — `NativeCacheManager` stores files under a cache directory and keeps metadata in AsyncStorage.
- **Override** — Pass `cache: false` in client config or per `generate()` call. Implement `CacheManager` for custom storage.

Advanced exports: `createCacheManager`, `WebCacheManager`, `NativeCacheManager`, `isBrowser`, `isReactNative`.

## Advanced configuration

**Custom base URL** (self-hosted or staging):

```typescript
const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-deployment.example.com/functions/v1',
});
```

The client calls `POST ${baseUrl}/generate-character`.

**Timeout and retries** — Set `timeout` and `retry` on the client config as needed.

## Logging

For debugging integrations, the package exports `Logger`, `logger`, `sdkLogger`, and types `LogLevel`, `LogEntry`, `LoggerConfig`.

## API key

1. Open [characterforge.app](https://characterforge.app) and sign in.
2. Use the developer/dashboard area to create an API key.
3. Keep keys out of source control; use environment variables or your host’s secret storage.

## Repository and issues

- **Repository:** [github.com/inceptivco/ToyForge](https://github.com/inceptivco/ToyForge) (this SDK lives under the `sdk` directory in that monorepo).
- **Issues:** [github.com/inceptivco/ToyForge/issues](https://github.com/inceptivco/ToyForge/issues)

## License

MIT © CharacterForge

## Contributing

Contributions are welcome via pull requests against the repository above.

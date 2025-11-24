# CharacterForge SDK

AI-powered 3D character generation SDK for web and React Native applications.

[![npm version](https://img.shields.io/npm/v/characterforge.svg)](https://www.npmjs.com/package/characterforge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🎨 **Generate stylized 3D vinyl toy characters** using AI
- ⚡ **Zero dependencies** - lightweight and fast
- 🔄 **Built-in caching** - IndexedDB for web, file system for React Native
- 🔁 **Automatic retry logic** - with exponential backoff
- 📱 **Cross-platform** - works on web and React Native
- 🎯 **TypeScript support** - fully typed for excellent IDE support
- 🖼️ **Transparent backgrounds** - production-ready PNG images

## Installation

```bash
npm install characterforge
```

### React Native Additional Setup

For React Native, you'll need to install one of the following file system packages:

**Expo:**
```bash
npx expo install expo-file-system @react-native-async-storage/async-storage
```

**Bare React Native:**
```bash
npm install react-native-fs @react-native-async-storage/async-storage
```

## Quick Start

### Web / React

```typescript
import { createCharacterForgeClient } from 'characterforge';

// Create a client instance
const client = createCharacterForgeClient({
  apiKey: 'your-api-key-here',
});

// Generate a character
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

// Use the image URL
console.log('Generated image:', imageUrl);
```

### React Native

```typescript
import { createCharacterForgeClient } from 'characterforge';
import { Image } from 'react-native';

// Create a client instance
const client = createCharacterForgeClient({
  apiKey: 'your-api-key-here',
});

// In your component
function MyComponent() {
  const [imageUrl, setImageUrl] = React.useState(null);

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
      {imageUrl && <Image source={{ uri: imageUrl }} style={{ width: 300, height: 300 }} />}
    </>
  );
}
```

## API Reference

### `createCharacterForgeClient(config)`

Creates a new SDK client instance.

**Parameters:**

- `config` - Client configuration object

**Configuration Options:**

```typescript
interface CharacterForgeClientConfig {
  /** API key for authentication (required) */
  apiKey: string;
  
  /** Base URL for the API (optional, defaults to production) */
  baseUrl?: string;
  
  /** Enable/disable client-side caching (default: true) */
  cache?: boolean;
  
  /** Custom cache manager implementation (optional) */
  cacheManager?: CacheManager;
  
  /** Request timeout in milliseconds (default: 60000) */
  timeout?: number;
  
  /** Retry configuration (optional) */
  retry?: {
    maxRetries: number;      // default: 3
    baseDelayMs: number;     // default: 1000
    maxDelayMs: number;      // default: 10000
  };
}
```

**Returns:** `CharacterForgeClient` instance

### `client.generate(config, onStatusUpdate?)`

Generates a character image based on the provided configuration.

**Parameters:**

- `config` - Character configuration object
- `onStatusUpdate` (optional) - Callback function for status updates

**Character Configuration:**

```typescript
interface CharacterConfig {
  /** Gender: 'male' | 'female' */
  gender: Gender;
  
  /** Age group (optional): 'kid' | 'preteen' | 'teen' | 'young_adult' | 'adult' */
  ageGroup?: AgeGroupId;
  
  /** Skin tone: 'porcelain' | 'fair' | 'light' | 'medium' | 'olive' | 'brown' | 'dark' | 'deep' */
  skinTone: SkinToneId;
  
  /** Hair style: 'bob' | 'ponytail' | 'buns' | 'long' | 'pixie' | 'undercut' | 'quiff' | 'sidepart' | 'buzz' | 'combover' | 'messy' | 'afro' | 'curly' */
  hairStyle: HairStyleId;
  
  /** Hair color: 'black' | 'dark_brown' | 'brown' | 'auburn' | 'ginger' | 'dark_blonde' | 'blonde' | 'platinum' | 'grey' | 'white' | 'blue' | 'purple' */
  hairColor: HairColorId;
  
  /** Clothing: 'tshirt' | 'hoodie' | 'sweater' | 'jacket' | 'tank' | 'dress' | 'blouse' | 'polo' | 'buttonup' | 'henley' */
  clothing: ClothingItemId;
  
  /** Clothing color: 'white' | 'black' | 'navy' | 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'pink' | 'orange' | 'teal' */
  clothingColor: ClothingColorId;
  
  /** Eye color: 'dark' | 'brown' | 'blue' | 'green' | 'hazel' | 'grey' */
  eyeColor: EyeColorId;
  
  /** Accessories: array of 'none' | 'glasses' | 'sunglasses' | 'headphones' | 'cap' | 'beanie' */
  accessories: AccessoryId[];
  
  /** Generate with transparent background (default: true) */
  transparent: boolean;
  
  /** Use caching for this generation (default: true) */
  cache?: boolean;
}
```

**Returns:** `Promise<string>` - URL to the generated image

**Example with status updates:**

```typescript
const imageUrl = await client.generate(
  {
    gender: 'female',
    skinTone: 'medium',
    hairStyle: 'bob',
    hairColor: 'brown',
    clothing: 'hoodie',
    clothingColor: 'blue',
    eyeColor: 'brown',
    accessories: ['glasses'],
    transparent: true,
  },
  (status) => {
    console.log('Status:', status);
    // "Calling AI Cloud..."
    // "Caching result..."
    // "Retrieved from Client Cache!"
  }
);
```

### `client.clearCache()`

Clears all cached images.

**Returns:** `Promise<void>`

```typescript
await client.clearCache();
```

## Error Handling

The SDK provides specific error classes for different failure scenarios:

```typescript
import { 
  AuthenticationError,
  InsufficientCreditsError,
  NetworkError,
  RateLimitError,
  GenerationError,
} from 'characterforge';

try {
  const imageUrl = await client.generate(config);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof InsufficientCreditsError) {
    console.error('Not enough credits. Please purchase more.');
  } else if (error instanceof NetworkError) {
    console.error('Network error. Please check your connection.');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limited. Please slow down.');
  } else if (error instanceof GenerationError) {
    console.error('Generation failed:', error.message);
  }
}
```

## Caching

The SDK automatically caches generated images to reduce API calls and improve performance.

### Web Caching

- Uses **IndexedDB** for persistent storage
- Automatically manages object URLs to prevent memory leaks
- Configurable cache size (default: 100 images)
- Auto-expires after 7 days
- Automatically cleans up old entries

### React Native Caching

- Uses **file system** for image storage
- Uses **AsyncStorage** for metadata
- Platform-specific implementations for Expo and bare React Native
- Same cache size and expiry settings as web

### Disabling Cache

You can disable caching globally or per-request:

```typescript
// Disable globally
const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  cache: false,
});

// Disable per-request
const imageUrl = await client.generate({
  ...config,
  cache: false,
});
```

### Custom Cache Manager

For advanced use cases, you can provide a custom cache implementation:

```typescript
import { CacheManager } from 'characterforge';

class MyCustomCache implements CacheManager {
  async get(key: string): Promise<string | null> {
    // Your implementation
  }

  async set(key: string, data: Blob | string): Promise<string> {
    // Your implementation
  }

  async clear(): Promise<void> {
    // Your implementation
  }
}

const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  cacheManager: new MyCustomCache(),
});
```

## Advanced Configuration

### Custom Base URL

If you're self-hosting or using a custom endpoint:

```typescript
const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://your-custom-domain.com/functions/v1',
});
```

### Custom Timeout

Adjust the request timeout (default is 60 seconds):

```typescript
const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  timeout: 30000, // 30 seconds
});
```

### Custom Retry Configuration

Adjust the retry behavior:

```typescript
const client = createCharacterForgeClient({
  apiKey: 'your-api-key',
  retry: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 20000,
  },
});
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  CharacterConfig,
  CharacterForgeClientConfig,
  Gender,
  SkinToneId,
  HairStyleId,
  // ... and more
} from 'characterforge';
```

All types are exported for your convenience, enabling excellent IDE autocomplete and type checking.

## Examples

### Complete React Component

```tsx
import React, { useState } from 'react';
import { createCharacterForgeClient } from 'characterforge';

const client = createCharacterForgeClient({
  apiKey: process.env.REACT_APP_CHARACTER_FORGE_KEY!,
});

export function CharacterGenerator() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const url = await client.generate(
        {
          gender: 'female',
          skinTone: 'medium',
          hairStyle: 'bob',
          hairColor: 'brown',
          clothing: 'hoodie',
          clothingColor: 'blue',
          eyeColor: 'brown',
          accessories: ['glasses'],
          transparent: true,
        },
        (status) => setStatus(status)
      );
      
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Character'}
      </button>
      
      {status && <p>Status: {status}</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      
      {imageUrl && (
        <img 
          src={imageUrl} 
          alt="Generated character" 
          style={{ width: 300, height: 300 }}
        />
      )}
    </div>
  );
}
```

## Getting an API Key

1. Visit [characterforge.app](https://characterforge.app)
2. Sign up for an account
3. Navigate to the Developer Dashboard
4. Create a new API key
5. Copy your API key and use it in your application

**Important:** Keep your API key secret and never commit it to version control. Use environment variables or secure key management systems.

## Support

- 📧 Email: support@characterforge.app
- 🐛 Issues: [GitHub Issues](https://github.com/characterforge/sdk/issues)
- 📖 Documentation: [characterforge.app/docs](https://characterforge.app/docs)

**Note:** This package is published as `characterforge` on npm.

## License

MIT © CharacterForge

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.


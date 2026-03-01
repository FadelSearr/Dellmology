// The backend endpoint where the token will be sent.
const UPDATE_TOKEN_ENDPOINT = 'http://localhost:3000/api/update-token';

// --- Helper Functions ---

/**
 * A simple in-memory store to avoid sending the same token repeatedly.
 */
const SyncedTokenStore = {
  lastToken: null,
  isSameAsLast(token) {
    return this.lastToken === token;
  },
  update(token) {
    this.lastToken = token;
  },
};

/**
 * Decodes a JWT token to extract its payload, including the expiration time.
 * @param {string} token The JWT token.
 * @returns {object|null} The decoded payload or null if decoding fails.
 */
function decodeJwt(token) {
  try {
    // A JWT is composed of three parts separated by dots. The middle part is the payload.
    const base64Url = token.split('.')[1];
    // Replace characters to make it a valid base64 string
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    // Decode the base64 string and parse it as JSON
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Dellmology Auth Helper: Failed to decode JWT', e);
    return null;
  }
}

/**
 * Sends the captured token to the Dellmology backend.
 * @param {string} token The bearer token.
 */
async function sendTokenToBackend(token) {
  if (SyncedTokenStore.isSameAsLast(token)) {
    // console.log('Dellmology Auth Helper: Token is unchanged. No update sent.');
    return;
  }

  console.log(`Dellmology Auth Helper: New token captured. Sending to backend...`);

  const payload = decodeJwt(token);
  // The 'exp' claim in JWT is in seconds since epoch. We convert it to an ISO string for the backend.
  const expires_at = payload && payload.exp ? new Date(payload.exp * 1000).toISOString() : null;

  try {
    const response = await fetch(UPDATE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, expires_at }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`Server responded with ${response.status}: ${errorBody.error}`);
    }

    console.log('Dellmology Auth Helper: Token successfully updated on the backend.');
    SyncedTokenStore.update(token);
  } catch (error) {
    console.error('Dellmology Auth Helper: Failed to send token to backend.', error);
    // If sending fails, we don't update the local store, so it will retry on the next capture.
  }
}

// --- Main Logic ---

/**
 * The core listener that intercepts network requests before headers are sent.
 */
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Find the 'Authorization' header in the request.
    const authHeader = details.requestHeaders.find(
      (header) => header.name.toLowerCase() === 'authorization'
    );

    if (authHeader && authHeader.value && authHeader.value.startsWith('Bearer ')) {
      // Extract the token string by removing "Bearer ".
      const token = authHeader.value.substring(7);
      // Asynchronously send the token to the backend without blocking the request.
      sendTokenToBackend(token);
    }
  },
  // Filter for requests to Stockbit API endpoints.
  { urls: ['*://api.stockbit.com/*', '*://stream.stockbit.com/*'] },
  // We need 'requestHeaders' to read the headers.
  ['requestHeaders']
);

console.log('Dellmology Auth Helper service worker started.');

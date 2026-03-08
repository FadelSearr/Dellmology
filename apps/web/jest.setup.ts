import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

if (!global.TextEncoder) {
	global.TextEncoder = TextEncoder as typeof global.TextEncoder;
}

if (!global.TextDecoder) {
	global.TextDecoder = TextDecoder as typeof global.TextDecoder;
}

// Suppress React testing-library act() warnings that are noisy in our CI logs.
// We still allow other console.error messages to surface.
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
	try {
		const msg = args[0] && typeof args[0] === 'string' ? args[0] : '';
		if (msg.includes('not wrapped in act') || msg.includes('An update to')) {
			return;
		}
	} catch (e) {
		// fall through to original
	}
	originalConsoleError.apply(console, args as any);
};

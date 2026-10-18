// Runtime switches. See .env.example and docs/GOOGLE_INTEGRATION.md.
const hostedDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';
export const config = {
  hostedDemo,
  apiMode: (hostedDemo ? 'mock' : import.meta.env.VITE_API_MODE ?? 'mock') as 'mock' | 'live',
  authMode: (hostedDemo ? 'demo' : import.meta.env.VITE_AUTH_MODE ?? 'demo') as 'demo' | 'firebase',
  babyApiUrl: import.meta.env.VITE_BABY_API_URL ?? 'http://localhost:8081',
  motherApiUrl: import.meta.env.VITE_MOTHER_API_URL ?? 'http://localhost:8082',
  demoAiUrl: import.meta.env.VITE_DEMO_AI_URL ?? import.meta.env.VITE_BABY_API_URL ?? 'https://crysense-baby-api-159523677067.asia-south1.run.app',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  },
};

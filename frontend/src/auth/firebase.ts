// Google sign-in via Firebase Authentication (VITE_AUTH_MODE=firebase).
// The ID token is sent to the Cloud Run APIs, which verify it with the Admin SDK.
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, RecaptchaVerifier, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink as completeEmailLink, signInWithPhoneNumber, signInWithPopup, signOut as fbSignOut, type ConfirmationResult } from 'firebase/auth';
import { config } from '../config';

function auth() {
  const app = getApps()[0] ?? initializeApp(config.firebase);
  return getAuth(app);
}

export async function signInWithGoogle(): Promise<{ uid: string; displayName: string; token: string }> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth(), provider);
  return { uid: cred.user.uid, displayName: cred.user.displayName ?? 'Caregiver', token: await cred.user.getIdToken() };
}

const EMAIL_LINK_KEY = 'crysense.email-link-address.v1';
let phoneConfirmation: ConfirmationResult | null = null;
let phoneRecaptcha: RecaptchaVerifier | null = null;

export function hasEmailSignInLink(): boolean {
  return isSignInWithEmailLink(auth(), window.location.href);
}

export function getEmailForSignInLink(): string {
  return window.localStorage.getItem(EMAIL_LINK_KEY) ?? '';
}

export async function sendEmailSignInLink(email: string): Promise<void> {
  await sendSignInLinkToEmail(auth(), email, { url: `${window.location.origin}/`, handleCodeInApp: true });
  window.localStorage.setItem(EMAIL_LINK_KEY, email);
}

export async function finishEmailSignInLink(email: string): Promise<{ uid: string; displayName: string; token: string }> {
  const credential = await completeEmailLink(auth(), email, window.location.href);
  window.localStorage.removeItem(EMAIL_LINK_KEY);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
  return { uid: credential.user.uid, displayName: credential.user.displayName ?? email, token: await credential.user.getIdToken() };
}

export async function sendPhoneOtp(phone: string): Promise<void> {
  phoneRecaptcha?.clear();
  phoneRecaptcha = new RecaptchaVerifier(auth(), 'recaptcha-container', { size: 'normal' });
  phoneConfirmation = await signInWithPhoneNumber(auth(), phone, phoneRecaptcha);
}

export async function finishPhoneOtp(code: string): Promise<{ uid: string; displayName: string; token: string }> {
  if (!phoneConfirmation) throw new Error('Send a verification code first.');
  const credential = await phoneConfirmation.confirm(code);
  phoneConfirmation = null;
  phoneRecaptcha?.clear();
  phoneRecaptcha = null;
  return { uid: credential.user.uid, displayName: credential.user.displayName ?? 'Caregiver', token: await credential.user.getIdToken() };
}

export async function refreshToken(): Promise<string | null> {
  return (await auth().currentUser?.getIdToken()) ?? null;
}

export async function signOutGoogle(): Promise<void> {
  await fbSignOut(auth());
}

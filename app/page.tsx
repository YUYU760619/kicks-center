'use client';
import { AuthGate } from './auth-gate';
import { PosApp } from './pos-app';
export default function Home() {
  return <AuthGate portal="staff"><PosApp /></AuthGate>;
}

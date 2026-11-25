/**
 * Home page: the chat app (client component). Access is guarded by src/proxy.ts.
 */
import { SneakoscopeApp } from "./_components/SneakoscopeApp";

/** Renders the app. */
export default function Home() {
  return <SneakoscopeApp />;
}

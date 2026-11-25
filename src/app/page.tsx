/**
 * Home page: the chat app (client component). Access is guarded by src/proxy.ts.
 */
import { ProphetApp } from "./_components/ProphetApp";

/** Renders the app. */
export default function Home() {
  return <ProphetApp />;
}

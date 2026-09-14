import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "./styles.css";
import App from "./App";
import ConfigWindow from "./ConfigWindow";
import { readSnapshot } from "./services/storage";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.error(error);
  }
  render() {
    return this.state.failed ? (
      <div className="fatal">
        <h1>Let’s take a moment.</h1>
        <p>SESH could not display this screen.</p>
        <button onClick={() => location.reload()}>Reopen SESH</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
void readSnapshot().then((initial) => {
  const params = new URLSearchParams(location.search);
  const isConfig = params.get("view") === "config";
  const requestedPanel = params.get("panel");
  const initialPanel =
    requestedPanel === "library" ||
    requestedPanel === "share" ||
    requestedPanel === "calendar"
      ? requestedPanel
      : "appearance";
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      {isConfig ? (
        <ConfigWindow initial={initial} initialPanel={initialPanel} />
      ) : (
        <App initial={initial} />
      )}
    </ErrorBoundary>,
  );
});

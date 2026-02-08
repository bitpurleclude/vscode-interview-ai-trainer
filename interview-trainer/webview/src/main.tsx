import React from "react";
import ReactDOM from "react-dom/client";
import InterviewTrainer from "./InterviewTrainer";
import "./index.css";
import { reportClientTrace } from "./messenger";


function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || "");
}

function it_registerGlobalErrorTrace(): void {
  window.addEventListener("error", (event) => {
    reportClientTrace({
      level: "error",
      event: "webview.runtime.window_error",
      status: "error",
      message: "webview global error captured",
      errorCode: "window_error",
      detail: {
        source: "window.error",
        text: event.message || "",
        filename: event.filename || "",
        lineno: event.lineno || 0,
        colno: event.colno || 0,
        error: it_errorMessage(event.error),
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportClientTrace({
      level: "error",
      event: "webview.runtime.unhandled_rejection",
      status: "error",
      message: "webview unhandled promise rejection captured",
      errorCode: "unhandled_rejection",
      detail: {
        source: "window.unhandledrejection",
        reason: it_errorMessage(event.reason),
      },
    });
  });
}

// Let the boot screen know the bundle executed.
(window as any).__itScriptLoaded = true;
it_registerGlobalErrorTrace();

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <InterviewTrainer />
    </React.StrictMode>,
  );
}

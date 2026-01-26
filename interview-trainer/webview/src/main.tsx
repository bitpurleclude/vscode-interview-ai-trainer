import React from "react";
import ReactDOM from "react-dom/client";
import InterviewTrainer from "./InterviewTrainer";
import "./index.css";

// Let the boot screen know the bundle executed.
(window as any).__itScriptLoaded = true;

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <InterviewTrainer />
    </React.StrictMode>,
  );
}
